const { Pool, types } = require('pg');
const { db } = require('./env');

// PostgreSQL behind the same small surface the code was written against
// (mysql2's): `pool.query/execute(sql, params)` resolving to `[rows]`,
// `?` placeholders, `pool.getConnection()` + beginTransaction/commit/rollback/
// release, and `result.insertId` / `result.affectedRows` on writes. Keeping
// that shape lets every query site stay as it is apart from SQL dialect fixes.

// node-postgres returns BIGINT (ids, COUNT(*), SUM(int)) and NUMERIC as strings
// to avoid precision loss. Nothing here comes near 2^53, and the code does math
// and === comparisons on these values, so parse them as plain numbers.
types.setTypeParser(types.builtins.INT8, (value) => Number(value));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));

const pgPool = new Pool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  max: db.connectionLimit,
  connectionTimeoutMillis: db.connectTimeout,
  ssl: db.ssl ? { rejectUnauthorized: false } : undefined,
});

// Idle clients can error (e.g. the server restarts); without a listener that
// would crash the process. The next query simply gets a fresh client.
pgPool.on('error', (error) => {
  // Required lazily: the logger depends on env, which this module already loaded.
  require('../utils/logger').error({ err: error }, 'Idle PostgreSQL client error');
});

// Rewrites `?` placeholders to `$1, $2, ...` (skipping quoted literals). An
// array value expands in place, so `IN (?)` with [1, 2, 3] becomes `IN ($1, $2, $3)`
// as it did under mysql2; an empty array becomes NULL, which matches nothing.
// Booleans become 1/0 because flag columns are SMALLINT 0/1 (see schema.postgres.sql).
function toPgQuery(sql, params = []) {
  const values = [];
  const push = (value) => {
    values.push(typeof value === 'boolean' ? Number(value) : value);
    return `$${values.length}`;
  };

  let text = '';
  let quote = null;
  let paramIndex = 0;

  for (const char of sql) {
    if (quote) {
      if (char === quote) {
        quote = null;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '?') {
      if (paramIndex >= params.length) {
        throw new Error(`Query has more placeholders than the ${params.length} parameter(s) given`);
      }

      const value = params[paramIndex++];
      text += Array.isArray(value) ? (value.length ? value.map(push).join(', ') : 'NULL') : push(value);
      continue;
    }

    text += char;
  }

  if (paramIndex !== params.length) {
    throw new Error(`Query has ${paramIndex} placeholder(s) but ${params.length} parameter(s) were given`);
  }

  return { text, values };
}

const WRITE_COMMANDS = new Set(['INSERT', 'UPDATE', 'DELETE']);

// Reads resolve to [rows]; writes resolve to [{ affectedRows, insertId, rows }].
// insertId is the `id` of the first RETURNING row, so an INSERT whose new id is
// needed must say `RETURNING id`.
function toResult(result) {
  if (WRITE_COMMANDS.has(result.command)) {
    return [
      {
        affectedRows: result.rowCount,
        insertId: result.rows[0] ? result.rows[0].id : undefined,
        rows: result.rows,
      },
      result.fields,
    ];
  }

  return [result.rows, result.fields];
}

async function runQuery(client, sql, params) {
  // No params: send the text as-is (simple query protocol), which also allows
  // several statements in one call - init-db relies on that for the schema file.
  if (!params || params.length === 0) {
    const result = await client.query(sql);
    return toResult(Array.isArray(result) ? result[result.length - 1] : result);
  }

  return toResult(await client.query(toPgQuery(sql, params)));
}

function createConnection(client) {
  return {
    query: (sql, params) => runQuery(client, sql, params),
    execute: (sql, params) => runQuery(client, sql, params),
    beginTransaction: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
    release: () => client.release(),
  };
}

const pool = {
  query: (sql, params) => runQuery(pgPool, sql, params),
  execute: (sql, params) => runQuery(pgPool, sql, params),
  getConnection: async () => createConnection(await pgPool.connect()),
  end: () => pgPool.end(),
};

async function withTransaction(callback) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function checkDatabaseConnection() {
  const [rows] = await pool.query(
    'SELECT current_database() AS "databaseName", NOW() AS "serverTime", 1 AS connected'
  );

  return rows[0];
}

// PostgreSQL error codes the app maps to friendlier HTTP responses.
const PG_ERRORS = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
};

module.exports = {
  pool,
  withTransaction,
  checkDatabaseConnection,
  toPgQuery,
  PG_ERRORS,
};
