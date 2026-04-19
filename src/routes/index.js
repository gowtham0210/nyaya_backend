const express = require('express');
const { checkDatabaseConnection } = require('../config/database');
const { nodeEnv } = require('../config/env');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: 'Nyaya API is running',
    docs: {
      health: '/api/health',
      database: '/api/health/db',
    },
  });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

router.get('/health/db', async (req, res, next) => {
  try {
    const dbStatus = await checkDatabaseConnection();

    res.json({
      status: 'ok',
      database: dbStatus.databaseName,
      connected: Boolean(dbStatus.connected),
      serverTime: dbStatus.serverTime,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
