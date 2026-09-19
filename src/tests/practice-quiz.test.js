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

test("answering a question outside the practice attempt's assigned set is rejected", async () => {
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
