const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../config/database');

const schemaFilePath = path.resolve(__dirname, '../database/schema.sql');

// Applies the whole schema in one round trip. It's sent without parameters, so
// PostgreSQL runs it as a multi-statement script (function bodies and DO blocks
// included), all inside one implicit transaction: it applies fully or not at all.
// Every statement is idempotent, so this is safe on an existing database too.
async function run() {
  try {
    const sqlContent = await fs.readFile(schemaFilePath, 'utf8');
    await pool.query(sqlContent);

    console.log('Database schema is up to date.');
  } catch (error) {
    console.error('Database schema initialization failed.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
