async function startServer() {
  try {
    const { port } = require('./config/env');
    const { checkDatabaseConnection } = require('./config/database');
    const app = require('./app');
    const dbStatus = await checkDatabaseConnection();
    console.log(`MySQL connected successfully to "${dbStatus.databaseName}".`);

    app.listen(port, () => {
      console.log(`Nyaya API server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server.');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

startServer();
