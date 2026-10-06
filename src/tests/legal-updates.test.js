const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
const uploadRoot = path.join(__dirname, '../../uploads');

// A tiny valid 1x1 PNG.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function uploadImage(legalUpdateId) {
  const form = new FormData();
  form.set('image', new Blob([PNG_1PX], { type: 'image/png' }), 'test.png');
  return fetch(`${server.baseUrl}/admin/legal-updates/${legalUpdateId}/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));
}

function uploadedPath(imageUrl) {
  return path.join(uploadRoot, imageUrl.replace('/uploads/', ''));
}

before(async () => {
  server = await startTestServer();
  adminToken = await loginAsAdmin(server.baseUrl);
});

after(async () => {
  await server.close();
  await pool.end();
});

test('an admin can create, list, update and delete a legal update, and the app sees it', async () => {
  const marker = `Legal update test ${Date.now()}`;
  const created = await call(server.baseUrl, 'POST', '/admin/legal-updates', adminToken, {
    category: 'Judgements',
    title: `  ${marker}  `,
    summary: 'A short summary.',
    updateDate: '2026-10-01',
    source: '   ',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { id } = created.body;

  try {
    assert.equal(created.body.title, marker, 'title is trimmed');
    assert.equal(created.body.updateDate, '2026-10-01');
    assert.equal(created.body.source, null, 'blank optional text is stored as null');

    const adminList = await call(server.baseUrl, 'GET', '/admin/legal-updates?category=Judgements', adminToken);
    assert.equal(adminList.status, 200);
    assert.ok(adminList.body.items.some((item) => item.id === id));

    const otherCategory = await call(server.baseUrl, 'GET', '/admin/legal-updates?category=Notices', adminToken);
    assert.ok(!otherCategory.body.items.some((item) => item.id === id), 'category filter applies');

    const updated = await call(server.baseUrl, 'PATCH', `/admin/legal-updates/${id}`, adminToken, {
      category: 'Legislation',
      source: 'Supreme Court of India',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.category, 'Legislation');
    assert.equal(updated.body.source, 'Supreme Court of India');
    assert.equal(updated.body.summary, 'A short summary.', 'fields not sent are left alone');

    // The existing app-facing endpoint returns admin-created updates.
    const user = await registerTestUser(server.baseUrl);
    try {
      const appList = await call(server.baseUrl, 'GET', '/legal-updates?category=Legislation', user.accessToken);
      assert.equal(appList.status, 200);
      assert.ok(appList.body.items.some((item) => item.id === id && item.title === marker));
    } finally {
      await deleteTestUser(user.user.id);
    }

    const deleted = await call(server.baseUrl, 'DELETE', `/admin/legal-updates/${id}`, adminToken);
    assert.equal(deleted.status, 204);
    const again = await call(server.baseUrl, 'DELETE', `/admin/legal-updates/${id}`, adminToken);
    assert.equal(again.status, 404);
  } finally {
    await pool.query('DELETE FROM legal_updates WHERE id = ?', [id]);
  }
});

test('an uploaded image is saved, replaced cleanly, and removed with the update', async () => {
  const created = await call(server.baseUrl, 'POST', '/admin/legal-updates', adminToken, {
    category: 'Notices',
    title: `Image test ${Date.now()}`,
    updateDate: '2026-10-02',
  });
  assert.equal(created.status, 201);
  const { id } = created.body;

  try {
    const first = await uploadImage(id);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.match(first.body.imageUrl, /^\/uploads\/legal-updates\/[0-9a-f-]+\.png$/);
    assert.ok(fs.existsSync(uploadedPath(first.body.imageUrl)));

    const second = await uploadImage(id);
    assert.equal(second.status, 200);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!fs.existsSync(uploadedPath(first.body.imageUrl)), 'replaced file is deleted');

    const deleted = await call(server.baseUrl, 'DELETE', `/admin/legal-updates/${id}`, adminToken);
    assert.equal(deleted.status, 204);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!fs.existsSync(uploadedPath(second.body.imageUrl)), 'image is deleted with the update');

    const missing = await uploadImage(id);
    assert.equal(missing.status, 404);
  } finally {
    const [[row]] = await pool.query('SELECT image_url FROM legal_updates WHERE id = ?', [id]);
    if (row?.image_url) {
      fs.unlink(uploadedPath(row.image_url), () => {});
    }
    await pool.query('DELETE FROM legal_updates WHERE id = ?', [id]);
  }
});

test('invalid legal updates are rejected', async () => {
  const base = { category: 'Reforms', title: 'Title', updateDate: '2026-10-03' };
  const cases = [
    { ...base, category: 'Gossip' },
    { ...base, title: '   ' },
    { ...base, title: 'x'.repeat(256) },
    { ...base, updateDate: '03-10-2026' },
    { ...base, updateDate: '2026-02-30' },
    { ...base, imageUrl: 'javascript:alert(1)' },
    { ...base, summary: 42 },
    { category: 'Reforms', title: 'Missing date' },
  ];

  for (const payload of cases) {
    const response = await call(server.baseUrl, 'POST', '/admin/legal-updates', adminToken, payload);
    assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(payload)}`);
  }

  const emptyPatch = await call(server.baseUrl, 'PATCH', '/admin/legal-updates/1', adminToken, {});
  assert.equal(emptyPatch.status, 400);
});

test('non-admins cannot manage legal updates', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    const list = await call(server.baseUrl, 'GET', '/admin/legal-updates', user.accessToken);
    assert.equal(list.status, 403);
    const create = await call(server.baseUrl, 'POST', '/admin/legal-updates', user.accessToken, {
      category: 'Notices',
      title: 'Nope',
      updateDate: '2026-10-04',
    });
    assert.equal(create.status, 403);
  } finally {
    await deleteTestUser(user.user.id);
  }
});
