const { badRequest } = require('./errors');

function parseId(value, fieldName = 'id') {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return undefined;
}

function buildUpdateClause(payload, fieldMap) {
  const entries = Object.entries(fieldMap).filter(([field]) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );

  if (!entries.length) {
    return null;
  }

  return {
    setClause: entries.map(([, column]) => `${column} = ?`).join(', '),
    values: entries.map(([field]) => payload[field]),
  };
}

function requireFields(payload, fields) {
  for (const field of fields) {
    if (
      !Object.prototype.hasOwnProperty.call(payload, field) ||
      payload[field] === undefined ||
      payload[field] === null ||
      payload[field] === ''
    ) {
      throw badRequest(`${field} is required`);
    }
  }
}

module.exports = {
  parseId,
  parseBoolean,
  buildUpdateClause,
  requireFields,
};
