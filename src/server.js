const logger = require('./utils/logger');

async function startServer() {
  try {
    const { port } = require('./config/env');
    const { pool, checkDatabaseConnection } = require('./config/database');
    const app = require('./app');
    const dbStatus = await checkDatabaseConnection();
    logger.info(`MySQL connected successfully to "${dbStatus.databaseName}".`);

    const server = app.listen(port, () => {
      logger.info(`Nyaya API server is running on http://localhost:${port}`);
    });

    // Stop taking new connections, let in-flight requests finish, then close the
    // DB pool - in that order, so a request that's mid-query doesn't lose its
    // connection out from under it. Without this, a deploy or restart just
    // kills whatever was in progress.
    let shuttingDown = false;

    async function shutdown(signal) {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      logger.info(`${signal} received, shutting down gracefully...`);

      const forceExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out after 10s, forcing exit.');
        process.exit(1);
      }, 10_000);
      forceExitTimer.unref();

      server.close(async (closeError) => {
        if (closeError) {
          logger.error({ err: closeError }, 'Error while closing HTTP server');
        }

        try {
          await pool.end();
        } catch (poolError) {
          logger.error({ err: poolError }, 'Error while closing database pool');
        }

        clearTimeout(forceExitTimer);
        process.exit(closeError ? 1 : 0);
      });
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server.');
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  logger.error({ err: error }, 'Unhandled promise rejection');
});

startServer();
