const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/async-handler');
const { generateTokenPair, hashPassword, comparePassword, verifyRefreshToken } = require('../../utils/auth');
const { serializeUser } = require('../../utils/serializers');
const { badRequest, unauthorized, forbidden, notFound, conflict } = require('../../utils/errors');
const { requireFields } = require('../../utils/sql');
const { phonesMatch } = require('../../utils/phone');
const { verifyFirebaseIdToken, FirebaseAdminNotConfiguredError } = require('../../config/firebase');
const { ensureUserSummaryRows } = require('../../services/gamification');
const {
  assertRefreshTokenIsActive,
  getRefreshTokenExpiryDate,
  revokeRefreshToken,
  storeRefreshToken,
} = require('../../services/refresh-tokens');
const {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
} = require('../../utils/cookies');

const router = express.Router();

router.post(
  '/register',
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
          VALUES (?, ?, ?, ?, 'active')
        `,
        [fullName, email, phone, passwordHash]
      );

      await ensureUserSummaryRows(connection, Number(result.insertId));

      const [rows] = await connection.execute(
        'SELECT id, full_name, email, phone, profession, phone_verified, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
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
  '/signup',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['full_name', 'profession', 'phone', 'password']);

    if (String(payload.password).length < 8) {
      throw badRequest('password must be at least 8 characters long');
    }

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
          console.warn(
            '[auth/signup] Firebase Admin is not configured; skipping phone verification for this signup.'
          );
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
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `,
        [fullName, profession, phone, passwordHash, decodedToken ? decodedToken.uid : null, decodedToken ? 1 : 0]
      );

      await ensureUserSummaryRows(connection, Number(result.insertId));

      const [rows] = await connection.execute(
        'SELECT id, full_name, email, phone, profession, phone_verified, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
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
  asyncHandler(async (req, res) => {
    const payload = req.body || {};

    if (!payload.password) {
      throw badRequest('password is required');
    }

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

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(serializeUser(req.currentUser));
  })
);

module.exports = router;
