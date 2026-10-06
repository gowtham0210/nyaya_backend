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

test('an admin can create, list, update and delete a daily question', async () => {
  const marker = `dq-test-${Date.now()}`;
  const created = await call(server.baseUrl, 'POST', '/admin/daily-questions', adminToken, {
    category: '  Test Category  ',
    question: `${marker} question?`,
    answer: 'An answer.',
  });
  assert.equal(created.status, 201);
  const { id } = created.body;

  try {
    assert.deepEqual(created.body, {
      id,
      category: 'Test Category',
      question: `${marker} question?`,
      answer: 'An answer.',
    });

    const listed = await call(server.baseUrl, 'GET', '/admin/daily-questions', adminToken);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.items.some((item) => item.id === id));

    const updated = await call(server.baseUrl, 'PATCH', `/admin/daily-questions/${id}`, adminToken, {
      answer: 'A better answer.',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.answer, 'A better answer.');
    assert.equal(updated.body.question, `${marker} question?`, 'fields not sent are left alone');

    await pool.query(
      "INSERT INTO translations (entity_type, entity_id, field_name, lang_code, translated_text) VALUES ('daily_question', ?, 'answer', 'hi', 'x')",
      [id]
    );

    const deleted = await call(server.baseUrl, 'DELETE', `/admin/daily-questions/${id}`, adminToken);
    assert.equal(deleted.status, 204);

    const [[row]] = await pool.query('SELECT id FROM daily_questions WHERE id = ?', [id]);
    assert.equal(row, undefined);
    const [translations] = await pool.query(
      "SELECT id FROM translations WHERE entity_type = 'daily_question' AND entity_id = ?",
      [id]
    );
    assert.equal(translations.length, 0, 'translations are removed with the question');

    const again = await call(server.baseUrl, 'DELETE', `/admin/daily-questions/${id}`, adminToken);
    assert.equal(again.status, 404);
  } finally {
    await pool.query("DELETE FROM translations WHERE entity_type = 'daily_question' AND entity_id = ?", [id]);
    await pool.query('DELETE FROM daily_questions WHERE id = ?', [id]);
    await pool.query('DELETE FROM admin_audit_log WHERE request_body LIKE ?', [`%${marker}%`]);
  }
});

test('blank or missing fields are rejected', async () => {
  const missing = await call(server.baseUrl, 'POST', '/admin/daily-questions', adminToken, {
    category: 'Test',
    question: 'Question?',
  });
  assert.equal(missing.status, 400);

  const blank = await call(server.baseUrl, 'POST', '/admin/daily-questions', adminToken, {
    category: 'Test',
    question: '   ',
    answer: 'Answer.',
  });
  assert.equal(blank.status, 400);

  const emptyPatch = await call(server.baseUrl, 'PATCH', '/admin/daily-questions/1', adminToken, {});
  assert.equal(emptyPatch.status, 400);
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
