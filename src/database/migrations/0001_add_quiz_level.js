// Adds the column that lets an admin gate a quiz behind a player level.
// Guarded so it's a safe no-op on a database that already has it (including
// one built fresh from the current schema.sql, which already declares it).
async function up(connection) {
  const [columns] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quizzes' AND COLUMN_NAME = 'level_id'`
  );

  if (columns.length) {
    return;
  }

  await connection.query(`
    ALTER TABLE quizzes
      ADD COLUMN level_id BIGINT UNSIGNED DEFAULT NULL AFTER passing_score,
      ADD KEY idx_quizzes_level_id (level_id),
      ADD CONSTRAINT fk_quizzes_level FOREIGN KEY (level_id) REFERENCES levels (id)
        ON UPDATE CASCADE ON DELETE SET NULL
  `);
}

module.exports = { up };
