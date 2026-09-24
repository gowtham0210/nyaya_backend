const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { parseId } = require('../../utils/sql');
const { notFound } = require('../../utils/errors');
const { serializeArticle } = require('../../utils/serializers');
const { applyTranslations } = require('../../utils/translate');

const router = express.Router();

const ARTICLE_FIELD_MAP = {
  partTitle: 'part_title',
  title: 'title',
  description: 'description',
  whatItMeans: 'what_it_means',
  whyItMatters: 'why_it_matters',
  keyFeatures: 'key_features',
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lang = typeof req.query.lang === 'string' ? req.query.lang : null;
    const [rows] = await pool.query(
      'SELECT * FROM articles WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    );

    const items = await applyTranslations(rows.map(serializeArticle), 'article', ARTICLE_FIELD_MAP, lang);

    res.json({ items });
  })
);

router.get(
  '/:articleId',
  asyncHandler(async (req, res) => {
    const articleId = parseId(req.params.articleId, 'articleId');
    const lang = typeof req.query.lang === 'string' ? req.query.lang : null;
    const [rows] = await pool.execute('SELECT * FROM articles WHERE id = ? LIMIT 1', [articleId]);

    if (!rows[0]) {
      throw notFound('Article not found');
    }

    const [item] = await applyTranslations([serializeArticle(rows[0])], 'article', ARTICLE_FIELD_MAP, lang);

    res.json(item);
  })
);

module.exports = router;
