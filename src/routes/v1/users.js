const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { badRequest } = require('../../utils/errors');
const { buildUpdateClause } = require('../../utils/sql');
const { comparePassword, hashPassword } = require('../../utils/auth');
const {
  serializePointTransaction,
  serializeUser,
  serializeUserAchievement,
  serializeUserProgress,
  serializeUserStreak,
} = require('../../utils/serializers');
const { getPagination } = require('../../utils/pagination');
const { getUserProgressRow, getUserStreakRow } = require('../../services/gamification');

const router = express.Router();

const AVATAR_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `user-${req.auth.userId}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
      return cb(badRequest('Only JPEG, PNG or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json(serializeUser(req.currentUser));
  })
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const update = buildUpdateClause(req.body || {}, {
      fullName: 'full_name',
      phone: 'phone',
      profession: 'profession',
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    await pool.execute(
      `UPDATE users SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...update.values, req.auth.userId]
    );

    const [rows] = await pool.execute(
      'SELECT id, full_name, email, phone, profession, avatar_url, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.auth.userId]
    );

    res.json(serializeUser(rows[0]));
  })
);

router.post(
  '/me/avatar',
  uploadAvatar.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw badRequest('An image file is required in the "avatar" field');
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await pool.execute('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      avatarUrl,
      req.auth.userId,
    ]);

    const [rows] = await pool.execute(
      'SELECT id, full_name, email, phone, profession, avatar_url, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.auth.userId]
    );

    res.json(serializeUser(rows[0]));
  })
);

router.post(
  '/me/change-password',
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      throw badRequest('currentPassword and newPassword are required');
    }

    if (String(newPassword).length < 8) {
      throw badRequest('newPassword must be at least 8 characters long');
    }

    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.auth.userId]);

    if (!rows[0] || !(await comparePassword(String(currentPassword), rows[0].password_hash))) {
      throw badRequest('Current password is incorrect');
    }

    await pool.execute('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      await hashPassword(String(newPassword)),
      req.auth.userId,
    ]);

    res.status(204).send();
  })
);

router.get(
  '/me/security',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `
        SELECT COUNT(*) AS active_sessions
        FROM refresh_tokens
        WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
      `,
      [req.auth.userId]
    );

    res.json({ activeSessions: Number(rows[0].active_sessions) });
  })
);

router.post(
  '/me/logout-all',
  asyncHandler(async (req, res) => {
    await pool.execute(
      'UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
      [req.auth.userId]
    );

    res.status(204).send();
  })
);

router.post(
  '/me/support-requests',
  asyncHandler(async (req, res) => {
    const subject = String((req.body || {}).subject || '').trim();
    const message = String((req.body || {}).message || '').trim();

    if (!subject || !message) {
      throw badRequest('subject and message are required');
    }

    const [result] = await pool.execute(
      'INSERT INTO support_requests (user_id, subject, message) VALUES (?, ?, ?)',
      [req.auth.userId, subject.slice(0, 150), message]
    );

    res.status(201).json({ id: Number(result.insertId), subject, message, status: 'open' });
  })
);

router.get(
  '/me/support-requests',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT id, subject, message, status, created_at FROM support_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [req.auth.userId]
    );

    res.json({
      items: rows.map((row) => ({
        id: Number(row.id),
        subject: row.subject,
        message: row.message,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  })
);

router.get(
  '/me/progress',
  asyncHandler(async (req, res) => {
    const progress = await withTransaction((connection) =>
      getUserProgressRow(connection, req.auth.userId)
    );

    res.json(serializeUserProgress(progress));
  })
);

router.get(
  '/me/streak',
  asyncHandler(async (req, res) => {
    const streak = await withTransaction((connection) =>
      getUserStreakRow(connection, req.auth.userId)
    );

    res.json(serializeUserStreak(streak));
  })
);

router.get(
  '/me/categories-explored',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `
        SELECT COUNT(DISTINCT q.category_id) AS categories_explored
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.user_id = ?
      `,
      [req.auth.userId]
    );

    res.json({ categoriesExplored: Number(rows[0].categories_explored) });
  })
);

router.get(
  '/me/achievements',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `
        SELECT
          ua.*,
          a.code AS achievement_code,
          a.title AS achievement_title,
          a.description AS achievement_description,
          a.achievement_type,
          a.target_value AS achievement_target_value,
          a.reward_points AS achievement_reward_points,
          a.is_active AS achievement_is_active,
          a.created_at AS achievement_created_at,
          a.updated_at AS achievement_updated_at
        FROM user_achievements ua
        INNER JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.user_id = ?
        ORDER BY ua.unlocked_at DESC, ua.id DESC
      `,
      [req.auth.userId]
    );

    res.json({
      items: rows.map(serializeUserAchievement),
    });
  })
);

router.get(
  '/me/point-transactions',
  asyncHandler(async (req, res) => {
    const { page, size, offset } = getPagination(req.query);
    const [rows] = await pool.execute(
      `
        SELECT *
        FROM point_transactions
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      [req.auth.userId, size, offset]
    );
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM point_transactions WHERE user_id = ?',
      [req.auth.userId]
    );

    res.json({
      page,
      size,
      total: Number(countRows[0].total),
      items: rows.map(serializePointTransaction),
    });
  })
);

module.exports = router;
