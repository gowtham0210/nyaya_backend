function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getPagination(query, defaults = {}) {
  const defaultPage = defaults.page || 1;
  const defaultSize = defaults.size || 20;
  const maxSize = defaults.maxSize || 100;
  const page = parsePositiveInteger(query.page, defaultPage);
  const requestedSize = parsePositiveInteger(query.size, defaultSize);
  const size = Math.min(requestedSize, maxSize);

  return {
    page,
    size,
    offset: (page - 1) * size,
  };
}

function getLimit(query, defaultLimit = 20, maxLimit = 100) {
  const requestedLimit = parsePositiveInteger(query.limit, defaultLimit);
  return Math.min(requestedLimit, maxLimit);
}

module.exports = {
  getPagination,
  getLimit,
};
