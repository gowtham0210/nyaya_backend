// Required first, before anything that touches config/env, by every test file:
// each file runs in its own process under `node --test`, so setting this here
// (module-top-level, runs on require) reliably wins over .env's NODE_ENV=development
// before env.js's dotenv.config() ever runs - dotenv never overwrites a var that's
// already set. That's what makes the rate limiters skip (see middleware/rate-limit.js)
// and keeps tests from tripping the same limits a real client would hit.
process.env.NODE_ENV = 'test';

const { pool } = require('../config/database');

// Boots a real instance of the app on an OS-assigned free port, isolated from
// whatever the developer already has running on the usual port.
async function startTestServer() {
  const app = require('../app');
  const server = app.listen(0);

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}/api/v1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function call(baseUrl, method, path, token, body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();

  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// A fresh, disposable test account. Every test that needs a logged-in user
// creates and tears down its own - nothing here is shared state between tests.
async function registerTestUser(baseUrl, overrides = {}) {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const payload = {
    fullName: 'Test User',
    email: `test-${unique}@nyaya.test`,
    password: 'Password1!',
    ...overrides,
  };
  const response = await call(baseUrl, 'POST', '/auth/register', null, payload);

  if (response.status !== 201) {
    throw new Error(`registerTestUser failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return { ...response.body, password: payload.password };
}

async function loginAsAdmin(baseUrl) {
  const response = await call(baseUrl, 'POST', '/auth/login', null, {
    email: 'admin@nyaya.local',
    password: 'NyayaAdmin@2026',
  });

  if (response.status !== 200) {
    throw new Error(
      `loginAsAdmin failed (${response.status}): is the seeded admin account present with the expected password?`
    );
  }

  return response.body.accessToken;
}

async function deleteTestUser(userId) {
  if (userId) {
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
  }
}

// Builds a disposable category > quiz > question > two options via the real
// admin API (not direct SQL) so these tests exercise the same code paths an
// admin does, rather than assuming a particular shape of pre-existing seed
// data. Returns everything needed to play it and a matching cleanup function.
async function createTestQuiz(baseUrl, adminToken, { levelId = null } = {}) {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const category = (
    await call(baseUrl, 'POST', '/admin/categories', adminToken, {
      name: `Test Category ${unique}`,
      slug: `test-category-${unique}`,
    })
  ).body;

  const quiz = (
    await call(baseUrl, 'POST', '/admin/quizzes', adminToken, {
      categoryId: category.id,
      title: `Test Quiz ${unique}`,
      slug: `test-quiz-${unique}`,
      difficulty: 'medium',
      totalQuestions: 1,
      levelId,
    })
  ).body;

  const question = (
    await call(baseUrl, 'POST', '/admin/questions', adminToken, {
      quizId: quiz.id,
      questionText: 'What is 2 + 2?',
      questionType: 'single_choice',
      pointsReward: 10,
      displayOrder: 1,
    })
  ).body;

  const correctOption = (
    await call(baseUrl, 'POST', `/admin/questions/${question.id}/options`, adminToken, {
      optionText: '4',
      isCorrect: true,
      displayOrder: 1,
    })
  ).body;

  await call(baseUrl, 'POST', `/admin/questions/${question.id}/options`, adminToken, {
    optionText: '5',
    isCorrect: false,
    displayOrder: 2,
  });

  return {
    categoryId: category.id,
    quizId: quiz.id,
    questionId: question.id,
    correctOptionId: correctOption.id,
    async cleanup() {
      await pool.query('DELETE FROM quizzes WHERE id = ?', [quiz.id]);
      await pool.query('DELETE FROM categories WHERE id = ?', [category.id]);
    },
  };
}

module.exports = {
  pool,
  startTestServer,
  call,
  registerTestUser,
  loginAsAdmin,
  deleteTestUser,
  createTestQuiz,
};
