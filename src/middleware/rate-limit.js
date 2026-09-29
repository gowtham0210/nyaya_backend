const rateLimit = require('express-rate-limit');
const { nodeEnv } = require('../config/env');

// Rate limiting is the app's main defense against credential stuffing and
// brute-forcing login/reset codes. Skipped under the automated test suite so
// its own repeated requests don't trip it; NODE_ENV=test is set by `npm test`.
const skip = () => nodeEnv === 'test';

function respondWithLimitError(req, res) {
  res.status(429).json({
    message: 'Too many requests. Please try again later.',
  });
}

// Login and reset-password guess-checking are the two endpoints an attacker would
// hammer to brute-force their way into an account.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: respondWithLimitError,
});

// Registration and forgot-password both trigger side effects worth throttling
// harder: a new row per registration, an outgoing email per forgot-password call.
const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: respondWithLimitError,
});

module.exports = {
  authLimiter,
  sensitiveActionLimiter,
};
