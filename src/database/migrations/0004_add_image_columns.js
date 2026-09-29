// Adds the columns behind image uploads: category/quiz thumbnails and player
// avatars. Values are paths under /uploads served by express.static - see
// src/middleware/upload.js for why that's a dev-only default.
async function up(connection) {
  const [categoryColumns] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'image_url'`
  );

  if (!categoryColumns.length) {
    await connection.query(
      'ALTER TABLE categories ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER description'
    );
  }

  const [quizColumns] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quizzes' AND COLUMN_NAME = 'image_url'`
  );

  if (!quizColumns.length) {
    await connection.query(
      'ALTER TABLE quizzes ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER description'
    );
  }

  const [userColumns] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'`
  );

  if (!userColumns.length) {
    await connection.query('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL AFTER phone');
  }
}

module.exports = { up };
