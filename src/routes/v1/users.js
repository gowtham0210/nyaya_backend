const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { badRequest } = require('../../utils/errors');
const { buildUpdateClause } = require('../../utils/sql');
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
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    await pool.execute(
      `UPDATE users SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...update.values, req.auth.userId]
    );

    const [rows] = await pool.execute(
      'SELECT id, full_name, email, phone, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.auth.userId]
    );

    res.json(serializeUser(rows[0]));
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
