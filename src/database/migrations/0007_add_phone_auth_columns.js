// Phone sign-up (POST /auth/signup): users can register with a phone number
// verified through Firebase instead of an email, so email becomes optional.
// Replaces the one-off src/scripts/migrate-auth-firebase.js.
async function columnInfo(connection, column) {
  const [rows] = await connection.query(
    `SELECT IS_NULLABLE AS isNullable FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
    [column]
  );

  return rows[0] || null;
}

async function up(connection) {
  if (!(await columnInfo(connection, 'firebase_uid'))) {
    await connection.query('ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128) DEFAULT NULL AFTER password_hash');
    await connection.query('ALTER TABLE users ADD UNIQUE KEY uq_users_firebase_uid (firebase_uid)');
  }

  if (!(await columnInfo(connection, 'phone_verified'))) {
    await connection.query(
      'ALTER TABLE users ADD COLUMN phone_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER firebase_uid'
    );
  }

  const email = await columnInfo(connection, 'email');

  if (email && email.isNullable === 'NO') {
    await connection.query('ALTER TABLE users MODIFY email VARCHAR(191) DEFAULT NULL');
  }
}

module.exports = { up };
