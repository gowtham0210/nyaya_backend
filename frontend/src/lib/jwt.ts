export function decodeJwtPayload(token: string | null | undefined) {
  if (!token) {
    return null;
  }

  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(window.atob(padded));
  } catch (error) {
    return null;
  }
}

export function getTokenExpiryMs(token: string | null | undefined) {
  const payload = decodeJwtPayload(token);
  return payload?.exp ? Number(payload.exp) * 1000 : 0;
}
