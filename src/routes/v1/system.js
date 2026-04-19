const express = require('express');
const { asyncHandler } = require('../../utils/async-handler');
const { checkDatabaseConnection } = require('../../config/database');

const router = express.Router();

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    res.json({ status: 'ok' });
  })
);

router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    await checkDatabaseConnection();

    res.json({
      status: 'ready',
      database: 'up',
    });
  })
);

module.exports = router;
