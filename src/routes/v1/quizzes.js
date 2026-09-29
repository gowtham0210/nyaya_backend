const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { getPagination } = require('../../utils/pagination');
const { parseBoolean, parseId } = require('../../utils/sql');
const { forbidden, notFound } = require('../../utils/errors');
const { getQuizAccess } = require('../../services/quiz-access');
const {
  serializePlayableQuestion,
  serializeQuiz,
} = require('../../utils/serializers');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, size, offset } = getPagination(req.query);
    const conditions = [];
    const values = [];

    if (req.query.categoryId !== undefined) {
      conditions.push('category_id = ?');
      values.push(parseId(req.query.categoryId, 'categoryId'));
    }

    if (req.query.difficulty) {
      conditions.push('difficulty_level = ?');
      values.push(String(req.query.difficulty));
    }

    const active = parseBoolean(req.query.active);

    if (active !== undefined) {
      conditions.push('is_active = ?');
      values.push(active ? 1 : 0);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `
        SELECT *
        FROM quizzes
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      [...values, size, offset]
    );
    const [countRows] = await pool.execute(
      `
        SELECT COUNT(*) AS total
        FROM quizzes
        ${whereClause}
      `,
      values
    );

    const access = await getQuizAccess(req.auth.userId);

    res.json({
      page,
      size,
      total: Number(countRows[0].total),
      items: rows.map((row) =>
        serializeQuiz(row, {
          isLocked: access.isLocked(row),
          requiredPoints: access.requiredPoints(row),
        })
      ),
    });
  })
);

// Random questions *with* their answers, for Home's tap-to-reveal cards.
// The play endpoint deliberately withholds the answer key, so browsing needs
// its own route. Locked quizzes are left out, same as everywhere else.
router.get(
  '/random-questions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 20);
    const [questionRows] = await pool.query(
      `
        SELECT q.id, q.question_text, q.explanation, quiz.title AS quiz_title
        FROM questions q
        INNER JOIN quizzes quiz ON quiz.id = q.quiz_id
        LEFT JOIN levels lvl ON lvl.id = quiz.level_id
        WHERE q.is_active = 1
          AND quiz.is_active = 1
          AND (
            quiz.level_id IS NULL
            OR lvl.min_points <= COALESCE(
              (SELECT total_points FROM user_progress WHERE user_id = ?),
              0
            )
          )
        ORDER BY RAND()
        LIMIT ?
      `,
      [req.auth.userId, limit]
    );

    if (questionRows.length === 0) {
      return res.json({ items: [] });
    }

    const ids = questionRows.map((row) => Number(row.id));
    const [optionRows] = await pool.query(
      `
        SELECT id, question_id, option_text, is_correct, display_order
        FROM question_options
        WHERE question_id IN (?)
        ORDER BY question_id ASC, display_order ASC, id ASC
      `,
      [ids]
    );

    const optionsByQuestion = new Map();
    optionRows.forEach((option) => {
      const key = Number(option.question_id);
      const list = optionsByQuestion.get(key) || [];
      list.push({
        id: Number(option.id),
        optionText: option.option_text,
        isCorrect: Boolean(option.is_correct),
      });
      optionsByQuestion.set(key, list);
    });

    res.json({
      items: questionRows.map((row) => ({
        id: Number(row.id),
        questionText: row.question_text,
        explanation: row.explanation,
        quizTitle: row.quiz_title,
        options: optionsByQuestion.get(Number(row.id)) || [],
      })),
    });
  })
);

router.get(
  '/:quizId',
  asyncHandler(async (req, res) => {
    const quizId = parseId(req.params.quizId, 'quizId');
    const [rows] = await pool.execute('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [quizId]);

    if (!rows[0]) {
      throw notFound('Quiz not found');
    }

    const access = await getQuizAccess(req.auth.userId);

    res.json(
      serializeQuiz(rows[0], {
        isLocked: access.isLocked(rows[0]),
        requiredPoints: access.requiredPoints(rows[0]),
      })
    );
  })
);

router.get(
  '/:quizId/questions',
  asyncHandler(async (req, res) => {
    const quizId = parseId(req.params.quizId, 'quizId');
    const [quizRows] = await pool.execute('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [quizId]);

    if (!quizRows[0]) {
      throw notFound('Quiz not found');
    }

    const access = await getQuizAccess(req.auth.userId);

    if (access.isLocked(quizRows[0])) {
      throw forbidden(
        `This quiz unlocks at ${access.requiredPoints(quizRows[0])} points`
      );
    }

    const [questionRows] = await pool.execute(
      `
        SELECT *
        FROM questions
        WHERE quiz_id = ? AND is_active = 1
        ORDER BY display_order ASC, id ASC
      `,
      [quizId]
    );
    const [optionRows] = await pool.execute(
      `
        SELECT qo.*
        FROM question_options qo
        INNER JOIN questions q ON q.id = qo.question_id
        WHERE q.quiz_id = ? AND q.is_active = 1
        ORDER BY qo.question_id ASC, qo.display_order ASC, qo.id ASC
      `,
      [quizId]
    );
    const optionsByQuestionId = optionRows.reduce((accumulator, option) => {
      const questionId = Number(option.question_id);

      if (!accumulator.has(questionId)) {
        accumulator.set(questionId, []);
      }

      accumulator.get(questionId).push(option);
      return accumulator;
    }, new Map());

    res.json({
      quizId,
      items: questionRows.map((question) =>
        serializePlayableQuestion(question, optionsByQuestionId.get(Number(question.id)) || [])
      ),
    });
  })
);

module.exports = router;
