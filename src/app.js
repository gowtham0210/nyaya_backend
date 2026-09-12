const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');
const apiRoutesV1 = require('./routes/v1');
const { corsOrigin } = require('./config/env');
const { AppError } = require('./utils/errors');
const logger = require('./utils/logger');

const app = express();

const corsOptions =
  corsOrigin === '*'
    ? {
        origin: true,
        credentials: true,
      }
    : {
        origin: corsOrigin.split(',').map((value) => value.trim()),
        credentials: true,
      };

app.use(
  pinoHttp({
    logger,
    // Access tokens and refresh cookies are secrets; never let them reach the logs.
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  })
);
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Nyaya backend server',
    apiBaseUrl: '/api/v1',
  });
});

app.use('/api/v1', apiRoutesV1);

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
  });
});

app.use((error, req, res, next) => {
  (req.log || logger).error({ err: error }, 'Request failed');

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details,
    });
  }

  if (error && error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'A record with the same unique value already exists',
    });
  }

  if (error && ['ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2'].includes(error.code)) {
    return res.status(400).json({
      message: 'The request references related data that is missing or protected',
    });
  }

  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

module.exports = app;
