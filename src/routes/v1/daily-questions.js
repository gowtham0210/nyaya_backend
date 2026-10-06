const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { serializeDailyQuestion } = require('../../utils/serializers');
const { applyTranslations } = require('../../utils/translate');
const { badRequest } = require('../../utils/errors');
const { parseId } = require('../../utils/sql');
const { getTodayForUser, answerToday } = require('../../services/daily-questions');

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
    'SELECT * FROM daily_questions ORDER BY RANDOM() LIMIT ?',
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

// GET /daily-questions/today?lang=hi - today's multiple-choice question (the
// same one for every player). Once answered, `result` holds the player's pick,
// the correct option and the explanation; before that it is null.
router.get('/today', asyncHandler(async (req, res) => {
  const lang = typeof req.query.lang === 'string' ? req.query.lang : null;
  res.json(await getTodayForUser(req.auth.userId, lang));
}));

// POST /daily-questions/today/answer { selectedOptionId } - one answer per
// player per day (409 after that). Awards points if correct and counts toward
// the streak either way.
router.post('/today/answer', asyncHandler(async (req, res) => {
  const { selectedOptionId } = req.body || {};

  if (selectedOptionId === undefined || selectedOptionId === null) {
    throw badRequest('selectedOptionId is required');
  }

  const lang = typeof req.query.lang === 'string' ? req.query.lang : null;
  const optionId = parseId(selectedOptionId, 'selectedOptionId');
  const result = await withTransaction((connection) =>
    answerToday(connection, req.auth.userId, optionId, lang)
  );

  res.status(201).json(result);
}));

module.exports = router;
