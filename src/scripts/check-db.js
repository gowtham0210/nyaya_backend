const { pool, checkDatabaseConnection } = require('../config/database');

async function run() {
  try {
    const dbStatus = await checkDatabaseConnection();

    console.log('MySQL connection successful.');
    console.log(`Database: ${dbStatus.databaseName}`);
    console.log(`Server time: ${dbStatus.serverTime}`);
  } catch (error) {
    console.error('MySQL connection failed.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
