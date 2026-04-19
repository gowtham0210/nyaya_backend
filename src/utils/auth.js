const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { adminEmails, jwt: jwtConfig, nodeEnv } = require('../config/env');

function isAdminEmail(email) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (adminEmails.length > 0) {
    return adminEmails.includes(normalizedEmail);
  }

  return nodeEnv !== 'production';
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: isAdminEmail(user.email) ? 'admin' : 'user',
    },
    jwtConfig.accessSecret,
    { expiresIn: jwtConfig.accessExpiresIn }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      type: 'refresh',
      role: isAdminEmail(user.email) ? 'admin' : 'user',
    },
    jwtConfig.refreshSecret,
    { expiresIn: jwtConfig.refreshExpiresIn }
  );
}

function generateTokenPair(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtConfig.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, jwtConfig.refreshSecret);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  hashPassword,
  comparePassword,
  isAdminEmail,
};
