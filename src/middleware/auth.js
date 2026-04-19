const { pool } = require('../config/database');
const { verifyAccessToken } = require('../utils/auth');
const { unauthorized, forbidden } = require('../utils/errors');

async function authenticate(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization || '';
    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw unauthorized('Missing bearer token');
    }

    const payload = verifyAccessToken(token);
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, phone, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1',
      [Number(payload.sub)]
    );
    const user = rows[0];

    if (!user) {
      throw unauthorized('User not found');
    }

    if (user.status !== 'active') {
      throw forbidden('User is not allowed to access this resource');
    }

    req.auth = {
      userId: Number(user.id),
      email: user.email,
      role: payload.role || 'user',
    };
    req.currentUser = user;
    next();
  } catch (error) {
    next(
      error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError'
        ? unauthorized('Invalid or expired token')
        : error
    );
  }
}

function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'admin') {
    return next(forbidden('Admin access is required'));
  }

  return next();
}

module.exports = {
  authenticate,
  requireAdmin,
};
