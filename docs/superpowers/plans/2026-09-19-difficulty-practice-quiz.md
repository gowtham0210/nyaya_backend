# Difficulty-Based Practice Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user play a 10-question quiz built from questions of one difficulty (easy/medium/hard) drawn across every category, configurable by an admin, without touching the existing category-quiz flow.

**Architecture:** A practice attempt is a `quiz_attempts` row with `quiz_id = NULL`, whose question set is recorded in a new `quiz_attempt_questions` join table instead of being implied by a single quiz. Every existing scoring/streak/achievement/leaderboard code path already ignores `quiz_id` entirely, so a practice attempt gets full scoring parity for free. The only existing behavior that has to change is the answer-ownership check, which gains a join-table-based path alongside its current `quiz_id`-based one.

**Tech Stack:** Node.js/Express/MySQL (`mysql2`) backend; React/TypeScript (Vite, TanStack Query, Tailwind) admin panel; Flutter/Dart mobile app.

**Spec:** `docs/superpowers/specs/2026-09-19-difficulty-practice-quiz-design.md`

## Global Constraints

- Practice quiz length: 10 questions by default, admin-configurable per difficulty (from the spec).
- Thin difficulty pools allowed to repeat once exhausted — plain `ORDER BY RAND() LIMIT n`, no "seen" tracking (from the spec).
- A practice attempt scores identically to a category attempt: same points, streaks, achievements, leaderboard effect (from the spec).
- Home screen is untouched by this feature (from the spec).
- Practice quizzes cost the same credits as category quizzes, via the same `LeaderboardProgressStore.spend`/cost-dialog flow (decided during brainstorming, after the spec was written — the spec predates this discovery).
- Admin panel: Practice is a settings subsection (question count + enabled toggle per difficulty), not a separate question pool or a quiz-taking UI (from the spec).
- Mobile app: Practice is a second subsection in the existing "Quizzes" tab (`CategoriesPage`), alongside Categories — not on Home (from the spec).

---

## Task 1: Backend — schema change and migration

**Files:**
- Modify: `src/database/schema.sql` (line 137, and append two new tables at the end)
- Create: `src/database/migrations/0006_add_practice_mode.js`

**Interfaces:**
- Produces: nullable `quiz_attempts.quiz_id`; new tables `quiz_attempt_questions (id, quiz_attempt_id, question_id, display_order)` and `practice_settings (difficulty_level PK, question_count, is_enabled, updated_at)`, the latter seeded with rows for `'easy'`, `'medium'`, `'hard'` (10 questions, enabled, each).

- [ ] **Step 1: Update `schema.sql` so a fresh database matches the post-migration shape**

  In `src/database/schema.sql`, change line 137 from:
  ```sql
    quiz_id BIGINT UNSIGNED NOT NULL,
  ```
  to:
  ```sql
    quiz_id BIGINT UNSIGNED DEFAULT NULL,
  ```
  (This is the `quiz_id` column inside the existing `quiz_attempts` table definition — leave everything else in that table, including its foreign key and indexes, unchanged.)

  Then append these two table definitions at the very end of the file (after the existing `admin_audit_log` table):
  ```sql

  CREATE TABLE IF NOT EXISTS quiz_attempt_questions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    quiz_attempt_id BIGINT UNSIGNED NOT NULL,
    question_id BIGINT UNSIGNED NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_quiz_attempt_questions_attempt_question (quiz_attempt_id, question_id),
    KEY idx_quiz_attempt_questions_question_id (question_id),
    CONSTRAINT fk_quiz_attempt_questions_attempt
      FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts (id)
      ON UPDATE CASCADE
      ON DELETE CASCADE,
    CONSTRAINT fk_quiz_attempt_questions_question
      FOREIGN KEY (question_id) REFERENCES questions (id)
      ON UPDATE CASCADE
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS practice_settings (
    difficulty_level VARCHAR(30) NOT NULL,
    question_count INT NOT NULL DEFAULT 10,
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (difficulty_level)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  ```
  Note: `schema.sql` never contains `INSERT` statements in this codebase (verified — every other reference table, like `levels`, is populated separately). The seed rows for `practice_settings` are added by the migration below, not here, matching that convention. A database built via `db:init` alone (schema.sql only, migrations never run) will have an empty `practice_settings` table; Tasks 4 and 5 are written to degrade gracefully (empty list / a clear 400) rather than crash in that case.

- [ ] **Step 2: Write the migration**

  Create `src/database/migrations/0006_add_practice_mode.js`:
  ```js
  // Adds practice mode: a quiz attempt that draws questions from many
  // quizzes by difficulty instead of belonging to one quiz. Guarded so
  // it's a safe no-op on a database that already has these changes
  // (including one built fresh from the current schema.sql, which
  // already declares the nullable column and both new tables).
  async function up(connection) {
    const [columns] = await connection.query(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_attempts' AND COLUMN_NAME = 'quiz_id'`
    );

    if (columns[0] && columns[0].IS_NULLABLE === 'NO') {
      await connection.query(`
        ALTER TABLE quiz_attempts
          MODIFY COLUMN quiz_id BIGINT UNSIGNED DEFAULT NULL
      `);
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS quiz_attempt_questions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        quiz_attempt_id BIGINT UNSIGNED NOT NULL,
        question_id BIGINT UNSIGNED NOT NULL,
        display_order INT NOT NULL DEFAULT 1,
        PRIMARY KEY (id),
        UNIQUE KEY uq_quiz_attempt_questions_attempt_question (quiz_attempt_id, question_id),
        KEY idx_quiz_attempt_questions_question_id (question_id),
        CONSTRAINT fk_quiz_attempt_questions_attempt
          FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts (id)
          ON UPDATE CASCADE
          ON DELETE CASCADE,
        CONSTRAINT fk_quiz_attempt_questions_question
          FOREIGN KEY (question_id) REFERENCES questions (id)
          ON UPDATE CASCADE
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS practice_settings (
        difficulty_level VARCHAR(30) NOT NULL,
        question_count INT NOT NULL DEFAULT 10,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (difficulty_level)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(`
      INSERT IGNORE INTO practice_settings (difficulty_level, question_count, is_enabled)
      VALUES ('easy', 10, 1), ('medium', 10, 1), ('hard', 10, 1)
    `);
  }

  module.exports = { up };
  ```

- [ ] **Step 3: Run the migration against the local dev database**

  Run: `npm run db:migrate`
  Expected: output includes `Applying 0006_add_practice_mode.js...` then `done.`, ending with `Applied 1 migration(s).`

- [ ] **Step 4: Verify the schema change manually**

  Run:
  ```bash
  node -e "
  const mysql = require('mysql2/promise');
  require('dotenv').config();
  (async () => {
    const conn = await mysql.createConnection({host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME});
    const [cols] = await conn.query(\"SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_attempts' AND COLUMN_NAME = 'quiz_id'\");
    console.log('quiz_id nullable:', cols[0].IS_NULLABLE);
    const [rows] = await conn.query('SELECT * FROM practice_settings ORDER BY difficulty_level');
    console.log('practice_settings:', rows);
    await conn.end();
  })();
  "
  ```
  Expected: `quiz_id nullable: YES` and three rows (`easy`, `hard`, `medium`), each `question_count: 10, is_enabled: 1`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/database/schema.sql src/database/migrations/0006_add_practice_mode.js
  git commit -m "$(cat <<'EOF'
  Add schema for practice-mode quiz attempts

  quiz_attempts.quiz_id becomes nullable for cross-category attempts;
  quiz_attempt_questions records which questions such an attempt holds;
  practice_settings lets an admin configure question count and
  enabled/disabled per difficulty.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Backend — serializer fix and addition

**Files:**
- Modify: `src/utils/serializers.js:111-130` (the `serializeQuizAttempt` function), and its `module.exports`

**Interfaces:**
- Consumes: nothing new.
- Produces: `serializeQuizAttempt(row)` now returns `quizId: number | null` instead of always coercing to a number (fixes a real bug: `Number(null)` is `0`, which would misrepresent a practice attempt as belonging to quiz `0`). New `serializePracticeSetting(row)` returning `{ difficulty, questionCount, isEnabled, updatedAt }`, exported alongside the others.

- [ ] **Step 1: Fix `serializeQuizAttempt`'s `quizId` handling**

  In `src/utils/serializers.js`, inside `serializeQuizAttempt` (around line 115), change:
  ```js
      quizId: Number(row.quiz_id),
  ```
  to:
  ```js
      quizId: row.quiz_id === null ? null : Number(row.quiz_id),
  ```

- [ ] **Step 2: Add `serializePracticeSetting`**

  Add this function right after `serializeLevel` (after its closing `}` around line 197):
  ```js
  function serializePracticeSetting(row) {
    return {
      difficulty: row.difficulty_level,
      questionCount: Number(row.question_count),
      isEnabled: Boolean(row.is_enabled),
      updatedAt: toIsoString(row.updated_at),
    };
  }
  ```

- [ ] **Step 3: Export it**

  In the `module.exports` block at the bottom of `src/utils/serializers.js`, add `serializePracticeSetting,` in alphabetical position among the other `serialize*` exports.

- [ ] **Step 4: Verify with a quick script**

  Run:
  ```bash
  node -e "
  const { serializeQuizAttempt, serializePracticeSetting } = require('./src/utils/serializers');
  console.log(serializeQuizAttempt({ id: 1, user_id: 2, quiz_id: null, status: 'in_progress', total_questions: 10, answered_questions: 0, correct_answers: 0, wrong_answers: 0, skipped_answers: 10, total_score: 0, total_points_earned: 0, completed_in_seconds: null, started_at: new Date(), submitted_at: null, created_at: new Date(), updated_at: new Date() }));
  console.log(serializePracticeSetting({ difficulty_level: 'easy', question_count: 10, is_enabled: 1, updated_at: new Date() }));
  "
  ```
  Expected: first line shows `quizId: null` (not `0`); second line shows `{ difficulty: 'easy', questionCount: 10, isEnabled: true, updatedAt: '...' }`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/utils/serializers.js
  git commit -m "$(cat <<'EOF'
  Fix serializeQuizAttempt's null quiz_id handling, add practice setting serializer

  Number(null) previously coerced a practice attempt's null quiz_id to
  0, which would misrepresent it as belonging to a real quiz.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 3: Backend — admin practice-settings endpoints

**Files:**
- Modify: `src/routes/v1/admin.js` (imports near the top, and two new routes before `module.exports`)

**Interfaces:**
- Consumes: `serializePracticeSetting` from Task 2; `pool`, `asyncHandler`, `badRequest`, `notFound`, `buildUpdateClause` (all already imported in this file).
- Produces: `GET /api/v1/admin/practice-settings` → `{ items: PracticeSetting[] }`; `PATCH /api/v1/admin/practice-settings/:difficulty` → the updated `PracticeSetting`. Both require admin auth (already enforced by how `admin.js` is mounted in `src/routes/v1/index.js`).

- [ ] **Step 1: Add `serializePracticeSetting` to this file's imports**

  In `src/routes/v1/admin.js`, the existing import block (lines 8-15) reads:
  ```js
  const {
    serializeCategory,
    serializeLeaderboardEntry,
    serializeLevel,
    serializeQuestion,
    serializeQuestionOption,
    serializeQuiz,
  } = require('../../utils/serializers');
  ```
  Change it to:
  ```js
  const {
    serializeCategory,
    serializeLeaderboardEntry,
    serializeLevel,
    serializePracticeSetting,
    serializeQuestion,
    serializeQuestionOption,
    serializeQuiz,
  } = require('../../utils/serializers');
  ```

- [ ] **Step 2: Add the two routes**

  At the end of `src/routes/v1/admin.js`, immediately before the line `module.exports = router;`, add:
  ```js
  const PRACTICE_DIFFICULTIES = ['easy', 'medium', 'hard'];

  router.get(
    '/practice-settings',
    asyncHandler(async (req, res) => {
      const [rows] = await pool.execute(
        `
          SELECT *
          FROM practice_settings
          ORDER BY FIELD(difficulty_level, 'easy', 'medium', 'hard')
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
  ```

- [ ] **Step 3: Verify manually against the running dev server**

  Start the backend (`npm run dev`) if it isn't already running, then:
  ```bash
  TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@nyaya.local","password":"NyayaAdmin@2026"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
  curl -s http://localhost:5000/api/v1/admin/practice-settings -H "Authorization: Bearer $TOKEN"
  curl -s -X PATCH http://localhost:5000/api/v1/admin/practice-settings/easy -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"questionCount": 8}'
  ```
  Expected: first call lists all three settings; second returns the `easy` row with `questionCount: 8`. Afterward, PATCH it back to `10` to leave the dev database in its seeded state.

- [ ] **Step 4: Commit**

  ```bash
  git add src/routes/v1/admin.js
  git commit -m "$(cat <<'EOF'
  Add admin endpoints to configure practice-mode difficulty settings

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: Backend — app-facing practice-settings endpoint

**Files:**
- Create: `src/routes/v1/practice-settings.js`
- Modify: `src/routes/v1/index.js`

**Interfaces:**
- Consumes: `serializePracticeSetting` from Task 2.
- Produces: `GET /api/v1/practice-settings` (any authenticated user) → `{ items: PracticeSetting[] }`, only rows where `is_enabled = 1`.

- [ ] **Step 1: Create the route file**

  Create `src/routes/v1/practice-settings.js`:
  ```js
  const express = require('express');
  const { pool } = require('../../config/database');
  const { asyncHandler } = require('../../utils/async-handler');
  const { serializePracticeSetting } = require('../../utils/serializers');

  const router = express.Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const [rows] = await pool.execute(
        `
          SELECT *
          FROM practice_settings
          WHERE is_enabled = 1
          ORDER BY FIELD(difficulty_level, 'easy', 'medium', 'hard')
        `
      );

      res.json({ items: rows.map(serializePracticeSetting) });
    })
  );

  module.exports = router;
  ```

- [ ] **Step 2: Register it**

  In `src/routes/v1/index.js`, add the require alongside the others:
  ```js
  const leaderboardRoutes = require('./leaderboards');
  const practiceSettingsRoutes = require('./practice-settings');
  const adminRoutes = require('./admin');
  ```
  And mount it alongside the other authenticated routes, before the `/admin` mount:
  ```js
  router.use('/leaderboards', leaderboardRoutes);
  router.use('/practice-settings', practiceSettingsRoutes);

  router.use('/admin', requireAdmin, auditAdminActions, adminRoutes);
  ```

- [ ] **Step 3: Verify manually**

  ```bash
  TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@nyaya.local","password":"NyayaAdmin@2026"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
  curl -s http://localhost:5000/api/v1/practice-settings -H "Authorization: Bearer $TOKEN"
  ```
  Expected: `{"items":[{"difficulty":"easy",...},{"difficulty":"medium",...},{"difficulty":"hard",...}]}` (all three, since all are enabled at this point).

- [ ] **Step 4: Commit**

  ```bash
  git add src/routes/v1/practice-settings.js src/routes/v1/index.js
  git commit -m "$(cat <<'EOF'
  Add app-facing GET /practice-settings endpoint

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: Backend — start a practice attempt, and let answer submission recognize it

**Files:**
- Modify: `src/routes/v1/quiz-attempts.js`

**Interfaces:**
- Consumes: `withTransaction`, `pool`, `asyncHandler`, `badRequest`, `notFound`, `requireFields` (already imported in this file); needs `serializePlayableQuestion` added to its serializer import.
- Produces: `POST /api/v1/quiz-attempts/custom` → `201 { attempt: QuizAttempt, questions: PlayableQuestion[] }`. Modifies the existing `POST /:attemptId/answers` question-ownership check to also accept membership via `quiz_attempt_questions`.

- [ ] **Step 1: Add `serializePlayableQuestion` to this file's imports**

  Change:
  ```js
  const { serializeQuestionAttempt, serializeQuizAttempt } = require('../../utils/serializers');
  ```
  to:
  ```js
  const { serializePlayableQuestion, serializeQuestionAttempt, serializeQuizAttempt } = require('../../utils/serializers');
  ```

- [ ] **Step 2: Add the custom-attempt route**

  Add this immediately after the existing `router.post('/', ...)` block (the one that starts a normal attempt, ending around line 72) and before `router.get('/', ...)`:
  ```js
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
  ```

- [ ] **Step 3: Make the answer-ownership check also accept join-table membership**

  In the existing `router.post('/:attemptId/answers', ...)` handler, find:
  ```js
        const questionId = parseId(payload.questionId, 'questionId');
        const selectedOptionId = parseId(payload.selectedOptionId, 'selectedOptionId');
        const [questionRows] = await connection.execute(
          `
            SELECT *
            FROM questions
            WHERE id = ? AND quiz_id = ? AND is_active = 1
            LIMIT 1
          `,
          [questionId, Number(attempt.quiz_id)]
        );
        const question = questionRows[0];

        if (!question) {
          throw notFound('Question not found for this attempt');
        }
  ```
  Replace it with:
  ```js
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
  ```

- [ ] **Step 4: Verify manually end to end**

  ```bash
  TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@nyaya.local","password":"NyayaAdmin@2026"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
  curl -s -X POST http://localhost:5000/api/v1/quiz-attempts/custom -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"difficulty":"medium"}'
  ```
  Expected: `201` with `attempt.quizId: null`, `attempt.totalQuestions: 10`, and `questions` containing 10 items each with `options` but no `isCorrect` field (matching the existing playable-question shape).

- [ ] **Step 5: Commit**

  ```bash
  git add src/routes/v1/quiz-attempts.js
  git commit -m "$(cat <<'EOF'
  Add POST /quiz-attempts/custom and recognize practice attempts in answer validation

  A practice attempt's questions are recorded in quiz_attempt_questions
  instead of being implied by a single quiz_id, so the existing
  ownership check gains a second path for it — every category attempt
  is unaffected.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: Backend — integration tests

**Files:**
- Create: `src/tests/practice-quiz.test.js`

**Interfaces:**
- Consumes: `pool`, `startTestServer`, `call`, `registerTestUser`, `loginAsAdmin`, `deleteTestUser` from `src/tests/helpers.js` (all already exist; no changes to that file).

- [ ] **Step 1: Write the test file**

  Create `src/tests/practice-quiz.test.js`:
  ```js
  const { test, before, after } = require('node:test');
  const assert = require('node:assert/strict');
  const {
    pool,
    startTestServer,
    call,
    registerTestUser,
    loginAsAdmin,
    deleteTestUser,
  } = require('./helpers');

  let server;
  let adminToken;

  before(async () => {
    server = await startTestServer();
    adminToken = await loginAsAdmin(server.baseUrl);
  });

  after(async () => {
    await server.close();
    await pool.end();
  });

  test('admin can read and update practice settings, and disabling one hides it from the app-facing list', async () => {
    const listBefore = await call(server.baseUrl, 'GET', '/admin/practice-settings', adminToken);
    assert.equal(listBefore.status, 200);
    const easyBefore = listBefore.body.items.find((item) => item.difficulty === 'easy');
    assert.ok(easyBefore, 'expected an easy row to already exist (seeded by migration 0006)');

    try {
      const updated = await call(
        server.baseUrl,
        'PATCH',
        '/admin/practice-settings/easy',
        adminToken,
        { questionCount: 3, isEnabled: false }
      );
      assert.equal(updated.status, 200);
      assert.equal(updated.body.questionCount, 3);
      assert.equal(updated.body.isEnabled, false);

      const publicList = await call(server.baseUrl, 'GET', '/practice-settings', adminToken);
      assert.equal(publicList.status, 200);
      assert.equal(
        publicList.body.items.some((item) => item.difficulty === 'easy'),
        false,
        'a disabled difficulty should not appear in the app-facing list'
      );
    } finally {
      await call(server.baseUrl, 'PATCH', '/admin/practice-settings/easy', adminToken, {
        questionCount: easyBefore.questionCount,
        isEnabled: true,
      });
    }
  });

  test('starting a practice quiz for a disabled difficulty is rejected', async () => {
    const user = await registerTestUser(server.baseUrl);

    try {
      await call(server.baseUrl, 'PATCH', '/admin/practice-settings/hard', adminToken, {
        isEnabled: false,
      });

      const started = await call(server.baseUrl, 'POST', '/quiz-attempts/custom', user.accessToken, {
        difficulty: 'hard',
      });
      assert.equal(started.status, 400);
    } finally {
      await call(server.baseUrl, 'PATCH', '/admin/practice-settings/hard', adminToken, {
        isEnabled: true,
      });
      await deleteTestUser(user.user.id);
    }
  });

  test('a practice quiz draws cross-category questions, grades, and awards points like a category quiz', async () => {
    const user = await registerTestUser(server.baseUrl);

    try {
      const started = await call(server.baseUrl, 'POST', '/quiz-attempts/custom', user.accessToken, {
        difficulty: 'medium',
      });
      assert.equal(started.status, 201);
      assert.equal(started.body.attempt.quizId, null, 'a practice attempt has no owning quiz');
      assert.ok(started.body.questions.length > 0);

      const attemptId = started.body.attempt.id;
      const firstQuestion = started.body.questions[0];
      const correctOptionId = firstQuestion.options[0].id;

      const answered = await call(
        server.baseUrl,
        'POST',
        `/quiz-attempts/${attemptId}/answers`,
        user.accessToken,
        { questionId: firstQuestion.id, selectedOptionId: correctOptionId }
      );
      assert.equal(answered.status, 201);

      const submitted = await call(
        server.baseUrl,
        'POST',
        `/quiz-attempts/${attemptId}/submit`,
        user.accessToken
      );
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.attempt.status, 'submitted');

      const progress = await call(server.baseUrl, 'GET', '/users/me/progress', user.accessToken);
      assert.equal(progress.status, 200);
    } finally {
      await deleteTestUser(user.user.id);
    }
  });

  test('answering a question outside the practice attempt\'s assigned set is rejected', async () => {
    const user = await registerTestUser(server.baseUrl);

    try {
      const started = await call(server.baseUrl, 'POST', '/quiz-attempts/custom', user.accessToken, {
        difficulty: 'medium',
      });
      const attemptId = started.body.attempt.id;
      const assignedQuestionIds = new Set(started.body.questions.map((q) => q.id));

      const [[otherQuestion]] = await pool.query(
        'SELECT id FROM questions WHERE difficulty_level != ? AND is_active = 1 LIMIT 1',
        ['medium']
      );
      assert.ok(otherQuestion, 'expected at least one non-medium question to exist');
      assert.equal(assignedQuestionIds.has(Number(otherQuestion.id)), false);

      const [[option]] = await pool.query('SELECT id FROM question_options WHERE question_id = ? LIMIT 1', [
        otherQuestion.id,
      ]);

      const rejected = await call(
        server.baseUrl,
        'POST',
        `/quiz-attempts/${attemptId}/answers`,
        user.accessToken,
        { questionId: otherQuestion.id, selectedOptionId: option.id }
      );
      assert.equal(rejected.status, 404);
    } finally {
      await deleteTestUser(user.user.id);
    }
  });
  ```

- [ ] **Step 2: Run it**

  Run: `npm test -- src/tests/practice-quiz.test.js` (or `node --test src/tests/practice-quiz.test.js`)
  Expected: all 4 tests pass. If "expected at least one non-medium question to exist" fails, the seed data has changed since this plan was written — check `SELECT difficulty_level, COUNT(*) FROM questions WHERE is_active=1 GROUP BY difficulty_level` and adjust the query's difficulty accordingly.

- [ ] **Step 3: Run the full backend test suite to confirm nothing else broke**

  Run: `npm test`
  Expected: every test file passes, including the pre-existing `quiz-levels.test.js`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/tests/practice-quiz.test.js
  git commit -m "$(cat <<'EOF'
  Add integration tests for practice-mode quiz attempts

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Admin panel — types and API client

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/features/content/api.ts`

**Interfaces:**
- Produces: `PracticeSetting` type; `getPracticeSettings(): Promise<PracticeSetting[]>`; `savePracticeSetting(difficulty, payload): Promise<PracticeSetting>`.

- [ ] **Step 1: Add the type**

  In `frontend/src/lib/types.ts`, add (near the `Quiz` interface):
  ```ts
  export interface PracticeSetting {
    difficulty: 'easy' | 'medium' | 'hard';
    questionCount: number;
    isEnabled: boolean;
    updatedAt: string;
  }
  ```

- [ ] **Step 2: Add the API functions**

  In `frontend/src/features/content/api.ts`, change the top import from:
  ```ts
  import { Category, Question, QuestionOption, Quiz } from '@/lib/types';
  ```
  to:
  ```ts
  import { Category, PracticeSetting, Question, QuestionOption, Quiz } from '@/lib/types';
  ```
  Then add, near `getQuizzes`/`saveQuiz`:
  ```ts
  export async function getPracticeSettings() {
    const response = await httpClient.get<{ items: PracticeSetting[] }>('/admin/practice-settings');
    return response.data.items;
  }

  export async function savePracticeSetting(
    difficulty: PracticeSetting['difficulty'],
    payload: { questionCount: number; isEnabled: boolean }
  ) {
    const response = await httpClient.patch<PracticeSetting>(
      `/admin/practice-settings/${difficulty}`,
      payload
    );
    return response.data;
  }
  ```

- [ ] **Step 3: Verify the frontend still typechecks**

  Run: `cd frontend && npx tsc --noEmit`
  Expected: no new errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/lib/types.ts frontend/src/features/content/api.ts
  git commit -m "$(cat <<'EOF'
  Add PracticeSetting type and admin API client functions

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 8: Admin panel — Practice settings panel and Quizzes-page toggle

**Files:**
- Create: `frontend/src/features/content/PracticeSettingsPanel.tsx`
- Modify: `frontend/src/features/content/QuizzesPage.tsx`

**Interfaces:**
- Consumes: `getPracticeSettings`, `savePracticeSetting` from Task 7; `Card`, `Badge`, `Button`, `Input`, `Checkbox` UI components (all pre-existing, already used elsewhere in this feature folder).
- Produces: a `PracticeSettingsPanel` component; `QuizzesPage` renders a `Quizzes | Practice` toggle and swaps between the existing list and this panel.

- [ ] **Step 1: Write `PracticeSettingsPanel.tsx`**

  Create `frontend/src/features/content/PracticeSettingsPanel.tsx`:
  ```tsx
  import { useEffect, useState } from 'react';
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import { toast } from 'sonner';
  import { getPracticeSettings, savePracticeSetting } from '@/features/content/api';
  import { Badge } from '@/components/ui/Badge';
  import { Button } from '@/components/ui/Button';
  import { Card } from '@/components/ui/Card';
  import { Checkbox } from '@/components/ui/Checkbox';
  import { EmptyState } from '@/components/ui/EmptyState';
  import { Input } from '@/components/ui/Input';
  import { PracticeSetting } from '@/lib/types';
  import { getErrorMessage } from '@/lib/utils';

  function DifficultyRow({ setting }: { setting: PracticeSetting }) {
    const queryClient = useQueryClient();
    const [questionCount, setQuestionCount] = useState(setting.questionCount);
    const [isEnabled, setIsEnabled] = useState(setting.isEnabled);

    useEffect(() => {
      setQuestionCount(setting.questionCount);
      setIsEnabled(setting.isEnabled);
    }, [setting.questionCount, setting.isEnabled]);

    const saveMutation = useMutation({
      mutationFn: () => savePracticeSetting(setting.difficulty, { questionCount, isEnabled }),
      onSuccess: () => {
        toast.success(`${setting.difficulty} practice settings updated.`);
        queryClient.invalidateQueries({ queryKey: ['practice-settings'] });
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });

    const isDirty = questionCount !== setting.questionCount || isEnabled !== setting.isEnabled;

    return (
      <tr>
        <td className="px-5 py-4">
          <Badge className="capitalize">{setting.difficulty}</Badge>
        </td>
        <td className="px-5 py-4">
          <Input
            type="number"
            min={1}
            className="w-24"
            value={questionCount}
            onChange={(event) => setQuestionCount(Number(event.target.value))}
          />
        </td>
        <td className="px-5 py-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
            Enabled
          </label>
        </td>
        <td className="px-5 py-4 text-right">
          <Button
            variant="secondary"
            size="sm"
            disabled={!isDirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </td>
      </tr>
    );
  }

  export function PracticeSettingsPanel() {
    const settingsQuery = useQuery({
      queryKey: ['practice-settings'],
      queryFn: getPracticeSettings,
    });

    return (
      <Card className="overflow-hidden">
        {settingsQuery.isPending ? (
          <div className="p-6">
            <EmptyState
              title="Loading practice settings..."
              description="Fetching question count and enabled state for each difficulty."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">Difficulty</th>
                  <th className="px-5 py-4 font-medium">Question count</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(settingsQuery.data || []).map((setting) => (
                  <DifficultyRow key={setting.difficulty} setting={setting} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    );
  }
  ```

- [ ] **Step 2: Wire the toggle into `QuizzesPage.tsx`**

  Add the import:
  ```tsx
  import { PracticeSettingsPanel } from '@/features/content/PracticeSettingsPanel';
  ```
  Add state near the other `useState` calls at the top of `QuizzesPage`:
  ```tsx
    const [activeTab, setActiveTab] = useState<'quizzes' | 'practice'>('quizzes');
  ```
  Add the toggle right after the closing `</PageHeader>` tag and before the existing `<Card className="overflow-hidden">` block:
  ```tsx
        <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1 w-fit">
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === 'quizzes' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('quizzes')}
          >
            Quizzes
          </button>
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === 'practice' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('practice')}
          >
            Practice
          </button>
        </div>
  ```
  Then wrap the existing `<Card className="overflow-hidden">...</Card>` block (the quiz table) in a conditional, and render the panel otherwise:
  ```tsx
        {activeTab === 'quizzes' ? (
          <Card className="overflow-hidden">
            {/* ...unchanged existing contents... */}
          </Card>
        ) : (
          <PracticeSettingsPanel />
        )}
  ```
  (Only the wrapping condition changes — the JSX previously inside that `<Card>` stays exactly as it is today.)

- [ ] **Step 3: Verify in the running dev server**

  With the backend and `cd frontend && npm run dev` both running, open the admin panel, log in, go to Content → Quizzes, and confirm:
  - The `Quizzes | Practice` toggle appears.
  - `Quizzes` shows the existing list unchanged.
  - `Practice` shows three rows (Easy/Medium/Hard), each editable, and Save persists a change (confirm by reloading the page and seeing the new value).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/features/content/PracticeSettingsPanel.tsx frontend/src/features/content/QuizzesPage.tsx
  git commit -m "$(cat <<'EOF'
  Add Practice settings subsection to the admin Quizzes page

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 9: Mobile app — `QuizApi` additions and a `RemoteAttempt.quizId` fix

**Files:**
- Modify: `lib/features/quiz_question/data/quiz_api.dart`
- Test: `test/features/quiz_question/data/quiz_api_test.dart`

**Interfaces:**
- Produces: `class PracticeSetting { difficulty, questionCount }`; `QuizApi.fetchPracticeSettings(): Future<List<PracticeSetting>>`; `QuizApi.startCustomAttempt(String difficulty): Future<({RemoteAttempt attempt, List<QuizQuestion> questions})>`. Changes `RemoteAttempt.quizId` from `int` to `int?` (a practice attempt's `quizId` comes back as `null` from the backend after Task 2's fix — the old code would crash on `null as num`).

- [ ] **Step 1: Write the failing tests**

  Add to `test/features/quiz_question/data/quiz_api_test.dart` (inside the existing `main()`, alongside the other `test(...)` calls):
  ```dart
  test('fetchPracticeSettings parses the enabled difficulties', () async {
    final api = apiReturning(
      (_) => {
        'items': [
          {'difficulty': 'easy', 'questionCount': 10},
          {'difficulty': 'medium', 'questionCount': 10},
        ],
      },
    );

    final settings = await api.fetchPracticeSettings();

    expect(settings, hasLength(2));
    expect(settings.first.difficulty, 'easy');
    expect(settings.first.questionCount, 10);
  });

  test('startCustomAttempt returns a null-quizId attempt and its questions', () async {
    final api = apiReturning(
      (_) => {
        'attempt': {
          'id': 99,
          'quizId': null,
          'status': 'in_progress',
          'totalQuestions': 1,
          'answeredQuestions': 0,
          'correctAnswers': 0,
        },
        'questions': [playableQuestion(explanation: 'Because.')],
      },
    );

    final result = await api.startCustomAttempt('medium');

    expect(result.attempt.id, 99);
    expect(result.attempt.quizId, isNull);
    expect(result.questions, hasLength(1));
    expect(result.questions.single.remoteId, 42);
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `flutter test test/features/quiz_question/data/quiz_api_test.dart`
  Expected: FAIL — `fetchPracticeSettings`/`startCustomAttempt`/`PracticeSetting` are not defined yet.

- [ ] **Step 3: Change `RemoteAttempt.quizId` to nullable**

  In `lib/features/quiz_question/data/quiz_api.dart`, in the `RemoteAttempt` class, change:
  ```dart
    const RemoteAttempt({
      required this.id,
      required this.quizId,
  ```
  (constructor signature unchanged — `quizId` stays `required`, just now accepts `null`) and change the field declaration:
  ```dart
    final int quizId;
  ```
  to:
  ```dart
    final int? quizId;
  ```
  and in `fromJson`, change:
  ```dart
      quizId: (json['quizId'] as num).toInt(),
  ```
  to:
  ```dart
      quizId: json['quizId'] == null ? null : (json['quizId'] as num).toInt(),
  ```

- [ ] **Step 4: Add `PracticeSetting` and the two `QuizApi` methods**

  Add this class near the top of `quiz_api.dart`, after the `RemoteQuiz` class:
  ```dart
  /// One practice-mode difficulty tier, as configured by an admin.
  class PracticeSetting {
    const PracticeSetting({required this.difficulty, required this.questionCount});

    final String difficulty;
    final int questionCount;

    static PracticeSetting fromJson(Map<String, Object?> json) => PracticeSetting(
      difficulty: json['difficulty'] as String,
      questionCount: (json['questionCount'] as num).toInt(),
    );
  }
  ```
  Add these two methods inside the `QuizApi` class, after `fetchQuizzes`:
  ```dart
    /// The difficulty tiers currently enabled for practice mode.
    Future<List<PracticeSetting>> fetchPracticeSettings() async {
      final json = await _client.get('/practice-settings');
      final items = json['items'] as List<Object?>;
      return [
        for (final item in items) PracticeSetting.fromJson(item as Map<String, Object?>),
      ];
    }

    /// Starts a cross-category attempt built from questions at [difficulty].
    Future<({RemoteAttempt attempt, List<QuizQuestion> questions})> startCustomAttempt(
      String difficulty,
    ) async {
      final json = await _client.post('/quiz-attempts/custom', {'difficulty': difficulty});
      final attempt = RemoteAttempt.fromJson(json['attempt'] as Map<String, Object?>);
      final items = json['questions'] as List<Object?>;
      final questions = [
        for (final item in items) _parseQuestion(item as Map<String, Object?>),
      ];
      return (attempt: attempt, questions: questions);
    }
  ```

- [ ] **Step 5: Run the tests to verify they pass**

  Run: `flutter test test/features/quiz_question/data/quiz_api_test.dart`
  Expected: PASS, including the two new tests and every pre-existing one in this file.

- [ ] **Step 6: Run the full Flutter test suite to confirm the `quizId` type change didn't break anything**

  Run: `flutter test`
  Expected: all tests pass, including `test/app/quiz_catalog_test.dart` (which constructs `RemoteAttempt` JSON with a real `quizId` — still valid under the nullable type).

- [ ] **Step 7: Commit**

  ```bash
  git add lib/features/quiz_question/data/quiz_api.dart test/features/quiz_question/data/quiz_api_test.dart
  git commit -m "$(cat <<'EOF'
  Add practice-mode API calls to QuizApi

  RemoteAttempt.quizId becomes nullable to match the backend, which now
  returns null (not a fabricated quiz id) for a practice attempt.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 10: Mobile app — `QuizCatalog.prepareCustom`

**Files:**
- Modify: `lib/app/quiz_catalog.dart`
- Test: `test/app/quiz_catalog_test.dart`

**Interfaces:**
- Consumes: `QuizApi.startCustomAttempt` from Task 9.
- Produces: `QuizCatalog.prepareCustom(String difficulty): Future<QuizLaunch>` — same never-throws contract as `prepare()`: returns a `QuizLaunch` with empty `questions` (so `launch.isOffline` and `launch.questions.isEmpty` both read true) whenever the user isn't signed in, the network fails, or the difficulty comes back with no questions. There is deliberately no bundled fallback content for a cross-category quiz, so "empty questions" is the failure signal a caller checks for — the same signal `_startLeaderboardQuiz`'s `requireOnline` pool-quiz path already relies on for quizzes with no offline copy.

- [ ] **Step 1: Write the failing tests**

  Add to `test/app/quiz_catalog_test.dart` (inside `main()`, alongside the existing tests):
  ```dart
  test('prepareCustom: a signed-out user gets an empty, offline launch', () async {
    AppSession.accessToken = null;
    final catalog = catalogOn(
      MockClient((_) async => throw StateError('should not be called')),
    );

    final launch = await catalog.prepareCustom('medium');

    expect(launch.isOffline, isTrue);
    expect(launch.questions, isEmpty);
  });

  test('prepareCustom: an unreachable server also yields an empty, offline launch', () async {
    final catalog = catalogOn(
      MockClient((_) async => throw http.ClientException('offline')),
    );

    final launch = await catalog.prepareCustom('medium');

    expect(launch.isOffline, isTrue);
    expect(launch.questions, isEmpty);
  });

  test('prepareCustom: a reachable server starts an attempt over the drawn questions', () async {
    final catalog = catalogOn(
      MockClient(
        (request) async => http.Response(
          jsonEncode({
            'attempt': {
              'id': 61,
              'quizId': null,
              'status': 'in_progress',
              'totalQuestions': 2,
              'answeredQuestions': 0,
              'correctAnswers': 0,
            },
            'questions': [
              for (var i = 0; i < 2; i++)
                {
                  'id': 300 + i,
                  'questionText': 'Question ${i + 1}',
                  'explanation': 'Because.',
                  'options': [
                    {'id': 400 + i * 2, 'optionText': 'A', 'displayOrder': 1},
                    {'id': 401 + i * 2, 'optionText': 'B', 'displayOrder': 2},
                  ],
                },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    final launch = await catalog.prepareCustom('medium');

    expect(launch.isOffline, isFalse);
    expect(launch.attemptId, 61);
    expect(launch.questions, hasLength(2));
    expect(launch.questions.first.remoteId, 300);
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `flutter test test/app/quiz_catalog_test.dart`
  Expected: FAIL — `prepareCustom` is not defined yet.

- [ ] **Step 3: Implement `prepareCustom`**

  Add this method to the `QuizCatalog` class in `lib/app/quiz_catalog.dart`, after `prepare`:
  ```dart
    /// Prepares a cross-category, difficulty-scoped practice quiz.
    ///
    /// There is no bundled offline content for a random cross-category
    /// draw, so — unlike [prepare] — failure here means "nothing to
    /// play" rather than "study the offline copy": the returned
    /// [QuizLaunch] has empty [QuizLaunch.questions] whenever the user
    /// isn't signed in, the server can't be reached, or the difficulty
    /// currently has no questions.
    Future<QuizLaunch> prepareCustom(String difficulty) async {
      const offline = QuizLaunch(
        slug: 'practice',
        questions: [],
        title: 'Practice Quiz',
      );

      if (AppSession.accessToken == null) {
        return offline;
      }

      try {
        final result = await _api.startCustomAttempt(difficulty);

        if (result.questions.isEmpty) {
          return offline;
        }

        return QuizLaunch(
          slug: 'practice-$difficulty',
          questions: result.questions,
          title: 'Practice Quiz',
          grader: RemoteQuizGrader(api: _api, attemptId: result.attempt.id),
          attemptId: result.attempt.id,
          api: _api,
        );
      } on Object {
        return offline;
      }
    }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `flutter test test/app/quiz_catalog_test.dart`
  Expected: PASS, including all pre-existing tests in this file.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/app/quiz_catalog.dart test/app/quiz_catalog_test.dart
  git commit -m "$(cat <<'EOF'
  Add QuizCatalog.prepareCustom for practice-mode quizzes

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 11: Mobile app — Practice subsection in the Quizzes tab

**Files:**
- Modify: `lib/features/categories/presentation/categories_page.dart`
- Test: `test/features/categories/presentation/categories_page_test.dart`

**Interfaces:**
- Consumes: `QuizApi`, `PracticeSetting` from Task 9.
- Produces: `CategoriesPage` gains an optional `ValueChanged<String>? onDifficultySelected` constructor parameter and an optional `QuizApi? practiceApi` parameter (for test injection, matching the existing `AuthApi?`/`QuizApi?` dependency-injection pattern already used by `SignInPage`/`QuizCatalog` elsewhere in this codebase). It renders a `Categories | Practice` toggle below the hero card; selecting Practice shows one card per enabled difficulty, and tapping a card calls `onDifficultySelected(difficulty)`.

- [ ] **Step 1: Write the failing test**

  Add to `test/features/categories/presentation/categories_page_test.dart`. First, add the needed imports at the top:
  ```dart
  import 'dart:convert';
  import 'package:http/http.dart' as http;
  import 'package:http/testing.dart';
  import 'package:nyaya/app/api_client.dart';
  import 'package:nyaya/features/quiz_question/data/quiz_api.dart';
  ```
  Then update the `pumpCategoriesPage` helper to accept the two new parameters and pass them through:
  ```dart
    Future<void> pumpCategoriesPage(
      WidgetTester tester, {
      VoidCallback? onBackPressed,
      ValueChanged<HomeCategoryData>? onCategorySelected,
      ValueChanged<int>? onNavigationSelected,
      ValueChanged<String>? onDifficultySelected,
      QuizApi? practiceApi,
    }) async {
      tester.view.physicalSize = const Size(393, 1600);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        MaterialApp(
          home: CategoriesPage(
            viewModel: const HomeViewModel(),
            onBackPressed: onBackPressed,
            onCategorySelected: onCategorySelected,
            onNavigationSelected: onNavigationSelected,
            onDifficultySelected: onDifficultySelected,
            practiceApi: practiceApi,
          ),
        ),
      );
      await tester.pumpAndSettle();
    }
  ```
  Then add a new test:
  ```dart
    testWidgets('switching to Practice and tapping a difficulty reports it', (
      WidgetTester tester,
    ) async {
      String? selectedDifficulty;
      final api = QuizApi(
        client: ApiClient(
          baseUrl: 'http://test/api/v1',
          httpClient: MockClient(
            (_) async => http.Response(
              jsonEncode({
                'items': [
                  {'difficulty': 'easy', 'questionCount': 10},
                  {'difficulty': 'medium', 'questionCount': 10},
                ],
              }),
              200,
              headers: {'content-type': 'application/json'},
            ),
          ),
        ),
      );

      await pumpCategoriesPage(
        tester,
        onDifficultySelected: (difficulty) => selectedDifficulty = difficulty,
        practiceApi: api,
      );

      await tester.tap(find.byKey(const ValueKey('categories.tab.practice')));
      await tester.pumpAndSettle();

      final easyCard = find.byKey(const ValueKey('practice.card.easy'));
      await tester.ensureVisible(easyCard);
      await tester.pumpAndSettle();
      await tester.tap(easyCard);
      await tester.pumpAndSettle();

      expect(selectedDifficulty, 'easy');
    });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `flutter test test/features/categories/presentation/categories_page_test.dart`
  Expected: FAIL — `CategoriesPage` has no `onDifficultySelected`/`practiceApi` parameters and no `categories.tab.practice` key yet.

- [ ] **Step 3: Convert `CategoriesPage` to a `StatefulWidget` and add the toggle + Practice section**

  In `lib/features/categories/presentation/categories_page.dart`, add this import near the top:
  ```dart
  import '../../quiz_question/data/quiz_api.dart';
  ```
  Replace the whole `CategoriesPage` class (from `class CategoriesPage extends StatelessWidget {` through its closing `}`, i.e. lines 16-119 as currently written) with:
  ```dart
  enum _QuizzesTab { categories, practice }

  /// The "Quizzes" tab (also Home's "View All"): every category as a card
  /// along the same winding road the Leaderboard journey uses, so the two
  /// tabs read as one app. Nothing here is locked or sequential — the road is
  /// purely the shared visual language. A second "Practice" subsection sits
  /// alongside it for the difficulty-based cross-category quizzes.
  class CategoriesPage extends StatefulWidget {
    const CategoriesPage({
      super.key,
      required this.viewModel,
      this.onBackPressed,
      this.onCategorySelected,
      this.onNavigationSelected,
      this.onJourneyPressed,
      this.onDifficultySelected,
      this.practiceApi,
    });

    final HomeViewModel viewModel;
    final VoidCallback? onBackPressed;
    final ValueChanged<HomeCategoryData>? onCategorySelected;
    final ValueChanged<int>? onNavigationSelected;

    /// Opens the credits journey; its hero button is hidden when unset.
    final VoidCallback? onJourneyPressed;

    /// Called with 'easy' | 'medium' | 'hard' when a Practice card is tapped.
    final ValueChanged<String>? onDifficultySelected;

    /// Overridden in tests; defaults to a real [QuizApi] otherwise.
    final QuizApi? practiceApi;

    @override
    State<CategoriesPage> createState() => _CategoriesPageState();
  }

  class _CategoriesPageState extends State<CategoriesPage> {
    static const _activeNavigationIndex = 1;

    _QuizzesTab _tab = _QuizzesTab.categories;

    @override
    Widget build(BuildContext context) {
      final categories = widget.viewModel.categories;

      void select(HomeCategoryData category) {
        final callback = widget.onCategorySelected;
        if (callback != null) {
          callback(category);
          return;
        }
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(content: Text('${category.label} is not wired yet.')),
          );
      }

      return Scaffold(
        backgroundColor: JourneyColors.pageBackground,
        bottomNavigationBar: HomeBottomNavigationBar(
          items: widget.viewModel.navigationItems,
          activeIndex: _activeNavigationIndex,
          onSelected: (index) {
            final callback = widget.onNavigationSelected;
            if (callback != null) {
              callback(index);
              return;
            }
            if (index == _activeNavigationIndex) {
              return;
            }
            Navigator.of(context).maybePop();
          },
        ),
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              JourneyHeader(
                backKey: const ValueKey('categories.back'),
                onBackPressed: () {
                  final callback = widget.onBackPressed;
                  if (callback != null) {
                    callback();
                    return;
                  }
                  Navigator.of(context).maybePop();
                },
              ),
              Expanded(
                child: ListView(
                  key: const ValueKey('categories.grid'),
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
                  children: [
                    FadeSlideIn(
                      child: _QuizzesHero(
                        count: categories.length,
                        onJourney: widget.onJourneyPressed,
                        onSurprise: categories.isEmpty
                            ? null
                            : () => select(
                                categories[math.Random().nextInt(
                                  categories.length,
                                )],
                              ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    FadeSlideIn(
                      delay: Motion.stagger,
                      child: _TabToggle(
                        tab: _tab,
                        onChanged: (tab) => setState(() => _tab = tab),
                      ),
                    ),
                    const SizedBox(height: 16),
                    FadeSlideIn(
                      delay: Motion.stagger,
                      child: _tab == _QuizzesTab.categories
                          ? _CategoryRoad(categories: categories, onSelected: select)
                          : _PracticeSection(
                              api: widget.practiceApi,
                              onDifficultySelected: widget.onDifficultySelected,
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }
  }

  class _TabToggle extends StatelessWidget {
    const _TabToggle({required this.tab, required this.onChanged});

    final _QuizzesTab tab;
    final ValueChanged<_QuizzesTab> onChanged;

    @override
    Widget build(BuildContext context) {
      Widget segment(String label, _QuizzesTab value, Key key) {
        final selected = tab == value;
        return Expanded(
          child: GestureDetector(
            key: key,
            onTap: () => onChanged(value),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: selected ? JourneyColors.navy : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
              ),
              alignment: Alignment.center,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : JourneyColors.navy,
                ),
              ),
            ),
          ),
        );
      }

      return Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: JourneyColors.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: JourneyColors.cardBorder),
        ),
        child: Row(
          children: [
            segment(
              'Categories',
              _QuizzesTab.categories,
              const ValueKey('categories.tab.categories'),
            ),
            segment(
              'Practice',
              _QuizzesTab.practice,
              const ValueKey('categories.tab.practice'),
            ),
          ],
        ),
      );
    }
  }

  /// Fetches the admin-configured difficulty tiers and shows one card per
  /// enabled difficulty. A disabled or currently-empty tier simply doesn't
  /// appear — there's nothing to configure client-side.
  class _PracticeSection extends StatefulWidget {
    const _PracticeSection({this.api, this.onDifficultySelected});

    final QuizApi? api;
    final ValueChanged<String>? onDifficultySelected;

    @override
    State<_PracticeSection> createState() => _PracticeSectionState();
  }

  class _PracticeSectionState extends State<_PracticeSection> {
    late final QuizApi _api = widget.api ?? QuizApi();
    late final Future<List<PracticeSetting>> _future = _api.fetchPracticeSettings();

    @override
    Widget build(BuildContext context) {
      return FutureBuilder<List<PracticeSetting>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Padding(
              key: ValueKey('practice.loading'),
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(child: CircularProgressIndicator()),
            );
          }

          final settings = snapshot.hasError ? const <PracticeSetting>[] : (snapshot.data ?? const []);

          if (settings.isEmpty) {
            return const Padding(
              key: ValueKey('practice.empty'),
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text("Practice mode isn't available right now."),
              ),
            );
          }

          return Column(
            children: [
              for (final setting in settings) ...[
                _DifficultyCard(
                  setting: setting,
                  onTap: widget.onDifficultySelected == null
                      ? null
                      : () => widget.onDifficultySelected!(setting.difficulty),
                ),
                const SizedBox(height: 12),
              ],
            ],
          );
        },
      );
    }
  }

  class _DifficultyCard extends StatelessWidget {
    const _DifficultyCard({required this.setting, this.onTap});

    final PracticeSetting setting;
    final VoidCallback? onTap;

    @override
    Widget build(BuildContext context) {
      final label = setting.difficulty[0].toUpperCase() + setting.difficulty.substring(1);

      return Material(
        color: JourneyColors.card,
        clipBehavior: Clip.antiAlias,
        shadowColor: const Color(0xFF6B4A1F).withValues(alpha: 0.25),
        elevation: 6,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: JourneyColors.cardBorder),
        ),
        child: InkWell(
          key: ValueKey('practice.card.${setting.difficulty}'),
          onTap: onTap == null
              ? null
              : () {
                  Motion.tick();
                  onTap!();
                },
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          fontSize: 16.5,
                          fontWeight: FontWeight.w800,
                          color: JourneyColors.navy,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${setting.questionCount} questions, mixed categories',
                        style: const TextStyle(fontSize: 12, color: HomePage.supportText),
                      ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.arrow_forward_rounded,
                  size: 20,
                  color: JourneyColors.goldDeep,
                ),
              ],
            ),
          ),
        ),
      );
    }
  }
  ```
  Leave every other class in this file (`_QuizzesHero`, `_CategoryRoad`, `_CategoryCard`, `_ComingSoonCap`) exactly as it is — only the `CategoriesPage` class itself is being replaced.

- [ ] **Step 4: Run the test to verify it passes**

  Run: `flutter test test/features/categories/presentation/categories_page_test.dart`
  Expected: PASS, including every pre-existing test in this file (they don't pass `practiceApi`, so `_PracticeSection` would hit a real `QuizApi()` if they ever switched tabs — but none of the existing tests do, so this is safe).

- [ ] **Step 5: Run the full Flutter test suite**

  Run: `flutter test`
  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add lib/features/categories/presentation/categories_page.dart test/features/categories/presentation/categories_page_test.dart
  git commit -m "$(cat <<'EOF'
  Add Practice subsection toggle to the Quizzes tab

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 12: Mobile app — wire Practice into the quiz-launch flow

**Files:**
- Modify: `lib/app/post_sign_up_flow.dart`

**Interfaces:**
- Consumes: `QuizCatalog.prepareCustom` from Task 10; `CategoriesPage.onDifficultySelected` from Task 11; pre-existing `showQuizCostDialog`, `LeaderboardProgressStore.spend`/`refund`/`quizCost`/`refreshRegen`.
- Produces: tapping a Practice difficulty card spends credits (with the same cost-confirmation dialog category quizzes use), plays the quiz through the existing question/result screens, and refunds the credits if the attempt couldn't be started.

- [ ] **Step 1: Let `_startQuiz` accept an alternate launcher**

  In `lib/app/post_sign_up_flow.dart`, find the `_startQuiz` function signature:
  ```dart
  Future<void> _startQuiz(
    BuildContext context,
    _BundledQuiz bundled, {
    bool resume = false,
    bool requireOnline = false,
    VoidCallback? onUnavailable,
    String? leaderboardSlug,
  }) async {
  ```
  Change it to add one optional parameter:
  ```dart
  Future<void> _startQuiz(
    BuildContext context,
    _BundledQuiz bundled, {
    bool resume = false,
    bool requireOnline = false,
    VoidCallback? onUnavailable,
    String? leaderboardSlug,
    // Overrides how the launch is resolved — used by practice mode,
    // which has no slug to look up and no bundled fallback. Every
    // other caller leaves this null and gets today's behavior.
    Future<QuizLaunch> Function()? launcher,
  }) async {
  ```
  Then find this line inside the function body:
  ```dart
    final launch = await _catalog.prepare(
      slug: bundled.slug,
      fallbackQuestions: bundled.questions,
      fallbackTitle: bundled.title,
      resume: resume,
    );
  ```
  Replace it with:
  ```dart
    final launch = await (launcher ??
        () => _catalog.prepare(
          slug: bundled.slug,
          fallbackQuestions: bundled.questions,
          fallbackTitle: bundled.title,
          resume: resume,
        ))();
  ```

- [ ] **Step 2: Add the difficulty-selection handler**

  Add this function near `_handleCategorySelected` (they follow the same shape):
  ```dart
  /// Spends the entry cost and plays a practice quiz at [difficulty].
  /// There's no bundled fallback for a cross-category draw, so a failed
  /// start refunds the credits instead of falling back to an offline
  /// copy — the same tradeoff [_startLeaderboardQuiz] already makes for
  /// pool quizzes with no offline content.
  Future<void> _handleDifficultySelected(
    BuildContext context,
    String difficulty,
  ) async {
    await LeaderboardProgressStore.refreshRegen();
    if (!context.mounted) {
      return;
    }

    final label = difficulty[0].toUpperCase() + difficulty.substring(1);
    final confirmed = await showQuizCostDialog(
      context,
      title: 'Practice Quiz',
      subtitle: '$label difficulty',
    );
    if (!confirmed || !context.mounted) {
      return;
    }

    if (!await LeaderboardProgressStore.spend(LeaderboardProgressStore.quizCost)) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            const SnackBar(content: Text('Not enough credits for this quiz.')),
          );
      }
      return;
    }
    if (!context.mounted) {
      return;
    }

    await _startQuiz(
      context,
      _BundledQuiz(
        slug: 'practice-$difficulty',
        title: 'Practice Quiz ($label)',
        questions: const [],
      ),
      requireOnline: true,
      onUnavailable: () => LeaderboardProgressStore.refund(LeaderboardProgressStore.quizCost),
      launcher: () => _catalog.prepareCustom(difficulty),
    );
  }
  ```

- [ ] **Step 3: Wire it into the `CategoriesPage` call site**

  Find where `CategoriesPage` is constructed (in `_openCategories`):
  ```dart
        builder: (categoriesContext) => CategoriesPage(
          viewModel: const HomeViewModel(),
          onJourneyPressed: () => _openJourney(categoriesContext),
          onCategorySelected: (category) =>
              _handleCategorySelected(categoriesContext, category),
          onNavigationSelected: (index) =>
              _handleCategoriesNavigation(categoriesContext, index),
        ),
  ```
  Add one more parameter:
  ```dart
        builder: (categoriesContext) => CategoriesPage(
          viewModel: const HomeViewModel(),
          onJourneyPressed: () => _openJourney(categoriesContext),
          onCategorySelected: (category) =>
              _handleCategorySelected(categoriesContext, category),
          onNavigationSelected: (index) =>
              _handleCategoriesNavigation(categoriesContext, index),
          onDifficultySelected: (difficulty) =>
              _handleDifficultySelected(categoriesContext, difficulty),
        ),
  ```

- [ ] **Step 4: Run the full Flutter test suite**

  Run: `flutter test`
  Expected: all tests pass — this task adds no new automated test because it's pure orchestration glue between already-tested pieces (`prepareCustom`, `CategoriesPage`'s callback, and `_startQuiz`'s pre-existing `requireOnline`/`onUnavailable` behavior, which `test/app/post_sign_up_flow` style coverage doesn't currently exist for even the equivalent `_startLeaderboardQuiz` path). Verify by hand instead, per Step 5.

- [ ] **Step 5: Manually verify on the emulator**

  With the backend running and the app installed on the Android emulator (via `adb`, the same way this project has been verified all along): open the app, go to the Quizzes tab, switch to Practice, tap a difficulty card, confirm the cost dialog, confirm credits are spent, play through a question, and confirm the result screen shows a score. Then check the backend: the corresponding `quiz_attempts` row should have `quiz_id = NULL` and `status = 'submitted'`, and `user_progress.total_points` should have increased.

- [ ] **Step 6: Commit**

  ```bash
  git add lib/app/post_sign_up_flow.dart
  git commit -m "$(cat <<'EOF'
  Wire Practice difficulty selection into the quiz-launch flow

  Reuses the existing cost-confirmation dialog and the no-offline-fallback
  refund pattern already used by pool quizzes from the Leaderboard journey.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review notes

- **Spec coverage:** every section of the spec (data model, admin API, app-facing API, admin panel, mobile app, error handling, testing) maps to a task above. The one deviation from the spec's literal wording — "network failures... follow the exact same offline-fallback path `QuizCatalog.prepare` already uses" — turned out to be structurally impossible (there's no bundled content for a random cross-category draw to fall back to); Task 10/12 instead reuse this codebase's *other* existing precedent for exactly that situation (`_startLeaderboardQuiz`'s `requireOnline` + refund pattern), which achieves the same "graceful, already-established failure handling" intent the spec was after.
- **Two bugs found beyond the spec, both fixed in-plan:** `serializeQuizAttempt`'s `Number(row.quiz_id)` would have silently turned a practice attempt's `null` into `0` (Task 2); Dart's `RemoteAttempt.fromJson` would have crashed on that same `null` via `as num` (Task 9).
- **Credit cost:** the spec was written before the credit-cost system (`LeaderboardProgressStore`) was discovered in the Flutter code; Task 12 implements the "same cost as category quizzes" decision made after the spec, rather than the spec's silence on it.
- **Type consistency:** `PracticeSetting` (difficulty, questionCount) is the same shape in both the backend serializer (Task 2), the admin TypeScript type (Task 7), and the Dart class (Task 9). `RemoteAttempt.quizId` is `int?` everywhere it's touched (Task 9), and every existing call site (`fetchLatestAttemptFor`'s `attempt.quizId == quizId` comparison) remains valid under that type.
