'use strict';

/**
 * requestLogger — minimal structured access log.
 *
 * Logs method, path, status and duration once the response finishes. Silent
 * during tests to keep Jest output readable.
 *
 * @type {import('express').RequestHandler}
 */
function requestLogger(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}

module.exports = { requestLogger };
