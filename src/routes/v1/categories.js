const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { parseId } = require('../../utils/sql');
const { notFound } = require('../../utils/errors');
const { serializeCategory, serializeQuiz } = require('../../utils/serializers');
const { getQuizAccess } = require('../../services/quiz-access');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      'SELECT * FROM categories WHERE is_active = 1 ORDER BY name ASC, id ASC'
    );

    res.json({
      items: rows.map(serializeCategory),
    });
  })
);

router.get(
  '/:categoryId',
  asyncHandler(async (req, res) => {
    const categoryId = parseId(req.params.categoryId, 'categoryId');
    const [rows] = await pool.execute('SELECT * FROM categories WHERE id = ? LIMIT 1', [categoryId]);

    if (!rows[0]) {
      throw notFound('Category not found');
    }

    res.json(serializeCategory(rows[0]));
  })
);

router.get(
  '/:categoryId/quizzes',
  asyncHandler(async (req, res) => {
    const categoryId = parseId(req.params.categoryId, 'categoryId');
    const [categoryRows] = await pool.execute('SELECT id FROM categories WHERE id = ? LIMIT 1', [categoryId]);

    if (!categoryRows[0]) {
      throw notFound('Category not found');
    }

    const [rows] = await pool.execute(
      `
        SELECT *
        FROM quizzes
        WHERE category_id = ? AND is_active = 1
        ORDER BY created_at DESC, id DESC
      `,
      [categoryId]
    );

    const access = await getQuizAccess(req.auth.userId);

    res.json({
      items: rows.map((row) =>
        serializeQuiz(row, {
          isLocked: access.isLocked(row),
          requiredPoints: access.requiredPoints(row),
        })
      ),
    });
  })
);

module.exports = router;
