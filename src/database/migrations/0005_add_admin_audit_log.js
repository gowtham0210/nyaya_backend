async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      admin_user_id BIGINT UNSIGNED NOT NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(500) NOT NULL,
      status_code SMALLINT UNSIGNED NOT NULL,
      request_body TEXT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_admin_audit_log_admin_user_id (admin_user_id),
      KEY idx_admin_audit_log_created_at (created_at),
      CONSTRAINT fk_admin_audit_log_user
        FOREIGN KEY (admin_user_id) REFERENCES users (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
