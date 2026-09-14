const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  quiet: true,
});

const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Refuse to start with a secret anyone can read in this repo's own .env.example -
// signing tokens with it would let an attacker forge admin sessions.
const insecureJwtSecrets = new Set(['nyaya-access-secret-dev', 'nyaya-refresh-secret-dev']);

if (
  insecureJwtSecrets.has(process.env.JWT_ACCESS_SECRET) ||
  insecureJwtSecrets.has(process.env.JWT_REFRESH_SECRET)
) {
  throw new Error(
    'JWT_ACCESS_SECRET / JWT_REFRESH_SECRET must not use the placeholder dev values. Set your own secrets in .env.'
  );
}

module.exports = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  authCookies: {
    refreshTokenName: process.env.REFRESH_COOKIE_NAME || 'nyaya_refresh_token',
    sameSite: process.env.REFRESH_COOKIE_SAME_SITE || 'strict',
    secure:
      process.env.REFRESH_COOKIE_SECURE === 'true' ||
      (!Object.prototype.hasOwnProperty.call(process.env, 'REFRESH_COOKIE_SECURE') &&
        process.env.NODE_ENV === 'production'),
    path: process.env.REFRESH_COOKIE_PATH || '/api/v1/auth',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 10000,
  },
};
