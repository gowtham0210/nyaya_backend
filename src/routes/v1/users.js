const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { badRequest } = require('../../utils/errors');
const { buildUpdateClause, requireFields } = require('../../utils/sql');
const { assertValidPassword, comparePassword, hashPassword } = require('../../utils/auth');
const { revokeAllRefreshTokens } = require('../../services/refresh-tokens');
const { createImageUploader, deleteUploadedFile, publicUrlFor } = require('../../middleware/upload');
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
const avatarUpload = createImageUploader('avatars', ['image', 'avatar']);


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
      'SELECT id, full_name, email, phone, profession, avatar_url, email_verified, phone_verified, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.auth.userId]
    );

    res.json(serializeUser(rows[0]));
  })
);

router.post(
  '/me/avatar',
  avatarUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw badRequest('An image file is required (multipart field "image" or "avatar")');
    }

    const [rows] = await pool.execute('SELECT avatar_url FROM users WHERE id = ? LIMIT 1', [
      req.auth.userId,
    ]);
    const avatarUrl = publicUrlFor('avatars', req.file.filename);

    await pool.execute('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      avatarUrl,
      req.auth.userId,
    ]);
    deleteUploadedFile(rows[0].avatar_url);

    const [updatedRows] = await pool.execute(
      'SELECT id, full_name, email, phone, profession, avatar_url, email_verified, phone_verified, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.auth.userId]
    );

    res.json(serializeUser(updatedRows[0]));
  })
);

router.post(
  ['/me/password', '/me/change-password'],
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['currentPassword', 'newPassword']);
    assertValidPassword(payload.newPassword, 'newPassword');

    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
      req.auth.userId,
    ]);

    // 400, not 401: a 401 would make clients try to refresh the session and retry.
    if (!(await comparePassword(payload.currentPassword, rows[0].password_hash))) {
      throw badRequest('Current password is incorrect');
    }

    const passwordHash = await hashPassword(payload.newPassword);

    await withTransaction(async (connection) => {
      await connection.execute(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [passwordHash, req.auth.userId]
      );
      // Signs out every device; the app should send the user back to login.
      await revokeAllRefreshTokens(connection, req.auth.userId);
    });

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
