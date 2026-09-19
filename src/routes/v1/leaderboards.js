const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { getLimit } = require('../../utils/pagination');
const { parseId } = require('../../utils/sql');
const { notFound } = require('../../utils/errors');
const { serializeLeaderboardEntry } = require('../../utils/serializers');

const router = express.Router();

function buildLeaderboardResponse(rows) {
  return {
    items: rows.map((row, index) => serializeLeaderboardEntry(row, index + 1)),
  };
}

router.get(
  '/global',
  asyncHandler(async (req, res) => {
    const limit = getLimit(req.query);
    const [rows] = await pool.execute(
      `
        SELECT
          u.id AS user_id,
          u.full_name,
          up.total_points,
          up.current_level_id
        FROM user_progress up
        INNER JOIN users u ON u.id = up.user_id
        WHERE u.status = 'active'
        ORDER BY up.total_points DESC, u.full_name ASC, u.id ASC
        LIMIT ?
      `,
      [limit]
    );

    res.json(buildLeaderboardResponse(rows));
  })
);

router.get(
  '/weekly',
  asyncHandler(async (req, res) => {
    const limit = getLimit(req.query);
    const [rows] = await pool.execute(
      `
        SELECT
          u.id AS user_id,
          u.full_name,
          COALESCE(SUM(pt.points_delta), 0) AS total_points,
          up.current_level_id
        FROM users u
        INNER JOIN user_progress up ON up.user_id = u.id
        LEFT JOIN point_transactions pt
          ON pt.user_id = u.id
          AND pt.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
        WHERE u.status = 'active'
        GROUP BY u.id, u.full_name, up.current_level_id
        ORDER BY total_points DESC, u.full_name ASC, u.id ASC
        LIMIT ?
      `,
      [limit]
    );

    res.json(buildLeaderboardResponse(rows));
  })
);

router.get(
  '/category/:categoryId',
  asyncHandler(async (req, res) => {
    const categoryId = parseId(req.params.categoryId, 'categoryId');
    const limit = getLimit(req.query);
    const [categoryRows] = await pool.execute('SELECT id FROM categories WHERE id = ? LIMIT 1', [categoryId]);

    if (!categoryRows[0]) {
      throw notFound('Category not found');
    }

    const [rows] = await pool.execute(
      `
        SELECT
          u.id AS user_id,
          u.full_name,
          COALESCE(SUM(CASE WHEN q.id IS NOT NULL THEN qa.total_points_earned ELSE 0 END), 0) AS total_points,
          up.current_level_id
        FROM users u
        INNER JOIN user_progress up ON up.user_id = u.id
        LEFT JOIN quiz_attempts qa
          ON qa.user_id = u.id
          AND qa.status = 'submitted'
        LEFT JOIN quizzes q
          ON q.id = qa.quiz_id
          AND q.category_id = ?
        WHERE u.status = 'active'
        GROUP BY u.id, u.full_name, up.current_level_id
        ORDER BY total_points DESC, u.full_name ASC, u.id ASC
        LIMIT ?
      `,
      [categoryId, limit]
    );

    res.json(buildLeaderboardResponse(rows));
  })
);

module.exports = router;
