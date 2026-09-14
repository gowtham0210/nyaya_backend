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

test('admin can create, update, and deactivate an achievement; players still keep what they earned', async () => {
  const created = await call(server.baseUrl, 'POST', '/admin/achievements', adminToken, {
    code: `test-achievement-${Date.now()}`,
    title: 'Test Badge',
    description: 'Answer 1 question correctly.',
    achievementType: 'correct_answers',
    targetValue: 1,
    rewardPoints: 5,
  });
  assert.equal(created.status, 201);
  const achievementId = created.body.id;

  const quiz = await createTestQuiz(server.baseUrl, adminToken);
  const user = await registerTestUser(server.baseUrl);

  try {
    const patched = await call(
      server.baseUrl,
      'PATCH',
      `/admin/achievements/${achievementId}`,
      adminToken,
      { targetValue: 1, rewardPoints: 5 }
    );
    assert.equal(patched.status, 200);

    const progressBefore = (
      await call(server.baseUrl, 'GET', '/users/me/achievements/progress', user.accessToken)
    ).body.items.find((item) => item.id === achievementId);
    assert.equal(progressBefore.unlocked, false);

    // earn it: one correct answer, then submit
    const started = await call(server.baseUrl, 'POST', '/quiz-attempts', user.accessToken, {
      quizId: quiz.quizId,
    });
    await call(server.baseUrl, 'POST', `/quiz-attempts/${started.body.id}/answers`, user.accessToken, {
      questionId: quiz.questionId,
      selectedOptionId: quiz.correctOptionId,
    });
    await call(server.baseUrl, 'POST', `/quiz-attempts/${started.body.id}/submit`, user.accessToken);

    const progressAfter = (
      await call(server.baseUrl, 'GET', '/users/me/achievements/progress', user.accessToken)
    ).body.items.find((item) => item.id === achievementId);
    assert.equal(progressAfter.unlocked, true);
    assert.ok(progressAfter.unlockedAt);

    // deactivating hides it going forward, but the player keeps the unlock record
    const deactivated = await call(
      server.baseUrl,
      'DELETE',
      `/admin/achievements/${achievementId}`,
      adminToken
    );
    assert.equal(deactivated.status, 204);

    const afterDeactivate = await call(
      server.baseUrl,
      'GET',
      '/users/me/achievements/progress',
      user.accessToken
    );
    assert.ok(
      !afterDeactivate.body.items.some((item) => item.id === achievementId),
      'inactive achievements are excluded from the progress list'
    );

    const [[held]] = await pool.query(
      'SELECT 1 AS x FROM user_achievements WHERE user_id = ? AND achievement_id = ?',
      [user.user.id, achievementId]
    );
    assert.ok(held, 'the unlock itself is untouched by deactivation');
  } finally {
    await pool.query('DELETE FROM user_achievements WHERE achievement_id = ?', [achievementId]);
    await pool.query('DELETE FROM achievements WHERE id = ?', [achievementId]);
    await deleteTestUser(user.user.id);
    await quiz.cleanup();
  }
});
