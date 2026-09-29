const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { serializeLegalUpdate } = require('../../utils/serializers');

const router = express.Router();

// GET /legal-updates?category=Judgements — all updates, or filtered by
// category, newest first.
router.get('/', asyncHandler(async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

  const [rows] = category
    ? await pool.query('SELECT * FROM legal_updates WHERE category = ? ORDER BY update_date DESC, id DESC', [category])
    : await pool.query('SELECT * FROM legal_updates ORDER BY update_date DESC, id DESC');

  res.json({ items: rows.map(serializeLegalUpdate) });
}));

module.exports = router;
