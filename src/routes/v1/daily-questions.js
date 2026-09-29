const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { serializeDailyQuestion } = require('../../utils/serializers');
const { applyTranslations } = require('../../utils/translate');

const router = express.Router();

const DAILY_QUESTION_FIELD_MAP = {
  category: 'category',
  question: 'question',
  answer: 'answer',
};

// GET /daily-questions/random?count=2&lang=hi — a random sample of active
// questions, optionally translated.
router.get('/random', asyncHandler(async (req, res) => {
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 2, 1), 10);
  const lang = typeof req.query.lang === 'string' ? req.query.lang : null;
  const [rows] = await pool.query(
    'SELECT * FROM daily_questions ORDER BY RAND() LIMIT ?',
    [count]
  );
  const items = await applyTranslations(
    rows.map(serializeDailyQuestion),
    'daily_question',
    DAILY_QUESTION_FIELD_MAP,
    lang
  );
  res.json({ items });
}));

module.exports = router;
