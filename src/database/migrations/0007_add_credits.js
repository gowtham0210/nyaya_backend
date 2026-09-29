// Adds the Learning Journey's credit economy as server-owned state: a
// balance + regen timestamp on user_progress, a transaction ledger that
// makes each spend refundable at most once, and a chest-claims table that
// makes each chest claimable at most once. Guarded so it's a safe no-op on
// a database already built from the current schema.sql.
async function up(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_progress' AND COLUMN_NAME = 'credits'`
  );

  if (columns.length === 0) {
    await connection.query(`
      ALTER TABLE user_progress
        ADD COLUMN credits INT NOT NULL DEFAULT 100,
        ADD COLUMN credits_updated_at DATETIME DEFAULT NULL
    `);
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      reason VARCHAR(40) NOT NULL,
      amount INT NOT NULL,
      refunded TINYINT(1) NOT NULL DEFAULT 0,
      refund_of_transaction_id BIGINT UNSIGNED DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_credit_transactions_user_id (user_id),
      KEY idx_credit_transactions_user_reason_created (user_id, reason, created_at),
      UNIQUE KEY uq_credit_transactions_refund_of (refund_of_transaction_id),
      CONSTRAINT fk_credit_transactions_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
      CONSTRAINT fk_credit_transactions_refund_of
        FOREIGN KEY (refund_of_transaction_id) REFERENCES credit_transactions (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS credit_chest_claims (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      chest_type VARCHAR(10) NOT NULL,
      chest_index INT UNSIGNED NOT NULL,
      reward INT NOT NULL,
      claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_credit_chest_claims_user_chest (user_id, chest_type, chest_index),
      CONSTRAINT fk_credit_chest_claims_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
