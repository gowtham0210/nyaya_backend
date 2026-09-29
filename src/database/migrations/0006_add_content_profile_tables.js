// Brings existing databases up to date with the schema added on the
// nisha-backend branch (home/article pages, profile, translations, support).
// Help-resource tables are still created by src/scripts/seed-help-resources.js.
async function up(connection) {
  const [professionColumns] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profession'`
  );

  if (!professionColumns.length) {
    await connection.query('ALTER TABLE users ADD COLUMN profession VARCHAR(120) DEFAULT NULL AFTER phone');
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      part VARCHAR(10) NOT NULL,
      part_title VARCHAR(200) NOT NULL,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(280) NOT NULL,
      article_range VARCHAR(60) NOT NULL,
      description TEXT NOT NULL,
      what_it_means TEXT DEFAULT NULL,
      why_it_matters TEXT DEFAULT NULL,
      key_features TEXT DEFAULT NULL,
      display_order INT NOT NULL DEFAULT 1,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_articles_slug (slug),
      KEY idx_articles_active (is_active),
      KEY idx_articles_order (display_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS daily_questions (
      id INT NOT NULL AUTO_INCREMENT,
      category VARCHAR(100) NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS translations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      entity_type VARCHAR(32) NOT NULL,
      entity_id BIGINT UNSIGNED NOT NULL,
      field_name VARCHAR(64) NOT NULL,
      lang_code VARCHAR(5) NOT NULL,
      translated_text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_translations_entity_field_lang (entity_type, entity_id, field_name, lang_code),
      KEY idx_translations_lookup (entity_type, lang_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS support_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      subject VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_support_requests_user_id (user_id),
      CONSTRAINT fk_support_requests_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
