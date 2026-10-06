const express = require('express');
const { pool, withTransaction } = require('../../config/database');
const { asyncHandler } = require('../../utils/async-handler');
const { notFound, badRequest } = require('../../utils/errors');
const { buildUpdateClause, parseBoolean, parseId, requireFields } = require('../../utils/sql');
const { getPagination } = require('../../utils/pagination');
const { createImageUploader, deleteUploadedFile, publicUrlFor } = require('../../middleware/upload');
const {
  serializeCategory,
  serializeDailyQuestion,
  serializeLeaderboardEntry,
  serializeLegalUpdate,
  serializeLevel,
  serializePracticeSetting,
  serializeQuestion,
  serializeQuestionOption,
  serializeQuiz,
} = require('../../utils/serializers');

const { serializeResource } = require('./help-resources');

const router = express.Router();
const categoryImageUpload = createImageUploader('categories');
const quizImageUpload = createImageUploader('quizzes');
const legalUpdateImageUpload = createImageUploader('legal-updates');

// Shared by the category, quiz and legal-update image-upload routes below: swap
// in the new file, delete the one it replaced, return the updated row.
async function replaceEntityImage({ table, subdir, id, file, notFoundMessage, touchUpdatedAt = true }) {
  if (!file) {
    throw badRequest('An image file is required (multipart field "image")');
  }

  const [rows] = await pool.execute(`SELECT image_url FROM ${table} WHERE id = ? LIMIT 1`, [id]);

  if (!rows[0]) {
    throw notFound(notFoundMessage);
  }

  const imageUrl = publicUrlFor(subdir, file.filename);
  const touch = touchUpdatedAt ? ', updated_at = CURRENT_TIMESTAMP' : '';
  await pool.execute(`UPDATE ${table} SET image_url = ?${touch} WHERE id = ?`, [imageUrl, id]);
  deleteUploadedFile(rows[0].image_url);

  const [updatedRows] = await pool.execute(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
  return updatedRows[0];
}

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const [[categoryCounts]] = await pool.execute(
      `
        SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS "activeCount",
          COUNT(*) AS "totalCount"
        FROM categories
      `
    );
    const [[quizCounts]] = await pool.execute(
      `
        SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS "activeCount",
          COUNT(*) AS "totalCount"
        FROM quizzes
      `
    );
    const [[questionCounts]] = await pool.execute(
      `
        SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS "activeCount",
          COUNT(*) AS "totalCount"
        FROM questions
      `
    );
    const [[levelCounts]] = await pool.execute('SELECT COUNT(*) AS "totalCount" FROM levels');
    const [[attemptSummary]] = await pool.execute(
      `
        SELECT
          COUNT(*) AS "attemptsToday",
          COUNT(DISTINCT CASE
            WHEN started_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN user_id
            ELSE NULL
          END) AS "activeUsers7d",
          COUNT(DISTINCT CASE
            WHEN started_at >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN user_id
            ELSE NULL
          END) AS "activeUsers30d"
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
        VALUES (?, ?, ?, ?) RETURNING id
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
  '/categories/:categoryId/image',
  categoryImageUpload,
  asyncHandler(async (req, res) => {
    const categoryId = parseId(req.params.categoryId, 'categoryId');
    const category = await replaceEntityImage({
      table: 'categories',
      subdir: 'categories',
      id: categoryId,
      file: req.file,
      notFoundMessage: 'Category not found',
    });

    res.json(serializeCategory(category));
  })
);

const DAILY_QUESTION_FIELDS = {
  category: 'category',
  question: 'question',
  answer: 'answer',
};
const MIN_DAILY_QUESTION_OPTIONS = 2;
const MAX_DAILY_QUESTION_OPTIONS = 6;

// All three text columns are NOT NULL, so any field that is sent must be a
// non-blank string; category also has to fit its VARCHAR(100).
function validateDailyQuestionFields(payload) {
  for (const field of Object.keys(DAILY_QUESTION_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      continue;
    }

    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw badRequest(`${field} must be a non-empty string`);
    }
  }

  if (typeof payload.category === 'string' && payload.category.trim().length > 100) {
    throw badRequest('category must be at most 100 characters');
  }

  if (
    Object.prototype.hasOwnProperty.call(payload, 'pointsReward') &&
    (!Number.isInteger(payload.pointsReward) || payload.pointsReward < 0)
  ) {
    throw badRequest('pointsReward must be a whole number, 0 or more');
  }
}

// Players are graded against these, so a set is only valid with a sensible
// number of choices and exactly one marked correct.
function validateDailyQuestionOptions(options) {
  if (
    !Array.isArray(options) ||
    options.length < MIN_DAILY_QUESTION_OPTIONS ||
    options.length > MAX_DAILY_QUESTION_OPTIONS
  ) {
    throw badRequest(
      `options must be a list of ${MIN_DAILY_QUESTION_OPTIONS} to ${MAX_DAILY_QUESTION_OPTIONS} choices`
    );
  }

  for (const option of options) {
    if (!option || typeof option.optionText !== 'string' || !option.optionText.trim()) {
      throw badRequest('Every option needs non-empty optionText');
    }
  }

  if (options.filter((option) => option.isCorrect === true).length !== 1) {
    throw badRequest('Exactly one option must be marked correct');
  }
}

// Makes the stored options match `options`: entries with an id are updated in
// place (so past answers keep pointing at the same choice), entries without one
// are added, and stored options left out are removed.
async function syncDailyQuestionOptions(connection, dailyQuestionId, options) {
  const [existingRows] = await connection.execute(
    'SELECT id FROM daily_question_options WHERE daily_question_id = ?',
    [dailyQuestionId]
  );
  const existingIds = new Set(existingRows.map((row) => Number(row.id)));
  const keptIds = new Set();

  for (const [index, option] of options.entries()) {
    const values = [option.optionText.trim(), option.isCorrect ? 1 : 0, index + 1];

    if (option.id === undefined || option.id === null) {
      await connection.execute(
        `
          INSERT INTO daily_question_options (daily_question_id, option_text, is_correct, display_order)
          VALUES (?, ?, ?, ?)
        `,
        [dailyQuestionId, ...values]
      );
      continue;
    }

    const optionId = parseId(option.id, 'option id');

    if (!existingIds.has(optionId)) {
      throw badRequest(`Option ${optionId} does not belong to this daily question`);
    }

    keptIds.add(optionId);
    await connection.execute(
      'UPDATE daily_question_options SET option_text = ?, is_correct = ?, display_order = ? WHERE id = ?',
      [...values, optionId]
    );
  }

  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

  if (removedIds.length) {
    await connection.execute('DELETE FROM daily_question_options WHERE id IN (?)', [removedIds]);
    await connection.execute(
      "DELETE FROM translations WHERE entity_type = 'daily_question_option' AND entity_id IN (?)",
      [removedIds]
    );
  }
}

async function loadAdminDailyQuestions(connection, dailyQuestionId = null) {
  const [rows] = dailyQuestionId
    ? await connection.execute('SELECT * FROM daily_questions WHERE id = ?', [dailyQuestionId])
    : await connection.execute('SELECT * FROM daily_questions ORDER BY id DESC');

  if (!rows.length) {
    return [];
  }

  const [optionRows] = await connection.execute(
    `
      SELECT *
      FROM daily_question_options
      WHERE daily_question_id IN (?)
      ORDER BY daily_question_id ASC, display_order ASC, id ASC
    `,
    [rows.map((row) => Number(row.id))]
  );
  const optionsByQuestionId = new Map();

  for (const option of optionRows) {
    const questionId = Number(option.daily_question_id);

    if (!optionsByQuestionId.has(questionId)) {
      optionsByQuestionId.set(questionId, []);
    }

    optionsByQuestionId.get(questionId).push({
      id: Number(option.id),
      optionText: option.option_text,
      isCorrect: Number(option.is_correct) === 1,
      displayOrder: Number(option.display_order),
    });
  }

  return rows.map((row) => ({
    ...serializeDailyQuestion(row),
    pointsReward: Number(row.points_reward),
    options: optionsByQuestionId.get(Number(row.id)) || [],
  }));
}

router.get(
  '/daily-questions',
  asyncHandler(async (req, res) => {
    res.json({
      items: await loadAdminDailyQuestions(pool),
    });
  })
);

router.post(
  '/daily-questions',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['category', 'question', 'answer', 'options']);
    validateDailyQuestionFields(payload);
    validateDailyQuestionOptions(payload.options);

    const created = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `
          INSERT INTO daily_questions (category, question, answer, points_reward)
          VALUES (?, ?, ?, ?) RETURNING id
        `,
        [
          payload.category.trim(),
          payload.question.trim(),
          payload.answer.trim(),
          payload.pointsReward === undefined ? 10 : payload.pointsReward,
        ]
      );
      const dailyQuestionId = Number(result.insertId);
      await syncDailyQuestionOptions(
        connection,
        dailyQuestionId,
        payload.options.map(({ optionText, isCorrect }) => ({ optionText, isCorrect }))
      );

      return (await loadAdminDailyQuestions(connection, dailyQuestionId))[0];
    });

    res.status(201).json(created);
  })
);

router.patch(
  '/daily-questions/:dailyQuestionId',
  asyncHandler(async (req, res) => {
    const dailyQuestionId = parseId(req.params.dailyQuestionId, 'dailyQuestionId');
    const payload = req.body || {};
    const hasOptions = Object.prototype.hasOwnProperty.call(payload, 'options');
    validateDailyQuestionFields(payload);

    if (hasOptions) {
      validateDailyQuestionOptions(payload.options);
    }

    const fields = Object.fromEntries(
      Object.keys(DAILY_QUESTION_FIELDS)
        .filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
        .map((field) => [field, payload[field].trim()])
    );

    if (Object.prototype.hasOwnProperty.call(payload, 'pointsReward')) {
      fields.pointsReward = payload.pointsReward;
    }

    const update = buildUpdateClause(fields, { ...DAILY_QUESTION_FIELDS, pointsReward: 'points_reward' });

    if (!update && !hasOptions) {
      throw badRequest('At least one updatable field is required');
    }

    const updated = await withTransaction(async (connection) => {
      const [rows] = await connection.execute('SELECT id FROM daily_questions WHERE id = ? FOR UPDATE', [
        dailyQuestionId,
      ]);

      if (!rows[0]) {
        throw notFound('Daily question not found');
      }

      if (update) {
        await connection.execute(`UPDATE daily_questions SET ${update.setClause} WHERE id = ?`, [
          ...update.values,
          dailyQuestionId,
        ]);
      }

      if (hasOptions) {
        await syncDailyQuestionOptions(connection, dailyQuestionId, payload.options);
      }

      return (await loadAdminDailyQuestions(connection, dailyQuestionId))[0];
    });

    res.json(updated);
  })
);

// daily_questions has no is_active column, so this is a hard delete (options
// and schedule rows cascade; past answers keep their row with the reference
// cleared). Translations are keyed by entity id with no foreign key, so clear
// the question's and its options' too.
router.delete(
  '/daily-questions/:dailyQuestionId',
  asyncHandler(async (req, res) => {
    const dailyQuestionId = parseId(req.params.dailyQuestionId, 'dailyQuestionId');

    await withTransaction(async (connection) => {
      const [optionRows] = await connection.execute(
        'SELECT id FROM daily_question_options WHERE daily_question_id = ?',
        [dailyQuestionId]
      );
      const [result] = await connection.execute('DELETE FROM daily_questions WHERE id = ?', [dailyQuestionId]);

      if (result.affectedRows === 0) {
        throw notFound('Daily question not found');
      }

      await connection.execute(
        "DELETE FROM translations WHERE entity_type = 'daily_question' AND entity_id = ?",
        [dailyQuestionId]
      );

      if (optionRows.length) {
        await connection.execute(
          "DELETE FROM translations WHERE entity_type = 'daily_question_option' AND entity_id IN (?)",
          [optionRows.map((row) => Number(row.id))]
        );
      }
    });

    res.status(204).send();
  })
);

// The app maps these exact English values to translated labels (see
// routes/v1/legal-updates.js), so only these are accepted.
const LEGAL_UPDATE_CATEGORIES = ['Judgements', 'Legislation', 'Reforms', 'Notices'];
const LEGAL_UPDATE_FIELDS = {
  category: 'category',
  title: 'title',
  summary: 'summary',
  updateDate: 'update_date',
  source: 'source',
  imageUrl: 'image_url',
};

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Checks every field that is present and returns them trimmed, with blank
// optional text stored as NULL.
function normalizeLegalUpdateFields(payload) {
  const has = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const fields = {};

  if (has('category')) {
    if (!LEGAL_UPDATE_CATEGORIES.includes(payload.category)) {
      throw badRequest(`category must be one of: ${LEGAL_UPDATE_CATEGORIES.join(', ')}`);
    }

    fields.category = payload.category;
  }

  if (has('title')) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) {
      throw badRequest('title must be a non-empty string');
    }

    if (payload.title.trim().length > 255) {
      throw badRequest('title must be at most 255 characters');
    }

    fields.title = payload.title.trim();
  }

  if (has('updateDate')) {
    if (!isValidDateString(payload.updateDate)) {
      throw badRequest('updateDate must be a date in YYYY-MM-DD format');
    }

    fields.updateDate = payload.updateDate;
  }

  for (const [field, maxLength] of [['summary', null], ['source', 255], ['imageUrl', 500]]) {
    if (!has(field)) {
      continue;
    }

    const value = payload[field];

    if (value !== null && typeof value !== 'string') {
      throw badRequest(`${field} must be a string or null`);
    }

    const trimmed = value === null ? '' : value.trim();

    if (maxLength && trimmed.length > maxLength) {
      throw badRequest(`${field} must be at most ${maxLength} characters`);
    }

    fields[field] = trimmed || null;
  }

  // Either an uploaded file (set via the image route) or an external link.
  if (fields.imageUrl && !/^(https?:\/\/|\/uploads\/)/.test(fields.imageUrl)) {
    throw badRequest('imageUrl must be an http(s) link or an uploaded file path');
  }

  return fields;
}

router.get(
  '/legal-updates',
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const [rows] = category
      ? await pool.execute(
          'SELECT * FROM legal_updates WHERE category = ? ORDER BY update_date DESC, id DESC',
          [category]
        )
      : await pool.execute('SELECT * FROM legal_updates ORDER BY update_date DESC, id DESC');

    res.json({
      items: rows.map(serializeLegalUpdate),
    });
  })
);

router.post(
  '/legal-updates',
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    requireFields(payload, ['category', 'title', 'updateDate']);
    const fields = normalizeLegalUpdateFields(payload);

    const [result] = await pool.execute(
      `
        INSERT INTO legal_updates (category, title, summary, update_date, source, image_url)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id
      `,
      [
        fields.category,
        fields.title,
        fields.summary ?? null,
        fields.updateDate,
        fields.source ?? null,
        fields.imageUrl ?? null,
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM legal_updates WHERE id = ? LIMIT 1', [
      Number(result.insertId),
    ]);

    res.status(201).json(serializeLegalUpdate(rows[0]));
  })
);

router.patch(
  '/legal-updates/:legalUpdateId',
  asyncHandler(async (req, res) => {
    const legalUpdateId = parseId(req.params.legalUpdateId, 'legalUpdateId');
    const fields = normalizeLegalUpdateFields(req.body || {});
    const update = buildUpdateClause(fields, LEGAL_UPDATE_FIELDS);

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    const [existingRows] = await pool.execute('SELECT image_url FROM legal_updates WHERE id = ? LIMIT 1', [
      legalUpdateId,
    ]);

    if (!existingRows[0]) {
      throw notFound('Legal update not found');
    }

    await pool.execute(`UPDATE legal_updates SET ${update.setClause} WHERE id = ?`, [
      ...update.values,
      legalUpdateId,
    ]);

    // Replacing or clearing an uploaded image leaves its file unused.
    if (Object.prototype.hasOwnProperty.call(fields, 'imageUrl') && fields.imageUrl !== existingRows[0].image_url) {
      deleteUploadedFile(existingRows[0].image_url);
    }

    const [rows] = await pool.execute('SELECT * FROM legal_updates WHERE id = ? LIMIT 1', [legalUpdateId]);
    res.json(serializeLegalUpdate(rows[0]));
  })
);

// legal_updates has no is_active column, so this is a hard delete, along with
// its translations (no foreign key) and any uploaded image.
router.delete(
  '/legal-updates/:legalUpdateId',
  asyncHandler(async (req, res) => {
    const legalUpdateId = parseId(req.params.legalUpdateId, 'legalUpdateId');

    const imageUrl = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        'DELETE FROM legal_updates WHERE id = ? RETURNING image_url',
        [legalUpdateId]
      );

      if (result.affectedRows === 0) {
        throw notFound('Legal update not found');
      }

      await connection.execute(
        "DELETE FROM translations WHERE entity_type = 'legal_update' AND entity_id = ?",
        [legalUpdateId]
      );

      return result.rows[0].image_url;
    });

    deleteUploadedFile(imageUrl);
    res.status(204).send();
  })
);

router.post(
  '/legal-updates/:legalUpdateId/image',
  legalUpdateImageUpload,
  asyncHandler(async (req, res) => {
    const legalUpdateId = parseId(req.params.legalUpdateId, 'legalUpdateId');
    const legalUpdate = await replaceEntityImage({
      table: 'legal_updates',
      subdir: 'legal-updates',
      id: legalUpdateId,
      file: req.file,
      notFoundMessage: 'Legal update not found',
      touchUpdatedAt: false,
    });

    res.json(serializeLegalUpdate(legalUpdate));
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
          level_id,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
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
        payload.levelId === undefined || payload.levelId === null
          ? null
          : parseId(payload.levelId, 'levelId'),
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
      levelId: 'level_id',
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
  '/quizzes/:quizId/image',
  quizImageUpload,
  asyncHandler(async (req, res) => {
    const quizId = parseId(req.params.quizId, 'quizId');
    const quiz = await replaceEntityImage({
      table: 'quizzes',
      subdir: 'quizzes',
      id: quizId,
      file: req.file,
      notFoundMessage: 'Quiz not found',
    });

    res.json(serializeQuiz(quiz));
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
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
        VALUES (?, ?, ?, ?) RETURNING id
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
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id
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


// PATCH /admin/help-resources/:id — update a resource's contact details after
// checking them against the official source. Pass  to
// stamp it verified now.
router.patch(
  '/help-resources/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = req.body || {};
    const update = buildUpdateClause(body, {
      resourceName: 'resource_name',
      phoneNumber: 'phone_number',
      tollFree: 'toll_free',
      email: 'email',
      websiteUrl: 'website_url',
      serviceHours: 'service_hours',
      availability: 'availability',
      sourceName: 'source_name',
      sourceUrl: 'source_url',
      isActive: 'is_active',
    });

    const sets = update ? [update.setClause] : [];
    const values = update ? [...update.values] : [];
    if (body.markVerified === true) {
      sets.push("verification_status = 'verified'", 'last_verified_at = CURRENT_TIMESTAMP');
    }
    if (!sets.length) {
      throw badRequest('At least one updatable field is required');
    }

    const [result] = await pool.execute(`UPDATE help_resources SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
    if (!result.affectedRows) {
      throw notFound('Help resource not found');
    }

    const [rows] = await pool.execute('SELECT * FROM help_resources WHERE id = ? LIMIT 1', [id]);
    res.json(serializeResource(rows[0]));
  })
);

router.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    const { page, size, offset } = getPagination(req.query);
    const conditions = [];
    const values = [];

    if (req.query.adminUserId !== undefined) {
      conditions.push('l.admin_user_id = ?');
      values.push(parseId(req.query.adminUserId, 'adminUserId'));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `
        SELECT l.*, u.full_name AS admin_full_name, u.email AS admin_email
        FROM admin_audit_log l
        INNER JOIN users u ON u.id = l.admin_user_id
        ${whereClause}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?
      `,
      [...values, size, offset]
    );
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM admin_audit_log l ${whereClause}`,
      values
    );

    res.json({
      page,
      size,
      total: Number(countRows[0].total),
      items: rows.map((row) => ({
        id: Number(row.id),
        adminUserId: Number(row.admin_user_id),
        adminFullName: row.admin_full_name,
        adminEmail: row.admin_email,
        method: row.method,
        path: row.path,
        statusCode: Number(row.status_code),
        // A body long enough to get truncated (see audit-log.js) is no longer
        // valid JSON; fall back to the raw truncated text rather than throw.
        requestBody: row.request_body
          ? (() => {
              try {
                return JSON.parse(row.request_body);
              } catch {
                return row.request_body;
              }
            })()
          : null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
    });
  })
);

const PRACTICE_DIFFICULTIES = ['easy', 'medium', 'hard'];

router.get(
  '/practice-settings',
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `
        SELECT *
        FROM practice_settings
        ORDER BY array_position(ARRAY['easy', 'medium', 'hard'], difficulty_level::text)
      `
    );

    res.json({ items: rows.map(serializePracticeSetting) });
  })
);

router.patch(
  '/practice-settings/:difficulty',
  asyncHandler(async (req, res) => {
    const difficulty = String(req.params.difficulty);

    if (!PRACTICE_DIFFICULTIES.includes(difficulty)) {
      throw badRequest(`difficulty must be one of ${PRACTICE_DIFFICULTIES.join(', ')}`);
    }

    const update = buildUpdateClause(req.body || {}, {
      questionCount: 'question_count',
      isEnabled: 'is_enabled',
    });

    if (!update) {
      throw badRequest('At least one updatable field is required');
    }

    const [result] = await pool.execute(
      `UPDATE practice_settings SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE difficulty_level = ?`,
      [...update.values, difficulty]
    );

    if (result.affectedRows === 0) {
      throw notFound('Practice setting not found');
    }

    const [rows] = await pool.execute(
      'SELECT * FROM practice_settings WHERE difficulty_level = ? LIMIT 1',
      [difficulty]
    );

    res.json(serializePracticeSetting(rows[0]));
  })
);

module.exports = router;
