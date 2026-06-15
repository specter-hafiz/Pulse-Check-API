'use strict';

const {
  DomainError,
  MonitorNotFoundError,
  MonitorAlreadyExistsError,
  MonitorAlreadyPausedError,
} = require('../../../domain/errors');

/**
 * Domain-error → HTTP status map. Any unmapped DomainError becomes 400;
 * anything that isn't a DomainError becomes 500 (and is logged, never leaked).
 */
const STATUS_MAP = new Map([
  [MonitorNotFoundError, 404],
  [MonitorAlreadyExistsError, 409],
  [MonitorAlreadyPausedError, 409],
]);

/**
 * Central error-handling middleware. Controllers just `throw`/`next(err)`;
 * status-code translation happens here so they stay free of error plumbing.
 *
 * @type {import('express').ErrorRequestHandler}
 */
function errorHandler(err, _req, res, _next) {
  if (err instanceof DomainError) {
    const status = STATUS_MAP.get(err.constructor) ?? 400;
    return res.status(status).json({ error: err.message, type: err.name });
  }

  console.error('[UNHANDLED ERROR]', err);
  return res.status(500).json({
    error: 'An unexpected error occurred.',
    type: 'InternalServerError',
  });
}

module.exports = { errorHandler };
