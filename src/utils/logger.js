const pino = require('pino');
const { nodeEnv } = require('../config/env');

// Pretty-printed in development so it stays readable in a terminal; plain JSON lines
// in production so a log collector (CloudWatch, Render logs, etc.) can parse and
// search it - that's the whole point of structured logging over console.log.
const logger = pino({
  level: process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug'),
  transport:
    nodeEnv === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
});

module.exports = logger;
