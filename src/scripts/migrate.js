const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

// For schema changes that can't be written as idempotent statements in
// schema.sql (data backfills, renames, type changes). Runs after db:init on
// every deploy; there are none yet.
//
// Each file in ./migrations exports `up(connection)` and runs once, in name
// order, inside its own transaction (PostgreSQL DDL is transactional, so a
// failed migration leaves nothing half-applied). Write them idempotently anyway
// (check information_schema first) so a database built from a newer schema.sql
// is a safe no-op.
const migrationsDir = path.join(__dirname, '../database/migrations');

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function run() {
  const connection = await pool.getConnection();

  try {
    await ensureMigrationsTable(connection);

    const [appliedRows] = await connection.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.name));

    const files = (fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir) : [])
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
