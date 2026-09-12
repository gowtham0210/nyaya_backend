const { pool } = require('../config/database');
const logger = require('../utils/logger');

const MAX_LOGGED_BODY_LENGTH = 2000;
// Never write these into the audit trail even if a future route accepts them.
const REDACTED_FIELDS = new Set(['password', 'currentPassword', 'newPassword', 'code']);

function safeStringifyBody(body) {
  if (!body || typeof body !== 'object' || !Object.keys(body).length) {
    return null;
  }

  const redacted = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, REDACTED_FIELDS.has(key) ? '[redacted]' : value])
  );
  const json = JSON.stringify(redacted);

  return json.length > MAX_LOGGED_BODY_LENGTH ? `${json.slice(0, MAX_LOGGED_BODY_LENGTH)}...(truncated)` : json;
}

// Mounted once, ahead of the whole /admin router (see routes/v1/index.js), so
// every admin mutation is recorded without each individual route needing to
// remember to call something - the same "fix it once at the shared boundary"
// reasoning as the level-unlock check. Reads (GET) aren't logged; there's
// nothing to audit about looking at data. Failed requests (4xx/5xx) aren't
// logged either - nothing changed, so there's nothing to have a record of.
function auditAdminActions(req, res, next) {
  if (req.method === 'GET') {
    return next();
  }

  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.auth) {
      return;
    }

    pool
      .execute(
        `INSERT INTO admin_audit_log (admin_user_id, method, path, status_code, request_body)
         VALUES (?, ?, ?, ?, ?)`,
        [req.auth.userId, req.method, req.originalUrl, res.statusCode, safeStringifyBody(req.body)]
      )
      .catch((error) => {
        // Never let audit logging itself break or slow down the response it's
        // logging - it already happened by the time this callback runs.
        logger.error({ err: error }, 'Failed to write admin audit log entry');
      });
  });

  next();
}

module.exports = { auditAdminActions };
