// Adds practice mode: a quiz attempt that draws questions from many
// quizzes by difficulty instead of belonging to one quiz. Guarded so
// it's a safe no-op on a database that already has these changes
// (including one built fresh from the current schema.sql, which
// already declares the nullable column and both new tables).
async function up(connection) {
  const [columns] = await connection.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quiz_attempts' AND COLUMN_NAME = 'quiz_id'`
  );

  if (columns[0] && columns[0].IS_NULLABLE === 'NO') {
    await connection.query(`
      ALTER TABLE quiz_attempts
        MODIFY COLUMN quiz_id BIGINT UNSIGNED DEFAULT NULL
    `);
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempt_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      quiz_attempt_id BIGINT UNSIGNED NOT NULL,
      question_id BIGINT UNSIGNED NOT NULL,
      display_order INT NOT NULL DEFAULT 1,
      PRIMARY KEY (id),
      UNIQUE KEY uq_quiz_attempt_questions_attempt_question (quiz_attempt_id, question_id),
      KEY idx_quiz_attempt_questions_question_id (question_id),
      CONSTRAINT fk_quiz_attempt_questions_attempt
        FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
      CONSTRAINT fk_quiz_attempt_questions_question
        FOREIGN KEY (question_id) REFERENCES questions (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS practice_settings (
      difficulty_level VARCHAR(30) NOT NULL,
      question_count INT NOT NULL DEFAULT 10,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (difficulty_level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    INSERT IGNORE INTO practice_settings (difficulty_level, question_count, is_enabled)
    VALUES ('easy', 10, 1), ('medium', 10, 1), ('hard', 10, 1)
  `);
}

module.exports = { up };
