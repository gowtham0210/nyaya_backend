const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/async-handler');
const { generateTokenPair, hashPassword, comparePassword, verifyRefreshToken } = require('../../utils/auth');
const { serializeUser } = require('../../utils/serializers');
const { badRequest, unauthorized, forbidden, notFound } = require('../../utils/errors');
const { requireFields } = require('../../utils/sql');
const { ensureUserSummaryRows } = require('../../services/gamification');

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

      return {
        ...generateTokenPair(user),
        user: serializeUser(user),
      };
    });

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

    res.json({
      ...generateTokenPair(user),
      user: serializeUser(user),
    });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['refreshToken']);

    let tokenPayload;

    try {
      tokenPayload = verifyRefreshToken(payload.refreshToken);
    } catch (error) {
      throw unauthorized('Invalid or expired refresh token');
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [Number(tokenPayload.sub)]);
    const user = rows[0];

    if (!user) {
      throw notFound('User not found');
    }

    if (user.status !== 'active') {
      throw forbidden('User account is not active');
    }

    res.json(generateTokenPair(user));
  })
);

router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
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
