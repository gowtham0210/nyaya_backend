const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  pool,
  startTestServer,
  call,
  registerTestUser,
  loginAsAdmin,
  deleteTestUser,
  createTestQuiz,
} = require('./helpers');

let server;
let adminToken;

before(async () => {
  server = await startTestServer();
  adminToken = await loginAsAdmin(server.baseUrl);
});

after(async () => {
  await server.close();
  await pool.end();
});

test('spending deducts credits and a second spend past the balance is refused', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    // Drain the 100-credit starting balance in four 25-credit spends.
    for (let i = 0; i < 4; i += 1) {
      const spent = await call(server.baseUrl, 'POST', '/credits/spend', user.accessToken, {
        reason: 'quiz_entry',
      });
      assert.equal(spent.status, 200);
      assert.equal(spent.body.success, true);
      assert.equal(spent.body.credits, 100 - (i + 1) * 25);
    }

    const overdrawn = await call(server.baseUrl, 'POST', '/credits/spend', user.accessToken, {
      reason: 'quiz_entry',
    });
    assert.equal(overdrawn.status, 200);
    assert.equal(overdrawn.body.success, false);
    assert.equal(overdrawn.body.credits, 0);
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('a spend can be refunded exactly once — a second refund of the same transaction is rejected', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    const spent = await call(server.baseUrl, 'POST', '/credits/spend', user.accessToken, {
      reason: 'quiz_entry',
    });
    assert.equal(spent.body.credits, 75);
    const transactionId = spent.body.transactionId;

    const refunded = await call(
      server.baseUrl,
      'POST',
      `/credits/${transactionId}/refund`,
      user.accessToken
    );
    assert.equal(refunded.status, 200);
    assert.equal(refunded.body.credits, 100);

    // The loophole this closes: replaying the same refund must not pay out
    // twice, however many times a client (or an attacker) calls it.
    const doubleRefunded = await call(
      server.baseUrl,
      'POST',
      `/credits/${transactionId}/refund`,
      user.accessToken
    );
    assert.equal(doubleRefunded.status, 409);

    const balance = await call(server.baseUrl, 'GET', '/credits', user.accessToken);
    assert.equal(balance.body.credits, 100);
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('a wrong-answer penalty never takes the balance below zero', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    for (let i = 0; i < 4; i += 1) {
      await call(server.baseUrl, 'POST', '/credits/spend', user.accessToken, { reason: 'quiz_entry' });
    }
    await call(server.baseUrl, 'GET', '/credits', user.accessToken); // balance is 0 here

    const penalised = await call(server.baseUrl, 'POST', '/credits/penalty', user.accessToken);
    assert.equal(penalised.status, 200);
    assert.equal(penalised.body.credits, 0);
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('a level-journey chest only pays out once its four levels are completed, and only once total', async () => {
  // Plays the *real* seeded "legal-awareness-journey" Level 1-4 quizzes
  // rather than creating new ones — a synthetic quiz reusing "Level 1..4"
  // titles would collide with the real ones and corrupt the ordering the
  // chest math depends on.
  const [levelRows] = await pool.query(
    `
      SELECT q.id, q.slug
      FROM quizzes q
      INNER JOIN categories c ON c.id = q.category_id
      WHERE c.slug = 'legal-awareness-journey' AND q.slug REGEXP '-level-[1-4]$'
      ORDER BY q.slug ASC
    `
  );
  assert.equal(levelRows.length, 4, 'expected the seeded Level 1-4 quizzes to exist for this test');

  const user = await registerTestUser(server.baseUrl);

  try {
    // Claiming before all four levels are done is refused, not paid.
    const early = await call(server.baseUrl, 'POST', '/credits/chests/level/0/claim', user.accessToken);
    assert.equal(early.body.success, false);
    assert.equal(early.body.notReady, true);

    for (const level of levelRows) {
      const [[question]] = await pool.query(
        'SELECT id FROM questions WHERE quiz_id = ? LIMIT 1',
        [level.id]
      );
      const [[option]] = await pool.query(
        'SELECT id FROM question_options WHERE question_id = ? AND is_correct = 1 LIMIT 1',
        [question.id]
      );

      const started = await call(server.baseUrl, 'POST', '/quiz-attempts', user.accessToken, {
        quizId: level.id,
      });
      assert.equal(started.status, 201, `expected level ${level.slug} to accept a fresh attempt`);
      await call(server.baseUrl, 'POST', `/quiz-attempts/${started.body.id}/answers`, user.accessToken, {
        questionId: question.id,
        selectedOptionId: option.id,
      });
      await call(server.baseUrl, 'POST', `/quiz-attempts/${started.body.id}/submit`, user.accessToken);
    }

    const claimed = await call(server.baseUrl, 'POST', '/credits/chests/level/0/claim', user.accessToken);
    assert.equal(claimed.body.success, true);
    assert.equal(claimed.body.credits, 100); // capped at max, not 110

    // The loophole this closes: replaying the claim must not pay out twice.
    const replayed = await call(server.baseUrl, 'POST', '/credits/chests/level/0/claim', user.accessToken);
    assert.equal(replayed.body.success, false);
    assert.equal(replayed.body.alreadyClaimed, true);
  } finally {
    await deleteTestUser(user.user.id);
  }
});
