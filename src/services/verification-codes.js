const crypto = require('crypto');
const { hashToken } = require('../utils/auth');

// Shared by password-reset codes and email-verification codes: both are a
// 6-digit code, hashed at rest, with an expiry, a resend cooldown, and a
// max-attempts lockout. `columns` names the three DB columns to read/write.

function generateNumericCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Issues a new code and writes its hash, unless one was already issued within
// `resendCooldownMs` - callers should silently no-op in that case (repeat
// requests aren't an error) rather than surface "please wait" and leak that
// the account exists. Returns the plaintext code to send, or null if skipped.
async function issueCode(connection, { table, id, columns, ttlMs, resendCooldownMs, currentExpiresAt }) {
  const lastIssuedAt = currentExpiresAt ? new Date(currentExpiresAt).getTime() - ttlMs : 0;

  if (Date.now() - lastIssuedAt < resendCooldownMs) {
    return null;
  }

  const code = generateNumericCode();

  await connection.execute(
    `UPDATE ${table} SET ${columns.hash} = ?, ${columns.expiresAt} = ?, ${columns.attempts} = 0 WHERE id = ?`,
    [hashToken(code), new Date(Date.now() + ttlMs), id]
  );

  return code;
}

function isCodeUsable({ hash, expiresAt, attempts, maxAttempts }) {
  return Boolean(hash) && new Date(expiresAt).getTime() > Date.now() && Number(attempts) < maxAttempts;
}

module.exports = {
  generateNumericCode,
  issueCode,
  isCodeUsable,
};
