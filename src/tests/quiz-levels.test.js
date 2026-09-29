const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  pool,
  startTestServer,
  call,
  registerTestUser,
  loginAsAdmin,
  deleteTestUser,
  createTestQuiz,
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

test('a quiz with no level is open to a brand-new player', async () => {
  const quiz = await createTestQuiz(server.baseUrl, adminToken);
  const user = await registerTestUser(server.baseUrl);

  try {
    const detail = await call(server.baseUrl, 'GET', `/quizzes/${quiz.quizId}`, user.accessToken);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.isLocked, false);

    const started = await call(server.baseUrl, 'POST', '/quiz-attempts', user.accessToken, {
      quizId: quiz.quizId,
    });
    assert.equal(started.status, 201);
  } finally {
    await deleteTestUser(user.user.id);
    await quiz.cleanup();
  }
});

test('a leveled quiz is locked below the threshold and unlocks above it', async () => {
  const [[level]] = await pool.query(
    'SELECT id, min_points FROM levels WHERE min_points > 0 ORDER BY min_points ASC LIMIT 1'
  );
  assert.ok(level, 'expected at least one level with min_points > 0 to exist for this test');

  const quiz = await createTestQuiz(server.baseUrl, adminToken, { levelId: level.id });
  const user = await registerTestUser(server.baseUrl);

  try {
    // below the threshold: hidden from listings, blocked everywhere else
    const listBefore = await call(server.baseUrl, 'GET', '/quizzes?size=200', user.accessToken);
    const inListBefore = listBefore.body.items.find((item) => item.id === quiz.quizId);
    assert.equal(inListBefore.isLocked, true);

    assert.equal(
      (await call(server.baseUrl, 'GET', `/quizzes/${quiz.quizId}/questions`, user.accessToken)).status,
      403
    );
    assert.equal(
      (
        await call(server.baseUrl, 'POST', '/quiz-attempts', user.accessToken, {
          quizId: quiz.quizId,
        })
      ).status,
      403
    );

    const categoryListBefore = await call(
      server.baseUrl,
      'GET',
      `/categories/${quiz.categoryId}/quizzes`,
      user.accessToken
    );
    assert.ok(
      categoryListBefore.body.items.find((item) => item.id === quiz.quizId).isLocked,
      'also locked in the per-category listing'
    );

    // above the threshold: unlocked everywhere
    await pool.query('UPDATE user_progress SET total_points = ? WHERE user_id = ?', [
      level.min_points,
      user.user.id,
    ]);

    const listAfter = await call(server.baseUrl, 'GET', '/quizzes?size=200', user.accessToken);
    assert.equal(listAfter.body.items.find((item) => item.id === quiz.quizId).isLocked, false);
    assert.equal(
      (await call(server.baseUrl, 'GET', `/quizzes/${quiz.quizId}/questions`, user.accessToken)).status,
      200
    );
  } finally {
    await deleteTestUser(user.user.id);
    await quiz.cleanup();
  }
});

test('daily quiz only ever returns something the player has unlocked, and is stable within a day', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    const first = await call(server.baseUrl, 'GET', '/quizzes/daily', user.accessToken);
    assert.equal(first.status, 200);
    assert.match(first.body.date, /^\d{4}-\d{2}-\d{2}$/);

    const second = await call(server.baseUrl, 'GET', '/quizzes/daily', user.accessToken);
    assert.deepEqual(second.body, first.body, 'same quiz returned on a second call the same day');

    if (first.body.quiz) {
      assert.equal(first.body.quiz.isLocked, false);
    }
  } finally {
    await deleteTestUser(user.user.id);
  }
});

test('submitting a quiz awards points and lets a player climb a level', async () => {
  const [[level]] = await pool.query(
    'SELECT id, min_points FROM levels WHERE min_points > 0 ORDER BY min_points ASC LIMIT 1'
  );
  const quiz = await createTestQuiz(server.baseUrl, adminToken);
  const user = await registerTestUser(server.baseUrl);

  try {
    const started = await call(server.baseUrl, 'POST', '/quiz-attempts', user.accessToken, {
      quizId: quiz.quizId,
    });
    const attemptId = started.body.id;

    const answered = await call(
      server.baseUrl,
      'POST',
      `/quiz-attempts/${attemptId}/answers`,
      user.accessToken,
      { questionId: quiz.questionId, selectedOptionId: quiz.correctOptionId }
    );
    assert.equal(answered.status, 201);

    const submitted = await call(
      server.baseUrl,
      'POST',
      `/quiz-attempts/${attemptId}/submit`,
      user.accessToken
    );
    assert.equal(submitted.status, 200);

    const progress = await call(server.baseUrl, 'GET', '/users/me/progress', user.accessToken);
    assert.ok(progress.body.totalPoints > 0, 'points were awarded for the correct answer');
  } finally {
    await deleteTestUser(user.user.id);
    await quiz.cleanup();
  }
});
