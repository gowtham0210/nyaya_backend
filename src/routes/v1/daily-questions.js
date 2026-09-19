const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { serializeDailyQuestion } = require('../../utils/serializers');

const router = express.Router();

// GET /daily-questions/random?count=2 — a random sample of active questions.
router.get('/random', asyncHandler(async (req, res) => {
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 2, 1), 10);
  const [rows] = await pool.query(
    'SELECT * FROM daily_questions ORDER BY RAND() LIMIT ?',
    [count]
  );
  res.json({ items: rows.map(serializeDailyQuestion) });
}));

module.exports = router;
