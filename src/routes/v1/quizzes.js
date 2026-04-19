const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { getPagination } = require('../../utils/pagination');
const { parseBoolean, parseId } = require('../../utils/sql');
const { notFound } = require('../../utils/errors');
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

    res.json({
      page,
      size,
      total: Number(countRows[0].total),
      items: rows.map(serializeQuiz),
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

    res.json(serializeQuiz(rows[0]));
  })
);

router.get(
  '/:quizId/questions',
  asyncHandler(async (req, res) => {
    const quizId = parseId(req.params.quizId, 'quizId');
    const [quizRows] = await pool.execute('SELECT id FROM quizzes WHERE id = ? LIMIT 1', [quizId]);

    if (!quizRows[0]) {
      throw notFound('Quiz not found');
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
