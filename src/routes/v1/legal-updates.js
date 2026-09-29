const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { serializeLegalUpdate } = require('../../utils/serializers');
const { applyTranslations } = require('../../utils/translate');

const router = express.Router();

// `category` is intentionally left out — it's one of a fixed set
// (Judgements/Legislation/Reforms/Notices) that the Flutter app maps to a
// translated label itself (see legal_updates_section.dart's
// _categoryLabelKeys), so the English value must stay stable for that
// lookup and for the `?category=` filter below to keep working.
const LEGAL_UPDATE_FIELD_MAP = {
  title: 'title',
  summary: 'summary',
};

// GET /legal-updates?category=Judgements&lang=hi — all updates, or
// filtered by category, newest first, optionally translated.
router.get('/', asyncHandler(async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const lang = typeof req.query.lang === 'string' ? req.query.lang : null;

  const [rows] = category
    ? await pool.query('SELECT * FROM legal_updates WHERE category = ? ORDER BY update_date DESC, id DESC', [category])
    : await pool.query('SELECT * FROM legal_updates ORDER BY update_date DESC, id DESC');

  const items = await applyTranslations(
    rows.map(serializeLegalUpdate),
    'legal_update',
    LEGAL_UPDATE_FIELD_MAP,
    lang
  );

  res.json({ items });
}));

module.exports = router;
