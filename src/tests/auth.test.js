const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  pool,
  startTestServer,
  call,
  registerTestUser,
  deleteTestUser,
} = require('./helpers');

let server;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
  await pool.end();
});

test('register issues tokens, a verification code, and starts unverified', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    assert.equal(user.user.emailVerified, false);
    assert.ok(user.accessToken);
    assert.ok(user.refreshToken);

    // login/gameplay is not blocked on verification
    const me = await call(server.baseUrl, 'GET', '/auth/me', user.accessToken);
    assert.equal(me.status, 200);

    const [[row]] = await pool.query('SELECT email_verification_hash FROM users WHERE id = ?', [
      user.user.id,
    ]);
    assert.ok(row.email_verification_hash, 'a verification code was issued on register');
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('verify-email: wrong code is rejected and counted, right code verifies', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    const wrong = await call(server.baseUrl, 'POST', '/auth/verify-email', null, {
      email: user.user.email,
      code: '000000',
    });
    assert.equal(wrong.status, 400);

    const [[afterWrong]] = await pool.query(
      'SELECT email_verification_attempts AS n FROM users WHERE id = ?',
      [user.user.id]
    );
    assert.equal(afterWrong.n, 1);

    // Set a known code the same way the mailer would have sent one, since we
    // don't have an inbox to read the real one from in this test environment.
    const knownCode = '654321';
    await pool.query(
      'UPDATE users SET email_verification_hash = ?, email_verification_expires_at = ?, email_verification_attempts = 0 WHERE id = ?',
      [
        crypto.createHash('sha256').update(knownCode).digest('hex'),
        new Date(Date.now() + 15 * 60 * 1000),
        user.user.id,
      ]
    );

    const right = await call(server.baseUrl, 'POST', '/auth/verify-email', null, {
      email: user.user.email,
      code: knownCode,
    });
    assert.equal(right.status, 204);

    const me = await call(server.baseUrl, 'GET', '/auth/me', user.accessToken);
    assert.equal(me.body.emailVerified, true);
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('resend-verification silently no-ops once already verified', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    await pool.query(
      'UPDATE users SET email_verified = 1, email_verification_hash = NULL WHERE id = ?',
      [user.user.id]
    );

    const resend = await call(server.baseUrl, 'POST', '/auth/resend-verification', null, {
      email: user.user.email,
    });
    assert.equal(resend.status, 200);

    const [[row]] = await pool.query('SELECT email_verification_hash AS h FROM users WHERE id = ?', [
      user.user.id,
    ]);
    assert.equal(row.h, null, 'no new code issued for an already-verified account');
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('change password: wrong current password rejected, right one revokes existing sessions', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    const wrongCurrent = await call(server.baseUrl, 'POST', '/users/me/password', user.accessToken, {
      currentPassword: 'not-the-password',
      newPassword: 'Password2!',
    });
    assert.equal(wrongCurrent.status, 400);

    const changed = await call(server.baseUrl, 'POST', '/users/me/password', user.accessToken, {
      currentPassword: user.password,
      newPassword: 'Password2!',
    });
    assert.equal(changed.status, 204);

    const oldRefreshRejected = await call(server.baseUrl, 'POST', '/auth/refresh', null, {
      refreshToken: user.refreshToken,
    });
    assert.equal(oldRefreshRejected.status, 401, 'old refresh token was revoked by the password change');

    const oldPasswordRejected = await call(server.baseUrl, 'POST', '/auth/login', null, {
      email: user.user.email,
      password: user.password,
    });
    assert.equal(oldPasswordRejected.status, 401);

    const newPasswordWorks = await call(server.baseUrl, 'POST', '/auth/login', null, {
      email: user.user.email,
      password: 'Password2!',
    });
    assert.equal(newPasswordWorks.status, 200);
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('forgot/reset password: generic reply either way, code single-use, lockout after 5 wrong tries', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    const genericMessage = 'If that email is registered, a reset code has been sent.';
    const forKnown = await call(server.baseUrl, 'POST', '/auth/forgot-password', null, {
      email: user.user.email,
    });
    const forUnknown = await call(server.baseUrl, 'POST', '/auth/forgot-password', null, {
      email: 'nobody-at-all@nyaya.test',
    });
    assert.equal(forKnown.body.message, genericMessage);
    assert.equal(forUnknown.body.message, genericMessage);

    const knownCode = '111222';

    async function setResetCode(attempts = 0) {
      await pool.query(
        'UPDATE users SET password_reset_hash = ?, password_reset_expires_at = ?, password_reset_attempts = ? WHERE id = ?',
        [
          crypto.createHash('sha256').update(knownCode).digest('hex'),
          new Date(Date.now() + 15 * 60 * 1000),
          attempts,
          user.user.id,
        ]
      );
    }

    await setResetCode();
    const wrongCode = await call(server.baseUrl, 'POST', '/auth/reset-password', null, {
      email: user.user.email,
      code: '000000',
      newPassword: 'Password3!',
    });
    assert.equal(wrongCode.status, 400);

    const rightCode = await call(server.baseUrl, 'POST', '/auth/reset-password', null, {
      email: user.user.email,
      code: knownCode,
      newPassword: 'Password3!',
    });
    assert.equal(rightCode.status, 204);

    const loginWithNew = await call(server.baseUrl, 'POST', '/auth/login', null, {
      email: user.user.email,
      password: 'Password3!',
    });
    assert.equal(loginWithNew.status, 200);

    // the same code cannot be reused
    const reused = await call(server.baseUrl, 'POST', '/auth/reset-password', null, {
      email: user.user.email,
      code: knownCode,
      newPassword: 'Password4!',
    });
    assert.equal(reused.status, 400);

    // 5 wrong attempts locks a fresh code out too
    await setResetCode(5);
    const lockedOut = await call(server.baseUrl, 'POST', '/auth/reset-password', null, {
      email: user.user.email,
      code: knownCode,
      newPassword: 'Password4!',
    });
    assert.equal(lockedOut.status, 400);
  } finally {
    await deleteTestUser(user.user.id);
  }
});
