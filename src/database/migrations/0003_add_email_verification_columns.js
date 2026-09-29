// Adds the columns behind email verification: POST /auth/verify-email and
// /auth/resend-verification. Existing users are left with email_verified = 0
// (its default) - they're prompted to verify next time they'd need to, same
// as anyone who registered before this feature existed.
async function up(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME LIKE 'email_verif%'`
  );

  if (columns.length === 4) {
    return;
  }

  await connection.query(`
    ALTER TABLE users
      ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER password_reset_attempts,
      ADD COLUMN email_verification_hash CHAR(64) DEFAULT NULL AFTER email_verified,
      ADD COLUMN email_verification_expires_at DATETIME DEFAULT NULL AFTER email_verification_hash,
      ADD COLUMN email_verification_attempts INT NOT NULL DEFAULT 0 AFTER email_verification_expires_at
  `);
}

module.exports = { up };
