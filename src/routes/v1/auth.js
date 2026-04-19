const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/async-handler');
const { generateTokenPair, hashPassword, comparePassword, verifyRefreshToken } = require('../../utils/auth');
const { serializeUser } = require('../../utils/serializers');
const { badRequest, unauthorized, forbidden, notFound } = require('../../utils/errors');
const { requireFields } = require('../../utils/sql');
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
        'SELECT id, full_name, email, phone, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
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
    requireFields(payload, ['email', 'password']);

    const email = String(payload.email).trim().toLowerCase();
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];

    if (!user) {
      throw unauthorized('Invalid email or password');
    }

    const passwordMatches = await comparePassword(payload.password, user.password_hash);

    if (!passwordMatches) {
      throw unauthorized('Invalid email or password');
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
