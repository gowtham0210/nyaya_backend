const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../config/database');

const schemaFilePath = path.resolve(__dirname, '../database/schema.sql');

function splitSqlStatements(sqlContent) {
  return sqlContent
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function run() {
  try {
    const sqlContent = await fs.readFile(schemaFilePath, 'utf8');
    const statements = splitSqlStatements(sqlContent);

    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log(`Database schema initialized successfully with ${statements.length} statements.`);
  } catch (error) {
    console.error('Database schema initialization failed.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
