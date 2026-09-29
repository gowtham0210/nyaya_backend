const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { getPagination } = require('../../utils/pagination');
const { parseId, requireFields } = require('../../utils/sql');
const { badRequest, notFound, forbidden } = require('../../utils/errors');
const { getQuizAccess } = require('../../services/quiz-access');
const { serializePlayableQuestion, serializeQuestionAttempt, serializeQuizAttempt } = require('../../utils/serializers');
const { getAttemptOrThrow } = require('../../services/gamification');
const { buildQuizResult, recalculateAttempt, submitAttempt } = require('../../services/quiz-attempts');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['quizId']);

    const response = await withTransaction(async (connection) => {
      const quizId = parseId(payload.quizId, 'quizId');
      const [quizRows] = await connection.execute('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [quizId]);
      const quiz = quizRows[0];

      if (!quiz) {
        throw notFound('Quiz not found');
      }

      if (!quiz.is_active) {
        throw badRequest('Quiz is not active');
      }

      const access = await getQuizAccess(req.auth.userId, connection);

      if (access.isLocked(quiz)) {
        throw forbidden(`This quiz unlocks at ${access.requiredPoints(quiz)} points`);
      }

      const [countRows] = await connection.execute(
        'SELECT COUNT(*) AS totalQuestions FROM questions WHERE quiz_id = ? AND is_active = 1',
        [quizId]
      );
      const totalQuestions = Number(countRows[0].totalQuestions);

      if (totalQuestions === 0) {
        throw badRequest('Quiz has no active questions');
      }

      const startedAt = new Date();
      const [result] = await connection.execute(
        `
          INSERT INTO quiz_attempts (
            user_id,
            quiz_id,
            started_at,
            status,
            total_questions,
            answered_questions,
            correct_answers,
            wrong_answers,
            skipped_answers,
            total_score,
            total_points_earned
          )
          VALUES (?, ?, ?, 'in_progress', ?, 0, 0, 0, ?, 0, 0)
        `,
        [req.auth.userId, quizId, startedAt, totalQuestions, totalQuestions]
      );

      const [rows] = await connection.execute('SELECT * FROM quiz_attempts WHERE id = ? LIMIT 1', [
        Number(result.insertId),
      ]);

      return serializeQuizAttempt(rows[0]);
    });

    res.status(201).json(response);
  })
);

router.post(
  '/custom',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['difficulty']);
    const difficulty = String(payload.difficulty);

    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      throw badRequest('difficulty must be one of easy, medium, hard');
    }

    const response = await withTransaction(async (connection) => {
      const [settingRows] = await connection.execute(
        'SELECT * FROM practice_settings WHERE difficulty_level = ? LIMIT 1',
        [difficulty]
      );
      const setting = settingRows[0];

      if (!setting || !setting.is_enabled) {
        throw badRequest('This difficulty is not available for practice right now');
      }

      const [questionRows] = await connection.execute(
        `
          SELECT *
          FROM questions
          WHERE difficulty_level = ? AND is_active = 1
          ORDER BY RAND()
          LIMIT ?
        `,
        [difficulty, Number(setting.question_count)]
      );

      if (questionRows.length === 0) {
        throw badRequest('No questions are available for this difficulty right now');
      }

      const startedAt = new Date();
      const [attemptResult] = await connection.execute(
        `
          INSERT INTO quiz_attempts (
            user_id,
            quiz_id,
            started_at,
            status,
            total_questions,
            answered_questions,
            correct_answers,
            wrong_answers,
            skipped_answers,
            total_score,
            total_points_earned
          )
          VALUES (?, NULL, ?, 'in_progress', ?, 0, 0, 0, ?, 0, 0)
        `,
        [req.auth.userId, startedAt, questionRows.length, questionRows.length]
      );
      const attemptId = Number(attemptResult.insertId);

      const questionIds = questionRows.map((question) => Number(question.id));
      const [optionRows] = await connection.query(
        `
          SELECT *
          FROM question_options
          WHERE question_id IN (?)
          ORDER BY question_id ASC, display_order ASC, id ASC
        `,
        [questionIds]
      );
      const optionsByQuestionId = optionRows.reduce((accumulator, option) => {
        const questionId = Number(option.question_id);

        if (!accumulator.has(questionId)) {
          accumulator.set(questionId, []);
        }

        accumulator.get(questionId).push(option);
        return accumulator;
      }, new Map());

      for (const [index, questionId] of questionIds.entries()) {
        await connection.execute(
          `
            INSERT INTO quiz_attempt_questions (quiz_attempt_id, question_id, display_order)
            VALUES (?, ?, ?)
          `,
          [attemptId, questionId, index + 1]
        );
      }

      const [attemptRows] = await connection.execute('SELECT * FROM quiz_attempts WHERE id = ? LIMIT 1', [
        attemptId,
      ]);

      return {
        attempt: serializeQuizAttempt(attemptRows[0]),
        questions: questionRows.map((question) =>
          serializePlayableQuestion(question, optionsByQuestionId.get(Number(question.id)) || [])
        ),
      };
    });

    res.status(201).json(response);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, size, offset } = getPagination(req.query);
    const conditions = ['user_id = ?'];
    const values = [req.auth.userId];

    if (req.query.status) {
      conditions.push('status = ?');
      values.push(String(req.query.status));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const [rows] = await pool.execute(
      `
        SELECT *
        FROM quiz_attempts
        ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      [...values, size, offset]
    );
    const [countRows] = await pool.execute(
      `
        SELECT COUNT(*) AS total
        FROM quiz_attempts
        ${whereClause}
      `,
      values
    );

    res.json({
      page,
      size,
      total: Number(countRows[0].total),
      items: rows.map(serializeQuizAttempt),
    });
  })
);

router.get(
  '/:attemptId',
  asyncHandler(async (req, res) => {
    const attemptId = parseId(req.params.attemptId, 'attemptId');
    const [rows] = await pool.execute(
      'SELECT * FROM quiz_attempts WHERE id = ? AND user_id = ? LIMIT 1',
      [attemptId, req.auth.userId]
    );

    if (!rows[0]) {
      throw notFound('Quiz attempt not found');
    }

    res.json(serializeQuizAttempt(rows[0]));
  })
);

router.post(
  '/:attemptId/answers',
  asyncHandler(async (req, res) => {
    const attemptId = parseId(req.params.attemptId, 'attemptId');
    const payload = req.body || {};
    requireFields(payload, ['questionId', 'selectedOptionId']);

    const response = await withTransaction(async (connection) => {
      const attempt = await getAttemptOrThrow(connection, attemptId, req.auth.userId);

      if (attempt.status !== 'in_progress') {
        throw badRequest('Answers can only be submitted to in-progress attempts');
      }

      const questionId = parseId(payload.questionId, 'questionId');
      const selectedOptionId = parseId(payload.selectedOptionId, 'selectedOptionId');

      // A practice attempt's questions come from many quizzes, so they
      // can't be validated by matching quiz_id the way a category
      // attempt's can. quiz_attempt_questions only ever has rows for a
      // practice attempt, so its presence is what tells the two apart.
      const [membershipRows] = await connection.execute(
        'SELECT 1 FROM quiz_attempt_questions WHERE quiz_attempt_id = ? AND question_id = ? LIMIT 1',
        [attemptId, questionId]
      );
      const isPracticeAttempt = membershipRows.length > 0;

      const [questionRows] = await connection.execute(
        isPracticeAttempt
          ? 'SELECT * FROM questions WHERE id = ? AND is_active = 1 LIMIT 1'
          : 'SELECT * FROM questions WHERE id = ? AND quiz_id = ? AND is_active = 1 LIMIT 1',
        isPracticeAttempt ? [questionId] : [questionId, Number(attempt.quiz_id)]
      );
      const question = questionRows[0];

      if (!question) {
        throw notFound('Question not found for this attempt');
      }

      const [optionRows] = await connection.execute(
        `
          SELECT *
          FROM question_options
          WHERE id = ? AND question_id = ?
          LIMIT 1
        `,
        [selectedOptionId, questionId]
      );
      const option = optionRows[0];

      if (!option) {
        throw notFound('Selected option not found');
      }

      const isCorrect = Boolean(option.is_correct);
      const pointsEarned = isCorrect
        ? Number(question.points_reward)
        : Number(question.negative_points) * -1;
      const answeredAt = new Date();
      const responseTimeMs =
        payload.responseTimeMs === undefined || payload.responseTimeMs === null
          ? null
          : Number(payload.responseTimeMs);

      const [existingRows] = await connection.execute(
        `
          SELECT id
          FROM question_attempts
          WHERE quiz_attempt_id = ? AND question_id = ?
          LIMIT 1
        `,
        [attemptId, questionId]
      );

      let questionAttemptId;

      if (existingRows[0]) {
        questionAttemptId = Number(existingRows[0].id);
        await connection.execute(
          `
            UPDATE question_attempts
            SET
              selected_option_id = ?,
              is_correct = ?,
              points_earned = ?,
              answered_at = ?,
              response_time_ms = ?
            WHERE id = ?
          `,
          [selectedOptionId, isCorrect ? 1 : 0, pointsEarned, answeredAt, responseTimeMs, questionAttemptId]
        );
      } else {
        const [insertResult] = await connection.execute(
          `
            INSERT INTO question_attempts (
              quiz_attempt_id,
              user_id,
              question_id,
              selected_option_id,
              is_correct,
              points_earned,
              answered_at,
              response_time_ms
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            attemptId,
            req.auth.userId,
            questionId,
            selectedOptionId,
            isCorrect ? 1 : 0,
            pointsEarned,
            answeredAt,
            responseTimeMs,
          ]
        );

        questionAttemptId = Number(insertResult.insertId);
      }

      await recalculateAttempt(connection, attemptId);

      const [resultRows] = await connection.execute(
        'SELECT * FROM question_attempts WHERE id = ? LIMIT 1',
        [questionAttemptId]
      );

      return serializeQuestionAttempt(resultRows[0]);
    });

    res.status(201).json(response);
  })
);

router.post(
  '/:attemptId/submit',
  asyncHandler(async (req, res) => {
    const attemptId = parseId(req.params.attemptId, 'attemptId');
    const result = await withTransaction((connection) =>
      submitAttempt(connection, attemptId, req.auth.userId)
    );

    res.json(result);
  })
);

router.get(
  '/:attemptId/result',
  asyncHandler(async (req, res) => {
    const attemptId = parseId(req.params.attemptId, 'attemptId');
    const result = await withTransaction((connection) =>
      buildQuizResult(connection, attemptId, req.auth.userId)
    );

    res.json(result);
  })
);

module.exports = router;
