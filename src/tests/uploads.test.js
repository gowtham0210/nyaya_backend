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

function imageForm() {
  const form = new FormData();
  form.set('image', new Blob([PNG_1PX], { type: 'image/png' }), 'test.png');
  return form;
}

function uploadFile(baseUrl, path_, token, form) {
  return fetch(baseUrl + path_, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));
}

before(async () => {
  server = await startTestServer();
  adminToken = await loginAsAdmin(server.baseUrl);
});

after(async () => {
  await server.close();
  await pool.end();
});

test('category image upload saves a file, serves it back, and replacing it cleans up the old one', async () => {
  const created = await call(server.baseUrl, 'POST', '/admin/categories', adminToken, {
    name: `Upload Test ${Date.now()}`,
    slug: `upload-test-${Date.now()}`,
  });
  assert.equal(created.status, 201);
  const categoryId = created.body.id;

  try {
    const first = await uploadFile(
      server.baseUrl,
      `/admin/categories/${categoryId}/image`,
      adminToken,
      imageForm()
    );
    assert.equal(first.status, 200);
    assert.match(first.body.imageUrl, /^\/uploads\/categories\/[0-9a-f-]+\.png$/);

    const firstFilePath = path.join(uploadRoot, first.body.imageUrl.replace('/uploads/', ''));
    assert.ok(fs.existsSync(firstFilePath));

    const served = await fetch(server.baseUrl.replace('/api/v1', '') + first.body.imageUrl);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');

    const second = await uploadFile(
      server.baseUrl,
      `/admin/categories/${categoryId}/image`,
      adminToken,
      imageForm()
    );
    assert.equal(second.status, 200);
    assert.notEqual(second.body.imageUrl, first.body.imageUrl);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!fs.existsSync(firstFilePath), 'old file deleted on replacement');
  } finally {
    const [[row]] = await pool.query('SELECT image_url FROM categories WHERE id = ?', [categoryId]);
    if (row?.image_url) {
      fs.unlink(path.join(uploadRoot, row.image_url.replace('/uploads/', '')), () => {});
    }
    await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
  }
});

test('non-image uploads are rejected, and only an admin may set a category image', async () => {
  const created = await call(server.baseUrl, 'POST', '/admin/categories', adminToken, {
    name: `Upload Reject Test ${Date.now()}`,
    slug: `upload-reject-test-${Date.now()}`,
  });
  const categoryId = created.body.id;
  const user = await registerTestUser(server.baseUrl);

  try {
    const textForm = new FormData();
    textForm.set('image', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'test.txt');
    const rejected = await uploadFile(
      server.baseUrl,
      `/admin/categories/${categoryId}/image`,
      adminToken,
      textForm
    );
    assert.equal(rejected.status, 400);

    const forbidden = await uploadFile(
      server.baseUrl,
      `/admin/categories/${categoryId}/image`,
      user.accessToken,
      imageForm()
    );
    assert.equal(forbidden.status, 403);
  } finally {
    await deleteTestUser(user.user.id);
    await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
  }
});

test('a player can upload their own avatar', async () => {
  const user = await registerTestUser(server.baseUrl);

  try {
    assert.equal((await call(server.baseUrl, 'GET', '/users/me', user.accessToken)).body.avatarUrl, null);

    const uploaded = await uploadFile(server.baseUrl, '/users/me/avatar', user.accessToken, imageForm());
    assert.equal(uploaded.status, 200);
    assert.match(uploaded.body.avatarUrl, /^\/uploads\/avatars\/[0-9a-f-]+\.png$/);

    const [[row]] = await pool.query('SELECT avatar_url FROM users WHERE id = ?', [user.user.id]);
    if (row?.avatar_url) {
      fs.unlink(path.join(uploadRoot, row.avatar_url.replace('/uploads/', '')), () => {});
    }
  } finally {
    await deleteTestUser(user.user.id);
  }
});
