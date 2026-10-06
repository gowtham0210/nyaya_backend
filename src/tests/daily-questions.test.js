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

function options() {
  return [
    { optionText: 'Ignore it', isCorrect: false },
    { optionText: 'Report it on 1930', isCorrect: true },
    { optionText: 'Reply to the sender', isCorrect: false },
  ];
}

async function createDailyQuestion(overrides = {}) {
  const response = await call(server.baseUrl, 'POST', '/admin/daily-questions', adminToken, {
    category: 'Cyber',
    question: `What should you do? ${Date.now()}-${Math.random()}`,
    answer: 'Report it quickly.',
    pointsReward: 15,
    options: options(),
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
}

async function deleteDailyQuestion(id) {
  await pool.query("DELETE FROM translations WHERE entity_type = 'daily_question' AND entity_id = ?", [id]);
  await pool.query('DELETE FROM daily_questions WHERE id = ?', [id]);
}

test('an admin can create, list, update and delete a daily question with options', async () => {
  const created = await createDailyQuestion({ category: '  Trimmed  ' });

  try {
    assert.equal(created.category, 'Trimmed');
    assert.equal(created.pointsReward, 15);
    assert.deepEqual(
      created.options.map(({ optionText, isCorrect, displayOrder }) => [optionText, isCorrect, displayOrder]),
      [
        ['Ignore it', false, 1],
        ['Report it on 1930', true, 2],
        ['Reply to the sender', false, 3],
      ]
    );

    const listed = await call(server.baseUrl, 'GET', '/admin/daily-questions', adminToken);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.items.some((item) => item.id === created.id));

    // Keep the correct option (by id), reword it, drop one, add a new one.
    const [wrong, correct] = created.options;
    const updated = await call(server.baseUrl, 'PATCH', `/admin/daily-questions/${created.id}`, adminToken, {
      answer: 'A better explanation.',
      options: [
        { id: correct.id, optionText: 'Call 1930 and your bank', isCorrect: true },
        { id: wrong.id, optionText: 'Ignore it', isCorrect: false },
        { optionText: 'Post about it online', isCorrect: false },
      ],
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.answer, 'A better explanation.');
    assert.equal(updated.body.options.length, 3);
    assert.equal(updated.body.options[0].id, correct.id, 'existing options keep their id');
    assert.equal(updated.body.options[0].optionText, 'Call 1930 and your bank');
    assert.ok(!updated.body.options.some((option) => option.optionText === 'Reply to the sender'));

    const deleted = await call(server.baseUrl, 'DELETE', `/admin/daily-questions/${created.id}`, adminToken);
    assert.equal(deleted.status, 204);
    const [optionRows] = await pool.query('SELECT id FROM daily_question_options WHERE daily_question_id = ?', [
      created.id,
    ]);
    assert.equal(optionRows.length, 0, 'options go with the question');

    const again = await call(server.baseUrl, 'DELETE', `/admin/daily-questions/${created.id}`, adminToken);
    assert.equal(again.status, 404);
  } finally {
    await deleteDailyQuestion(created.id);
  }
});

test('invalid questions and option sets are rejected', async () => {
  const base = { category: 'Test', question: 'Question?', answer: 'Answer.' };
  const cases = [
    { ...base, options: options(), question: '   ' },
    { ...base },
    { ...base, options: [{ optionText: 'Only one', isCorrect: true }] },
    { ...base, options: options().map((option) => ({ ...option, isCorrect: false })) },
    { ...base, options: options().map((option) => ({ ...option, isCorrect: true })) },
    { ...base, options: [...options(), { optionText: '  ', isCorrect: false }] },
    { ...base, options: options(), pointsReward: -5 },
  ];

  for (const payload of cases) {
    const response = await call(server.baseUrl, 'POST', '/admin/daily-questions', adminToken, payload);
    assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(payload)}`);
  }

  const emptyPatch = await call(server.baseUrl, 'PATCH', '/admin/daily-questions/1', adminToken, {});
  assert.equal(emptyPatch.status, 400);
});

test("a player answers today's question once: graded, points awarded, streak counted", async () => {
  const created = await createDailyQuestion();
  const user = await registerTestUser(server.baseUrl);

  try {
    const today = await call(server.baseUrl, 'GET', '/daily-questions/today', user.accessToken);
    assert.equal(today.status, 200);
    assert.match(today.body.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(today.body.answered, false);
    assert.equal(today.body.result, null);
    assert.ok(today.body.question, 'a question is scheduled once one is eligible');
    assert.ok(
      today.body.question.options.every((option) => !('isCorrect' in option)),
      'the correct answer is not revealed before answering'
    );

    const again = await call(server.baseUrl, 'GET', '/daily-questions/today', user.accessToken);
    assert.equal(again.body.question.id, today.body.question.id, 'stable within the day');

    // Today's pick may be another eligible question; grade against whichever it is.
    const listed = await call(server.baseUrl, 'GET', '/admin/daily-questions', adminToken);
    const scheduled = listed.body.items.find((item) => item.id === today.body.question.id);
    const correctOption = scheduled.options.find((option) => option.isCorrect);

    const answered = await call(server.baseUrl, 'POST', '/daily-questions/today/answer', user.accessToken, {
      selectedOptionId: correctOption.id,
    });
    assert.equal(answered.status, 201, JSON.stringify(answered.body));
    assert.equal(answered.body.result.isCorrect, true);
    assert.equal(answered.body.result.correctOptionId, correctOption.id);
    assert.equal(answered.body.result.pointsEarned, scheduled.pointsReward);
    assert.equal(answered.body.result.explanation, scheduled.answer);
    assert.equal(answered.body.currentStreak, 1);

    const [[progress]] = await pool.query(
      'SELECT total_points, total_questions_answered, total_correct_answers FROM user_progress WHERE user_id = ?',
      [user.user.id]
    );
    assert.ok(Number(progress.total_points) >= scheduled.pointsReward);
    assert.equal(Number(progress.total_questions_answered), 1);
    assert.equal(Number(progress.total_correct_answers), 1);

    const second = await call(server.baseUrl, 'POST', '/daily-questions/today/answer', user.accessToken, {
      selectedOptionId: correctOption.id,
    });
    assert.equal(second.status, 409, 'only one answer per day');

    const after = await call(server.baseUrl, 'GET', '/daily-questions/today', user.accessToken);
    assert.equal(after.body.answered, true);
    assert.equal(after.body.result.selectedOptionId, correctOption.id);
  } finally {
    await deleteTestUser(user.user.id);
    await deleteDailyQuestion(created.id);
  }
});

test("a wrong answer earns no points but still counts toward the streak", async () => {
  const created = await createDailyQuestion();
  const user = await registerTestUser(server.baseUrl);

  try {
    const today = await call(server.baseUrl, 'GET', '/daily-questions/today', user.accessToken);
    const listed = await call(server.baseUrl, 'GET', '/admin/daily-questions', adminToken);
    const scheduled = listed.body.items.find((item) => item.id === today.body.question.id);
    const wrongOption = scheduled.options.find((option) => !option.isCorrect);

    const answered = await call(server.baseUrl, 'POST', '/daily-questions/today/answer', user.accessToken, {
      selectedOptionId: wrongOption.id,
    });
    assert.equal(answered.status, 201);
    assert.equal(answered.body.result.isCorrect, false);
    assert.equal(answered.body.result.pointsEarned, 0);
    assert.equal(answered.body.currentStreak, 1);

    const notToday = await call(server.baseUrl, 'POST', '/daily-questions/today/answer', user.accessToken, {
      selectedOptionId: 999999999,
    });
    assert.equal(notToday.status, 400, "an option from another question is rejected before the 409");
  } finally {
    await deleteTestUser(user.user.id);
    await deleteDailyQuestion(created.id);
  }
});

test('non-admins cannot manage daily questions', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    const response = await call(server.baseUrl, 'GET', '/admin/daily-questions', user.accessToken);
    assert.equal(response.status, 403);
  } finally {
    await deleteTestUser(user.user?.id);
  }
});
