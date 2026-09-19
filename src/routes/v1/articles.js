const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { parseId } = require('../../utils/sql');
const { notFound } = require('../../utils/errors');
const { serializeArticle } = require('../../utils/serializers');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      'SELECT * FROM articles WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    );

    res.json({
      items: rows.map(serializeArticle),
    });
  })
);

router.get(
  '/:articleId',
  asyncHandler(async (req, res) => {
    const articleId = parseId(req.params.articleId, 'articleId');
    const [rows] = await pool.execute('SELECT * FROM articles WHERE id = ? LIMIT 1', [articleId]);

    if (!rows[0]) {
      throw notFound('Article not found');
    }

    res.json(serializeArticle(rows[0]));
  })
);

module.exports = router;
