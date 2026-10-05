const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/async-handler');
const {
  assertValidPassword,
  generateTokenPair,
  hashPassword,
  hashToken,
  comparePassword,
  verifyRefreshToken,
} = require('../../utils/auth');
const { sendPasswordResetCode, sendVerificationCode } = require('../../services/mailer');
const { issueCode, isCodeUsable } = require('../../services/verification-codes');
const { serializeUser } = require('../../utils/serializers');
const { badRequest, unauthorized, forbidden, notFound, conflict } = require('../../utils/errors');
const { requireFields } = require('../../utils/sql');
const { phonesMatch } = require('../../utils/phone');
const { verifyFirebaseIdToken, FirebaseAdminNotConfiguredError } = require('../../config/firebase');
const { ensureUserSummaryRows } = require('../../services/gamification');
const {
  assertRefreshTokenIsActive,
  getRefreshTokenExpiryDate,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  storeRefreshToken,
} = require('../../services/refresh-tokens');
const {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
} = require('../../utils/cookies');
const { authLimiter, sensitiveActionLimiter } = require('../../middleware/rate-limit');
const logger = require('../../utils/logger');

const router = express.Router();

const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;

router.post(
  '/register',
  sensitiveActionLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['fullName', 'email', 'password']);

    if (String(payload.password).length < 8) {
      throw badRequest('password must be at least 8 characters long');
    }

    const email = String(payload.email).trim().toLowerCase();
    const fullName = String(payload.fullName).trim();
    const phone = payload.phone ? String(payload.phone).trim() : null;

    const response = await withTransaction(async (connection) => {
      const passwordHash = await hashPassword(payload.password);
      const [result] = await connection.execute(
        `
          INSERT INTO users (
            full_name,
            email,
            phone,
            password_hash,
            status
          )
          VALUES (?, ?, ?, ?, 'active') RETURNING id
        `,
        [fullName, email, phone, passwordHash]
      );

      await ensureUserSummaryRows(connection, Number(result.insertId));

      const [rows] = await connection.execute(
        'SELECT id, full_name, email, phone, profession, avatar_url, email_verified, phone_verified, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
        [Number(result.insertId)]
      );
      const user = rows[0];
      const tokenPair = generateTokenPair(user);

      const refreshExpiry = await storeRefreshToken(connection, Number(user.id), tokenPair.refreshToken);
      const verificationCode = await issueCode(connection, {
        table: 'users',
        id: Number(user.id),
        columns: {
          hash: 'email_verification_hash',
          expiresAt: 'email_verification_expires_at',
          attempts: 'email_verification_attempts',
        },
        ttlMs: CODE_TTL_MS,
        resendCooldownMs: CODE_RESEND_COOLDOWN_MS,
        currentExpiresAt: null,
      });

      return {
        ...tokenPair,
        refreshTokenExpiresAt: refreshExpiry.toISOString(),
        user: serializeUser(user),
        verificationCode,
        email: user.email,
      };
    });

    // Sign-in is not gated on verification, so this doesn't block the response;
    // a failed send just means the player uses "resend verification" later.
    sendVerificationCode(response.email, response.verificationCode).catch((error) => {
      logger.error({ err: error, email: response.email }, 'Failed to send verification email');
    });

    setRefreshTokenCookie(res, response.refreshToken, new Date(response.refreshTokenExpiresAt));
    res.status(201).json({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      refreshTokenExpiresAt: response.refreshTokenExpiresAt,
      user: response.user,
    });
  })
);

router.post(
  '/signup',
  sensitiveActionLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['full_name', 'profession', 'phone', 'password']);
    assertValidPassword(payload.password);

    const fullName = String(payload.full_name).trim();
    const profession = String(payload.profession).trim();
    const phone = String(payload.phone).trim();

    // TODO: firebase_id_token is optional until Firebase project credentials are configured.
    // Once FIREBASE_* env vars are set for all environments, make it required again so every
    // signup is phone-verified.
    let decodedToken = null;

    if (payload.firebase_id_token) {
      try {
        decodedToken = await verifyFirebaseIdToken(String(payload.firebase_id_token));
      } catch (error) {
        if (error instanceof FirebaseAdminNotConfiguredError) {
          // Matches the TODO above: until FIREBASE_* env vars are set, treat
          // phone verification as unavailable rather than failing the whole
          // signup with a 500.
          logger.warn('Firebase Admin is not configured; skipping phone verification for this signup');
          decodedToken = null;
        } else if (error.code && String(error.code).startsWith('auth/')) {
          throw unauthorized('Invalid or expired Firebase ID token');
        } else {
          throw error;
        }
      }

      if (decodedToken) {
        if (!decodedToken.phone_number) {
          throw badRequest('Firebase ID token does not contain a verified phone number');
        }

        if (!phonesMatch(phone, decodedToken.phone_number)) {
          throw badRequest('Submitted phone does not match the verified Firebase phone number');
        }
      }
    }

    const response = await withTransaction(async (connection) => {
      const passwordHash = await hashPassword(payload.password);

      if (decodedToken) {
        const [existingFirebaseUser] = await connection.execute(
          'SELECT id FROM users WHERE firebase_uid = ? LIMIT 1',
          [decodedToken.uid]
        );

        if (existingFirebaseUser[0]) {
          throw conflict('An account already exists for this phone number');
        }
      }

      const [result] = await connection.execute(
        `
          INSERT INTO users (
            full_name,
            profession,
            phone,
            password_hash,
            firebase_uid,
            phone_verified,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, 'active') RETURNING id
        `,
        [fullName, profession, phone, passwordHash, decodedToken ? decodedToken.uid : null, decodedToken ? 1 : 0]
      );

      await ensureUserSummaryRows(connection, Number(result.insertId));

      const [rows] = await connection.execute(
        'SELECT id, full_name, email, phone, profession, avatar_url, email_verified, phone_verified, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
        [Number(result.insertId)]
      );
      const user = rows[0];
      const tokenPair = generateTokenPair(user);

      const refreshExpiry = await storeRefreshToken(connection, Number(user.id), tokenPair.refreshToken);

      return {
        ...tokenPair,
        refreshTokenExpiresAt: refreshExpiry.toISOString(),
        user: serializeUser(user),
      };
    });

    setRefreshTokenCookie(res, response.refreshToken, new Date(response.refreshTokenExpiresAt));
    res.status(201).json(response);
  })
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};

    if (!payload.password) {
      throw badRequest('password is required');
    }

    // Players sign in with the phone they signed up with; admins use email.
    if (!payload.email && !payload.phone) {
      throw badRequest('email or phone is required');
    }

    const identifierColumn = payload.email ? 'email' : 'phone';
    const identifierValue = payload.email
      ? String(payload.email).trim().toLowerCase()
      : String(payload.phone).trim();

    const [rows] = await pool.execute(`SELECT * FROM users WHERE ${identifierColumn} = ? LIMIT 1`, [
      identifierValue,
    ]);
    const user = rows[0];

    if (!user) {
      throw unauthorized('Invalid credentials');
    }

    const passwordMatches = await comparePassword(payload.password, user.password_hash);

    if (!passwordMatches) {
      throw unauthorized('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw forbidden('User account is not active');
    }

    const response = await withTransaction(async (connection) => {
      const tokenPair = generateTokenPair(user);
      const refreshExpiry = await storeRefreshToken(connection, Number(user.id), tokenPair.refreshToken);

      return {
        ...tokenPair,
        refreshTokenExpiresAt: refreshExpiry.toISOString(),
        user: serializeUser(user),
      };
    });

    setRefreshTokenCookie(res, response.refreshToken, new Date(response.refreshTokenExpiresAt));
    res.json(response);
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const refreshToken = payload.refreshToken || getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      clearRefreshTokenCookie(res);
      return res.json({
        accessToken: null,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      });
    }

    const response = await withTransaction(async (connection) => {
      let tokenPayload;

      try {
        tokenPayload = verifyRefreshToken(refreshToken);
      } catch (error) {
        throw unauthorized('Invalid or expired refresh token');
      }

      await assertRefreshTokenIsActive(connection, Number(tokenPayload.sub), refreshToken);

      const [rows] = await connection.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [
        Number(tokenPayload.sub),
      ]);
      const user = rows[0];

      if (!user) {
        throw notFound('User not found');
      }

      if (user.status !== 'active') {
        throw forbidden('User account is not active');
      }

      await revokeRefreshToken(connection, refreshToken);

      const tokenPair = generateTokenPair(user);
      const refreshExpiry = await storeRefreshToken(connection, Number(user.id), tokenPair.refreshToken);

      return {
        ...tokenPair,
        refreshTokenExpiresAt: refreshExpiry.toISOString(),
      };
    });

    setRefreshTokenCookie(res, response.refreshToken, new Date(response.refreshTokenExpiresAt));
    res.json(response);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req) || (req.body || {}).refreshToken;

    if (refreshToken) {
      await withTransaction(async (connection) => {
        await revokeRefreshToken(connection, refreshToken);
      });
    }

    clearRefreshTokenCookie(res);
    res.status(204).send();
  })
);

router.post(
  '/forgot-password',
  sensitiveActionLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['email']);

    const email = String(payload.email).trim().toLowerCase();
    const [rows] = await pool.execute(
      "SELECT id, password_reset_expires_at FROM users WHERE email = ? AND status = 'active' LIMIT 1",
      [email]
    );
    const user = rows[0];

    if (user) {
      const code = await issueCode(pool, {
        table: 'users',
        id: Number(user.id),
        columns: {
          hash: 'password_reset_hash',
          expiresAt: 'password_reset_expires_at',
          attempts: 'password_reset_attempts',
        },
        ttlMs: CODE_TTL_MS,
        resendCooldownMs: CODE_RESEND_COOLDOWN_MS,
        currentExpiresAt: user.password_reset_expires_at,
      });

      if (code) {
        // Not awaited: the response must not reveal (by timing or error) whether the email exists.
        sendPasswordResetCode(email, code).catch((error) => {
          logger.error({ err: error, email }, 'Failed to send password reset email');
        });
      }
    }

    res.json({ message: 'If that email is registered, a reset code has been sent.' });
  })
);

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['email', 'code', 'newPassword']);
    assertValidPassword(payload.newPassword, 'newPassword');

    const email = String(payload.email).trim().toLowerCase();
    const [rows] = await pool.execute(
      `
        SELECT id, password_reset_hash, password_reset_expires_at, password_reset_attempts
        FROM users
        WHERE email = ? AND status = 'active'
        LIMIT 1
      `,
      [email]
    );
    const user = rows[0];
    const isUsable =
      user &&
      isCodeUsable({
        hash: user.password_reset_hash,
        expiresAt: user.password_reset_expires_at,
        attempts: user.password_reset_attempts,
        maxAttempts: CODE_MAX_ATTEMPTS,
      });

    if (!isUsable) {
      throw badRequest('Invalid or expired reset code');
    }

    if (hashToken(String(payload.code).trim()) !== user.password_reset_hash) {
      await pool.execute(
        'UPDATE users SET password_reset_attempts = password_reset_attempts + 1 WHERE id = ?',
        [Number(user.id)]
      );
      throw badRequest('Invalid or expired reset code');
    }

    const passwordHash = await hashPassword(payload.newPassword);

    await withTransaction(async (connection) => {
      await connection.execute(
        `
          UPDATE users
          SET
            password_hash = ?,
            password_reset_hash = NULL,
            password_reset_expires_at = NULL,
            password_reset_attempts = 0,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [passwordHash, Number(user.id)]
      );
      await revokeAllRefreshTokens(connection, Number(user.id));
    });

    res.status(204).send();
  })
);

router.post(
  '/verify-email',
  authLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['email', 'code']);

    const email = String(payload.email).trim().toLowerCase();
    const [rows] = await pool.execute(
      `
        SELECT id, email_verification_hash, email_verification_expires_at, email_verification_attempts
        FROM users
        WHERE email = ? AND status = 'active'
        LIMIT 1
      `,
      [email]
    );
    const user = rows[0];
    const isUsable =
      user &&
      isCodeUsable({
        hash: user.email_verification_hash,
        expiresAt: user.email_verification_expires_at,
        attempts: user.email_verification_attempts,
        maxAttempts: CODE_MAX_ATTEMPTS,
      });

    if (!isUsable) {
      throw badRequest('Invalid or expired verification code');
    }

    if (hashToken(String(payload.code).trim()) !== user.email_verification_hash) {
      await pool.execute(
        'UPDATE users SET email_verification_attempts = email_verification_attempts + 1 WHERE id = ?',
        [Number(user.id)]
      );
      throw badRequest('Invalid or expired verification code');
    }

    await pool.execute(
      `
        UPDATE users
        SET
          email_verified = 1,
          email_verification_hash = NULL,
          email_verification_expires_at = NULL,
          email_verification_attempts = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [Number(user.id)]
    );

    res.status(204).send();
  })
);

router.post(
  '/resend-verification',
  sensitiveActionLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['email']);

    const email = String(payload.email).trim().toLowerCase();
    const [rows] = await pool.execute(
      "SELECT id, email_verified, email_verification_expires_at FROM users WHERE email = ? AND status = 'active' LIMIT 1",
      [email]
    );
    const user = rows[0];

    if (user && !user.email_verified) {
      const code = await issueCode(pool, {
        table: 'users',
        id: Number(user.id),
        columns: {
          hash: 'email_verification_hash',
          expiresAt: 'email_verification_expires_at',
          attempts: 'email_verification_attempts',
        },
        ttlMs: CODE_TTL_MS,
        resendCooldownMs: CODE_RESEND_COOLDOWN_MS,
        currentExpiresAt: user.email_verification_expires_at,
      });

      if (code) {
        sendVerificationCode(email, code).catch((error) => {
          logger.error({ err: error, email }, 'Failed to send verification email');
        });
      }
    }

    // Same generic reply whether the email is unknown, already verified, or a
    // code was actually (re)sent - the point is to never confirm account state.
    res.json({ message: 'If that email needs verification, a new code has been sent.' });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(serializeUser(req.currentUser));
  })
);

module.exports = router;
