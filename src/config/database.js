const mysql = require('mysql2/promise');
const { db } = require('./env');

const pool = mysql.createPool(db);

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
  const connection = await pool.getConnection();

  try {
    const [rows] = await connection.query(
      'SELECT DATABASE() AS databaseName, NOW() AS serverTime, 1 AS connected'
    );

    return rows[0];
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  withTransaction,
  checkDatabaseConnection,
};
