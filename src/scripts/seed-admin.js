const { pool, withTransaction } = require('../config/database');
const { hashPassword } = require('../utils/auth');
const { ensureUserSummaryRows } = require('../services/gamification');
const { serializeUser } = require('../utils/serializers');

const adminEmail = String(process.env.ADMIN_SEED_EMAIL || 'admin@nyaya.local')
  .trim()
  .toLowerCase();
const adminPassword = String(process.env.ADMIN_SEED_PASSWORD || 'NyayaAdmin@2026').trim();
const adminFullName = String(process.env.ADMIN_SEED_FULL_NAME || 'Nyaya Admin').trim();

if (!adminEmail) {
  throw new Error('ADMIN_SEED_EMAIL must not be empty');
}

if (adminPassword.length < 8) {
  throw new Error('ADMIN_SEED_PASSWORD must be at least 8 characters long');
}

async function run() {
  try {
    const seededUser = await withTransaction(async (connection) => {
      const passwordHash = await hashPassword(adminPassword);
      const [existingRows] = await connection.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [
        adminEmail,
      ]);

      let userId;

      if (existingRows[0]) {
        userId = Number(existingRows[0].id);
        await connection.execute(
          `
            UPDATE users
            SET
              full_name = ?,
              password_hash = ?,
              status = 'active'
            WHERE id = ?
          `,
          [adminFullName, passwordHash, userId]
        );
      } else {
        const [insertResult] = await connection.execute(
          `
            INSERT INTO users (
              full_name,
              email,
              phone,
              password_hash,
              status
            )
            VALUES (?, ?, NULL, ?, 'active')
          `,
          [adminFullName, adminEmail, passwordHash]
        );

        userId = Number(insertResult.insertId);
      }

      await ensureUserSummaryRows(connection, userId);

      const [userRows] = await connection.execute(
        'SELECT id, full_name, email, phone, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
        [userId]
      );

      return serializeUser(userRows[0]);
    });

    console.log(
      JSON.stringify(
        {
          message: 'Admin user seeded successfully',
          user: seededUser,
          credentials: {
            email: adminEmail,
            password: adminPassword,
          },
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Failed to seed admin user.');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
