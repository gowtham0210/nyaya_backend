const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

// Brings an EXISTING database up to date with schema changes made after it was
// created. A brand-new database doesn't need this: `npm run db:init` builds it
// straight from the current schema.sql, which already includes everything
// below. This is for every other database (production, a teammate's local
// copy, a fresh clone that already has data) that predates one of these
// changes.
//
// Each file in ./migrations exports `up(connection)` and is also independently
// idempotent (checks information_schema before altering), so running this
// against a database that already has a column is a safe no-op - the
// schema_migrations table is bookkeeping for "what ran and when", not the only
// thing preventing a double-apply.
const migrationsDir = path.join(__dirname, '../database/migrations');

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function run() {
  const connection = await pool.getConnection();

  try {
    await ensureMigrationsTable(connection);

    const [appliedRows] = await connection.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.name));

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.js'))
      .sort();
    const pending = files.filter((file) => !applied.has(file));

    if (!pending.length) {
      console.log('Database is already up to date. Nothing to migrate.');
      return;
    }

    for (const file of pending) {
      const migration = require(path.join(migrationsDir, file));
      console.log(`Applying ${file}...`);
      await connection.beginTransaction();

      try {
        await migration.up(connection);
        await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
        await connection.commit();
        console.log(`  done.`);
      } catch (error) {
        await connection.rollback();
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error('Migration failed.');
  console.error(error.message);
  process.exitCode = 1;
});
