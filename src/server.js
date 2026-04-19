const app = require('./app');
const { port } = require('./config/env');
const { checkDatabaseConnection } = require('./config/database');

async function startServer() {
  try {
    const dbStatus = await checkDatabaseConnection();
    console.log(`MySQL connected successfully to "${dbStatus.databaseName}".`);

    app.listen(port, () => {
      console.log(`Nyaya API server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

startServer();
