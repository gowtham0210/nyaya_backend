const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, startTestServer, call, loginAsAdmin } = require('./helpers');

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

test('a successful admin mutation is audited with the right details', async () => {
  const uniqueCode = `audit-test-${Date.now()}`;
  const created = await call(server.baseUrl, 'POST', '/admin/levels', adminToken, {
    code: uniqueCode,
    name: 'Audit Test Level',
    minPoints: 0,
    maxPoints: 10,
  });
  assert.equal(created.status, 201);
  const levelId = created.body.id;

  try {
    await new Promise((r) => setTimeout(r, 200)); // the write is fire-and-forget

    // Read the row directly rather than through the paginated list: other test
    // files running concurrently are also performing audited admin mutations,
    // so this row isn't guaranteed to land on page 1 by the time we check -
    // the list endpoint's shape/filtering is covered by the tests below instead.
    const [[row]] = await pool.query(
      `SELECT l.*, u.email AS admin_email FROM admin_audit_log l
       INNER JOIN users u ON u.id = l.admin_user_id
       WHERE l.request_body LIKE ? LIMIT 1`,
      [`%${uniqueCode}%`]
    );
    assert.ok(row, 'the mutation was recorded');
    assert.equal(row.method, 'POST');
    assert.equal(row.path, '/api/v1/admin/levels');
    assert.equal(row.status_code, 201);
    assert.equal(row.admin_email, 'admin@nyaya.local');
    assert.match(row.request_body, /"name":"Audit Test Level"/);
  } finally {
    await pool.query('DELETE FROM admin_audit_log WHERE request_body LIKE ?', [`%${uniqueCode}%`]);
    await pool.query('DELETE FROM levels WHERE id = ?', [levelId]);
  }
});

test('failed requests and GETs are never audited, regardless of what else is running', async () => {
  const failed = await call(server.baseUrl, 'POST', '/admin/levels', adminToken, { code: '' });
  assert.equal(failed.status, 400);

  // These are structural invariants of the middleware itself (it unconditionally
  // skips method === 'GET' and statusCode >= 400), so - unlike the count in the
  // test above - they hold no matter what other tests are concurrently doing.
  const [[getCount]] = await pool.query("SELECT COUNT(*) AS n FROM admin_audit_log WHERE method = 'GET'");
  const [[failedCount]] = await pool.query('SELECT COUNT(*) AS n FROM admin_audit_log WHERE status_code >= 400');
  assert.equal(getCount.n, 0);
  assert.equal(failedCount.n, 0);
});

test('audit log can be filtered by adminUserId', async () => {
  const me = await call(server.baseUrl, 'GET', '/users/me', adminToken);
  const filtered = await call(
    server.baseUrl,
    'GET',
    `/admin/audit-log?adminUserId=${me.body.id}&size=5`,
    adminToken
  );
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.items.every((item) => item.adminUserId === me.body.id));
});
