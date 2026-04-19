const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { notFound, badRequest } = require('../../utils/errors');
const { buildUpdateClause, parseId, requireFields } = require('../../utils/sql');
const {
  serializeCategory,
  serializeLevel,
  serializeQuestion,
  serializeQuestionOption,
  serializeQuiz,
} = require('../../utils/serializers');

const router = express.Router();

router.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['name', 'slug']);

    const [result] = await pool.execute(
      `
        INSERT INTO categories (
          name,
          slug,
          description,
          is_active
        )
        VALUES (?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.slug,
        payload.description || null,
        payload.isActive === undefined ? 1 : payload.isActive ? 1 : 0,
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM categories WHERE id = ? LIMIT 1', [
      Number(result.insertId),
    ]);

    res.status(201).json(serializeCategory(rows[0]));
  })
);

router.patch(
  '/categories/:categoryId',
  asyncHandler(async (req, res) => {
    const categoryId = parseId(req.params.categoryId, 'categoryId');
    const update = buildUpdateClause(req.body || {}, {
      name: 'name',
      slug: 'slug',
      description: 'description',
      isActive: 'is_active',
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    const [result] = await pool.execute(
      `UPDATE categories SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...update.values, categoryId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Category not found');
    }

    const [rows] = await pool.execute('SELECT * FROM categories WHERE id = ? LIMIT 1', [categoryId]);
    res.json(serializeCategory(rows[0]));
  })
);

router.delete(
  '/categories/:categoryId',
  asyncHandler(async (req, res) => {
    const categoryId = parseId(req.params.categoryId, 'categoryId');
    const [result] = await pool.execute(
      'UPDATE categories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [categoryId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Category not found');
    }

    res.status(204).send();
  })
);

router.post(
  '/quizzes',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['categoryId', 'title', 'slug', 'difficulty', 'totalQuestions']);

    const [result] = await pool.execute(
      `
        INSERT INTO quizzes (
          category_id,
          title,
          slug,
          description,
          difficulty_level,
          total_questions,
          time_limit_seconds,
          passing_score,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        parseId(payload.categoryId, 'categoryId'),
        payload.title,
        payload.slug,
        payload.description || null,
        payload.difficulty,
        Number(payload.totalQuestions),
        payload.timeLimitSeconds === undefined ? null : Number(payload.timeLimitSeconds),
        payload.passingScore === undefined ? 0 : Number(payload.passingScore),
        payload.isActive === undefined ? 1 : payload.isActive ? 1 : 0,
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [
      Number(result.insertId),
    ]);

    res.status(201).json(serializeQuiz(rows[0]));
  })
);

router.patch(
  '/quizzes/:quizId',
  asyncHandler(async (req, res) => {
    const quizId = parseId(req.params.quizId, 'quizId');
    const update = buildUpdateClause(req.body || {}, {
      categoryId: 'category_id',
      title: 'title',
      slug: 'slug',
      description: 'description',
      difficulty: 'difficulty_level',
      totalQuestions: 'total_questions',
      timeLimitSeconds: 'time_limit_seconds',
      passingScore: 'passing_score',
      isActive: 'is_active',
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    const [result] = await pool.execute(
      `UPDATE quizzes SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...update.values, quizId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Quiz not found');
    }

    const [rows] = await pool.execute('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [quizId]);
    res.json(serializeQuiz(rows[0]));
  })
);

router.delete(
  '/quizzes/:quizId',
  asyncHandler(async (req, res) => {
    const quizId = parseId(req.params.quizId, 'quizId');
    const [result] = await pool.execute(
      'UPDATE quizzes SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quizId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Quiz not found');
    }

    res.status(204).send();
  })
);

router.post(
  '/questions',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['quizId', 'questionText', 'questionType', 'pointsReward', 'displayOrder']);

    const [result] = await pool.execute(
      `
        INSERT INTO questions (
          quiz_id,
          question_text,
          question_type,
          explanation,
          difficulty_level,
          points_reward,
          negative_points,
          display_order,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        parseId(payload.quizId, 'quizId'),
        payload.questionText,
        payload.questionType,
        payload.explanation || null,
        payload.difficulty || 'medium',
        Number(payload.pointsReward),
        payload.negativePoints === undefined ? 0 : Number(payload.negativePoints),
        Number(payload.displayOrder),
        payload.isActive === undefined ? 1 : payload.isActive ? 1 : 0,
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM questions WHERE id = ? LIMIT 1', [
      Number(result.insertId),
    ]);

    res.status(201).json(serializeQuestion(rows[0]));
  })
);

router.patch(
  '/questions/:questionId',
  asyncHandler(async (req, res) => {
    const questionId = parseId(req.params.questionId, 'questionId');
    const update = buildUpdateClause(req.body || {}, {
      questionText: 'question_text',
      questionType: 'question_type',
      explanation: 'explanation',
      difficulty: 'difficulty_level',
      pointsReward: 'points_reward',
      negativePoints: 'negative_points',
      displayOrder: 'display_order',
      isActive: 'is_active',
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    const [result] = await pool.execute(
      `UPDATE questions SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...update.values, questionId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Question not found');
    }

    const [rows] = await pool.execute('SELECT * FROM questions WHERE id = ? LIMIT 1', [questionId]);
    res.json(serializeQuestion(rows[0]));
  })
);

router.delete(
  '/questions/:questionId',
  asyncHandler(async (req, res) => {
    const questionId = parseId(req.params.questionId, 'questionId');
    const [result] = await pool.execute(
      'UPDATE questions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [questionId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Question not found');
    }

    res.status(204).send();
  })
);

router.post(
  '/questions/:questionId/options',
  asyncHandler(async (req, res) => {
    const questionId = parseId(req.params.questionId, 'questionId');
    const payload = req.body || {};
    requireFields(payload, ['optionText', 'isCorrect', 'displayOrder']);

    const [result] = await pool.execute(
      `
        INSERT INTO question_options (
          question_id,
          option_text,
          is_correct,
          display_order
        )
        VALUES (?, ?, ?, ?)
      `,
      [questionId, payload.optionText, payload.isCorrect ? 1 : 0, Number(payload.displayOrder)]
    );
    const [rows] = await pool.execute('SELECT * FROM question_options WHERE id = ? LIMIT 1', [
      Number(result.insertId),
    ]);

    res.status(201).json(serializeQuestionOption(rows[0]));
  })
);

router.patch(
  '/options/:optionId',
  asyncHandler(async (req, res) => {
    const optionId = parseId(req.params.optionId, 'optionId');
    const update = buildUpdateClause(req.body || {}, {
      optionText: 'option_text',
      isCorrect: 'is_correct',
      displayOrder: 'display_order',
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    const [result] = await pool.execute(
      `UPDATE question_options SET ${update.setClause} WHERE id = ?`,
      [...update.values, optionId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Question option not found');
    }

    const [rows] = await pool.execute('SELECT * FROM question_options WHERE id = ? LIMIT 1', [optionId]);
    res.json(serializeQuestionOption(rows[0]));
  })
);

router.delete(
  '/options/:optionId',
  asyncHandler(async (req, res) => {
    const optionId = parseId(req.params.optionId, 'optionId');
    const [result] = await pool.execute('DELETE FROM question_options WHERE id = ?', [optionId]);

    if (result.affectedRows === 0) {
      throw notFound('Question option not found');
    }

    res.status(204).send();
  })
);

router.post(
  '/levels',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['code', 'name', 'minPoints', 'maxPoints']);

    const [result] = await pool.execute(
      `
        INSERT INTO levels (
          code,
          name,
          min_points,
          max_points,
          badge_icon,
          reward_description
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        payload.code,
        payload.name,
        Number(payload.minPoints),
        Number(payload.maxPoints),
        payload.badgeIcon || null,
        payload.rewardDescription || null,
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM levels WHERE id = ? LIMIT 1', [
      Number(result.insertId),
    ]);

    res.status(201).json(serializeLevel(rows[0]));
  })
);

router.patch(
  '/levels/:levelId',
  asyncHandler(async (req, res) => {
    const levelId = parseId(req.params.levelId, 'levelId');
    const update = buildUpdateClause(req.body || {}, {
      code: 'code',
      name: 'name',
      minPoints: 'min_points',
      maxPoints: 'max_points',
      badgeIcon: 'badge_icon',
      rewardDescription: 'reward_description',
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    const [result] = await pool.execute(
      `UPDATE levels SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...update.values, levelId]
    );

    if (result.affectedRows === 0) {
      throw notFound('Level not found');
    }

    const [rows] = await pool.execute('SELECT * FROM levels WHERE id = ? LIMIT 1', [levelId]);
    res.json(serializeLevel(rows[0]));
  })
);

module.exports = router;
