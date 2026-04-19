const { unauthorized } = require('../utils/errors');
const { hashToken, verifyRefreshToken } = require('../utils/auth');

function getRefreshTokenExpiryDate(refreshToken) {
  const payload = verifyRefreshToken(refreshToken);
  return {
    payload,
    expiresAt: new Date(Number(payload.exp) * 1000),
  };
}

async function storeRefreshToken(connection, userId, refreshToken) {
  const { expiresAt } = getRefreshTokenExpiryDate(refreshToken);

  await connection.execute(
    `
      INSERT INTO refresh_tokens (
        user_id,
        token_hash,
        expires_at,
        last_used_at
      )
      VALUES (?, ?, ?, UTC_TIMESTAMP())
    `,
    [userId, hashToken(refreshToken), expiresAt]
  );

  return expiresAt;
}

async function revokeRefreshToken(connection, refreshToken) {
  await connection.execute(
    `
      UPDATE refresh_tokens
      SET revoked_at = UTC_TIMESTAMP()
      WHERE token_hash = ? AND revoked_at IS NULL
    `,
    [hashToken(refreshToken)]
  );
}

async function assertRefreshTokenIsActive(connection, userId, refreshToken) {
  const [rows] = await connection.execute(
    `
      SELECT *
      FROM refresh_tokens
      WHERE token_hash = ?
        AND user_id = ?
      LIMIT 1
    `,
    [hashToken(refreshToken), userId]
  );
  const tokenRecord = rows[0];

  if (!tokenRecord) {
    throw unauthorized('Refresh token is not recognized');
  }

  if (tokenRecord.revoked_at) {
    throw unauthorized('Refresh token has been revoked');
  }

  if (new Date(tokenRecord.expires_at).getTime() <= Date.now()) {
    throw unauthorized('Refresh token has expired');
  }

  await connection.execute(
    `
      UPDATE refresh_tokens
      SET last_used_at = UTC_TIMESTAMP()
      WHERE id = ?
    `,
    [Number(tokenRecord.id)]
  );

  return tokenRecord;
}

module.exports = {
  getRefreshTokenExpiryDate,
  storeRefreshToken,
  revokeRefreshToken,
  assertRefreshTokenIsActive,
};
