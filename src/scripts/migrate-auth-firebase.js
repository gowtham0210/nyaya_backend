const { pool } = require('../config/database');
const { db } = require('../config/env');

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?
    `,
    [db.database, table, column]
  );

  return rows[0].count > 0;
}

async function run() {
  const connection = await pool.getConnection();

  try {
    if (!(await columnExists(connection, 'users', 'profession'))) {
      await connection.query('ALTER TABLE users ADD COLUMN profession VARCHAR(120) DEFAULT NULL AFTER phone');
      console.log('Added users.profession');
    } else {
      const [professionColumn] = await connection.query(
        `
          SELECT is_nullable AS isNullable
          FROM information_schema.columns
          WHERE table_schema = ? AND table_name = 'users' AND column_name = 'profession'
        `,
        [db.database]
      );

      if (professionColumn[0] && professionColumn[0].isNullable === 'NO') {
        await connection.query('ALTER TABLE users MODIFY profession VARCHAR(120) DEFAULT NULL');
        console.log('Relaxed users.profession to nullable');
      }
    }

    if (!(await columnExists(connection, 'users', 'firebase_uid'))) {
      await connection.query(
        'ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128) DEFAULT NULL AFTER password_hash'
      );
      await connection.query(
        'ALTER TABLE users ADD UNIQUE KEY uq_users_firebase_uid (firebase_uid)'
      );
      console.log('Added users.firebase_uid');
    }

    if (!(await columnExists(connection, 'users', 'phone_verified'))) {
      await connection.query(
        "ALTER TABLE users ADD COLUMN phone_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER firebase_uid"
      );
      console.log('Added users.phone_verified');
    }

    const [emailColumn] = await connection.query(
      `
        SELECT is_nullable AS isNullable
        FROM information_schema.columns
        WHERE table_schema = ? AND table_name = 'users' AND column_name = 'email'
      `,
      [db.database]
    );

    if (emailColumn[0] && emailColumn[0].isNullable === 'NO') {
      await connection.query('ALTER TABLE users MODIFY email VARCHAR(191) DEFAULT NULL');
      console.log('Relaxed users.email to nullable');
    }

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

run();
