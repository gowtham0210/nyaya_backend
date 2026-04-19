const { authCookies } = require('../config/env');

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((cookies, chunk) => {
      const separatorIndex = chunk.indexOf('=');

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(chunk.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(chunk.slice(separatorIndex + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function getRefreshTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[authCookies.refreshTokenName] || null;
}

function setRefreshTokenCookie(res, refreshToken, expiresAt) {
  res.cookie(authCookies.refreshTokenName, refreshToken, {
    httpOnly: true,
    sameSite: authCookies.sameSite,
    secure: authCookies.secure,
    path: authCookies.path,
    expires: expiresAt,
  });
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(authCookies.refreshTokenName, {
    httpOnly: true,
    sameSite: authCookies.sameSite,
    secure: authCookies.secure,
    path: authCookies.path,
  });
}

module.exports = {
  parseCookieHeader,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};
