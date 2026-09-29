// Adds the columns behind POST /auth/forgot-password and /auth/reset-password.
async function up(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME LIKE 'password_reset%'`
  );

  if (columns.length === 3) {
    return;
  }

  await connection.query(`
    ALTER TABLE users
      ADD COLUMN password_reset_hash CHAR(64) DEFAULT NULL AFTER password_hash,
      ADD COLUMN password_reset_expires_at DATETIME DEFAULT NULL AFTER password_reset_hash,
      ADD COLUMN password_reset_attempts INT NOT NULL DEFAULT 0 AFTER password_reset_expires_at
  `);
}

module.exports = { up };
