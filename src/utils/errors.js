class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new AppError(400, message, details);
}

function unauthorized(message = 'Unauthorized') {
  return new AppError(401, message);
}

function forbidden(message = 'Forbidden') {
  return new AppError(403, message);
}

function notFound(message = 'Resource not found') {
  return new AppError(404, message);
}

function conflict(message, details) {
  return new AppError(409, message, details);
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
