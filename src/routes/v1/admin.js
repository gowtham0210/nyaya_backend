const express = require('express');
const { pool } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { notFound, badRequest } = require('../../utils/errors');
const { buildUpdateClause, parseBoolean, parseId, requireFields } = require('../../utils/sql');
const {
  serializeCategory,
  serializeLeaderboardEntry,
  serializeLevel,
  serializeQuestion,
  serializeQuestionOption,
  serializeQuiz,
} = require('../../utils/serializers');

const router = express.Router();

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const [[categoryCounts]] = await pool.execute(
      `
        SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeCount,
          COUNT(*) AS totalCount
        FROM categories
      `
    );
    const [[quizCounts]] = await pool.execute(
      `
        SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeCount,
          COUNT(*) AS totalCount
        FROM quizzes
      `
    );
    const [[questionCounts]] = await pool.execute(
      `
        SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeCount,
          COUNT(*) AS totalCount
        FROM questions
      `
    );
    const [[levelCounts]] = await pool.execute('SELECT COUNT(*) AS totalCount FROM levels');
    const [[attemptSummary]] = await pool.execute(
      `
        SELECT
          COUNT(*) AS attemptsToday,
          COUNT(DISTINCT CASE
            WHEN started_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) THEN user_id
            ELSE NULL
          END) AS activeUsers7d,
          COUNT(DISTINCT CASE
            WHEN started_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) THEN user_id
            ELSE NULL
          END) AS activeUsers30d
        FROM quiz_attempts
      `
    );
    const [topQuizRows] = await pool.execute(
      `
        SELECT
          q.id,
          q.title,
          q.slug,
          COUNT(qa.id) AS total_attempts,
          SUM(CASE WHEN qa.status = 'submitted' THEN 1 ELSE 0 END) AS submitted_attempts
        FROM quizzes q
        LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id
        GROUP BY q.id, q.title, q.slug
        ORDER BY total_attempts DESC, submitted_attempts DESC, q.title ASC
        LIMIT 5
      `
    );
    const [leaderboardRows] = await pool.execute(
      `
        SELECT
          u.id AS user_id,
          u.full_name,
          up.total_points,
          up.current_level_id
        FROM user_progress up
        INNER JOIN users u ON u.id = up.user_id
        WHERE u.status = 'active'
        ORDER BY up.total_points DESC, u.full_name ASC, u.id ASC
        LIMIT 5
      `
    );
    const [recentQuestionRows] = await pool.execute(
      `
        SELECT
          q.id,
          q.question_text,
          q.created_at,
          qu.id AS quiz_id,
          qu.title AS quiz_title
        FROM questions q
        INNER JOIN quizzes qu ON qu.id = q.quiz_id
        ORDER BY q.created_at DESC, q.id DESC
        LIMIT 5
      `
    );
    const [recentAttemptRows] = await pool.execute(
      `
        SELECT
          qa.id,
          qa.status,
          qa.created_at,
          qa.started_at,
          q.id AS quiz_id,
          q.title AS quiz_title,
          u.id AS user_id,
          u.full_name
        FROM quiz_attempts qa
        INNER JOIN quizzes q ON q.id = qa.quiz_id
        INNER JOIN users u ON u.id = qa.user_id
        ORDER BY qa.created_at DESC, qa.id DESC
        LIMIT 5
      `
    );

    res.json({
      stats: {
        activeCategories: Number(categoryCounts.activeCount || 0),
        totalCategories: Number(categoryCounts.totalCount || 0),
        activeQuizzes: Number(quizCounts.activeCount || 0),
        totalQuizzes: Number(quizCounts.totalCount || 0),
        activeQuestions: Number(questionCounts.activeCount || 0),
        totalQuestions: Number(questionCounts.totalCount || 0),
        totalLevels: Number(levelCounts.totalCount || 0),
        attemptsToday: Number(attemptSummary.attemptsToday || 0),
        activeUsers7d: Number(attemptSummary.activeUsers7d || 0),
        activeUsers30d: Number(attemptSummary.activeUsers30d || 0),
      },
      topQuizzes: topQuizRows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        slug: row.slug,
        totalAttempts: Number(row.total_attempts || 0),
        submittedAttempts: Number(row.submitted_attempts || 0),
      })),
      leaderboardPreview: leaderboardRows.map((row, index) => serializeLeaderboardEntry(row, index + 1)),
      recentQuestions: recentQuestionRows.map((row) => ({
        id: Number(row.id),
        questionText: row.question_text,
        quizId: Number(row.quiz_id),
        quizTitle: row.quiz_title,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      })),
      recentAttempts: recentAttemptRows.map((row) => ({
        id: Number(row.id),
        status: row.status,
        quizId: Number(row.quiz_id),
        quizTitle: row.quiz_title,
        userId: Number(row.user_id),
        fullName: row.full_name,
        startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      })),
    });
  })
);

router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const active = parseBoolean(req.query.active);
    const conditions = [];
    const values = [];

    if (active !== undefined) {
      conditions.push('is_active = ?');
      values.push(active ? 1 : 0);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `
        SELECT *
        FROM categories
        ${whereClause}
        ORDER BY updated_at DESC, id DESC
      `,
      values
    );

    res.json({
      items: rows.map(serializeCategory),
    });
  })
);

router.get(
  '/quizzes',
  asyncHandler(async (req, res) => {
    const conditions = [];
    const values = [];

    if (req.query.categoryId !== undefined) {
      conditions.push('category_id = ?');
      values.push(parseId(req.query.categoryId, 'categoryId'));
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
        ORDER BY updated_at DESC, id DESC
      `,
      values
    );

    res.json({
      items: rows.map(serializeQuiz),
    });
  })
);

router.get(
  '/quizzes/:quizId/questions',
  asyncHandler(async (req, res) => {
    const quizId = parseId(req.params.quizId, 'quizId');
    const [quizRows] = await pool.execute('SELECT * FROM quizzes WHERE id = ? LIMIT 1', [quizId]);
    const quiz = quizRows[0];

    if (!quiz) {
      throw notFound('Quiz not found');
    }

    const active = parseBoolean(req.query.active);
    const conditions = ['quiz_id = ?'];
    const values = [quizId];

    if (active !== undefined) {
      conditions.push('is_active = ?');
      values.push(active ? 1 : 0);
    }

    const [questionRows] = await pool.execute(
      `
        SELECT *
        FROM questions
        WHERE ${conditions.join(' AND ')}
        ORDER BY display_order ASC, id ASC
      `,
      values
    );
    const [optionRows] = await pool.execute(
      `
        SELECT qo.*
        FROM question_options qo
        INNER JOIN questions q ON q.id = qo.question_id
        WHERE q.quiz_id = ?
        ORDER BY qo.question_id ASC, qo.display_order ASC, qo.id ASC
      `,
      [quizId]
    );
    const optionsByQuestionId = optionRows.reduce((accumulator, option) => {
      const questionId = Number(option.question_id);

      if (!accumulator.has(questionId)) {
        accumulator.set(questionId, []);
      }

      accumulator.get(questionId).push(serializeQuestionOption(option));
      return accumulator;
    }, new Map());

    res.json({
      quiz: serializeQuiz(quiz),
      items: questionRows.map((question) => ({
        ...serializeQuestion(question),
        options: optionsByQuestionId.get(Number(question.id)) || [],
      })),
    });
  })
);

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
