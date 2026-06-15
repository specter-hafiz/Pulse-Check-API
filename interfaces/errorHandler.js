'use strict';

const {
  DomainError,
  MonitorNotFoundError,
  MonitorAlreadyExistsError,
  MonitorAlreadyDownError,
  MonitorAlreadyPausedError,
} = require('../../../domain/errors');

/**
 * Domain-error → HTTP status map.
 * Unknown errors bubble up as 500.
 */
const STATUS_MAP = new Map([
  [MonitorNotFoundError,       404],
  [MonitorAlreadyExistsError,  409],
  [MonitorAlreadyDownError,    409],
  [MonitorAlreadyPausedError,  409],
]);

/**
 * Central error-handling middleware.
 *
 * Translates domain errors to structured JSON responses so that
 * controllers stay clean (they just throw; they never set status codes
 * for error cases themselves).
 *
 * @type {import('express').ErrorRequestHandler}
 */
function errorHandler(err, _req, res, _next) {
  if (err instanceof DomainError) {
    const status = STATUS_MAP.get(err.constructor) ?? 400;
    return res.status(status).json({
      error: err.message,
      type:  err.name,
    });
  }

  // Unexpected errors — never leak internals to the client
  console.error('[UNHANDLED ERROR]', err);
  return res.status(500).json({
    error: 'An unexpected error occurred.',
    type:  'InternalServerError',
  });
}

module.exports = { errorHandler };
