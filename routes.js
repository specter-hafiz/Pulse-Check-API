'use strict';

/**
 * routes.js — the HTTP layer.
 *
 * Three things, in order:
 *   1. Body validation (a tiny declarative validator + reusable field checks).
 *   2. The monitor router — thin controllers that call an action and respond.
 *   3. The error handler — turns thrown domain errors into HTTP status codes.
 *
 * Controllers stay thin: they translate HTTP ↔ action calls and pass any error
 * to the central error handler via next(err).
 */

const { Router } = require('express');
const {
  DomainError,
  MonitorNotFoundError,
  MonitorAlreadyExistsError,
  MonitorAlreadyPausedError,
} = require('./monitor');

// ── 1. Validation ────────────────────────────────────────────────────────────

function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, validate] of Object.entries(schema)) {
      const message = validate(req.body?.[field]);
      if (message) errors.push({ field, message });
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed.', type: 'ValidationError', errors });
    }
    next();
  };
}

const isNonEmptyString = (label) => (v) =>
  typeof v !== 'string' || !v.trim() ? `"${label}" must be a non-empty string.` : null;

const isPositiveInteger = (label) => (v) =>
  !Number.isInteger(v) || v < 1 ? `"${label}" must be a positive integer (seconds).` : null;

const isEmail = (label) => (v) =>
  typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    ? `"${label}" must be a valid email address.`
    : null;

const isOptionalUrl = (label) => (v) => {
  if (v === undefined || v === null || v === '') return null;
  try {
    const url = new URL(v);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : `"${label}" must be an http(s) URL.`;
  } catch {
    return `"${label}" must be a valid URL when provided.`;
  }
};

// ── 2. Router ────────────────────────────────────────────────────────────────

function makeMonitorRouter(service, writeLimiter = (_req, _res, next) => next()) {
  const router = Router();

  // POST /monitors — register a monitor (arms the countdown).
  router.post(
    '/',
    writeLimiter,
    validateBody({
      id: isNonEmptyString('id'),
      timeout: isPositiveInteger('timeout'),
      alert_email: isEmail('alert_email'),
      webhook_url: isOptionalUrl('webhook_url'),
    }),
    (req, res, next) => {
      try {
        const { id, timeout, alert_email, webhook_url } = req.body;
        const monitor = service.registerMonitor({
          id: id.trim(),
          timeoutSeconds: timeout,
          alertEmail: alert_email,
          webhookUrl: webhook_url || null,
        });
        res.status(201).json({
          message: `Monitor "${monitor.id}" created. Countdown started: ${monitor.timeoutSeconds}s.`,
          monitor: monitor.toJSON(),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /monitors/:id/heartbeat — reset the countdown (auto-resumes/recovers).
  router.post('/:id/heartbeat', writeLimiter, (req, res, next) => {
    try {
      const monitor = service.heartbeatMonitor({ id: req.params.id });
      res.status(200).json({
        message: `Heartbeat received. Timer reset to ${monitor.timeoutSeconds}s.`,
        monitor: monitor.toJSON(),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /monitors/:id/pause — pause monitoring (no alerts fire).
  router.post('/:id/pause', writeLimiter, (req, res, next) => {
    try {
      const monitor = service.pauseMonitor({ id: req.params.id });
      res.status(200).json({
        message: `Monitor "${monitor.id}" paused. Send a heartbeat to resume.`,
        monitor: monitor.toJSON(),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /monitors — list all monitors.
  router.get('/', (_req, res) => {
    const monitors = service.listMonitors();
    res.status(200).json({ count: monitors.length, monitors: monitors.map((m) => m.toJSON()) });
  });

  // GET /monitors/:id/history — the audit trail (must precede /:id).
  router.get('/:id/history', (req, res, next) => {
    try {
      const events = service.getMonitorHistory({ id: req.params.id });
      res.status(200).json({ id: req.params.id, count: events.length, events });
    } catch (err) {
      next(err);
    }
  });

  // GET /monitors/:id — fetch a single monitor.
  router.get('/:id', (req, res, next) => {
    try {
      const monitor = service.getMonitor({ id: req.params.id });
      res.status(200).json({ monitor: monitor.toJSON() });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /monitors/:id — remove a monitor + cancel its timer.
  router.delete('/:id', (req, res, next) => {
    try {
      const monitor = service.deleteMonitor({ id: req.params.id });
      res.status(200).json({ message: `Monitor "${monitor.id}" deleted.` });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ── 3. Error handling + request logging ──────────────────────────────────────

const STATUS_MAP = new Map([
  [MonitorNotFoundError, 404],
  [MonitorAlreadyExistsError, 409],
  [MonitorAlreadyPausedError, 409],
]);

function errorHandler(err, _req, res, _next) {
  if (err instanceof DomainError) {
    const status = STATUS_MAP.get(err.constructor) ?? 400;
    return res.status(status).json({ error: err.message, type: err.name });
  }
  console.error('[UNHANDLED ERROR]', err);
  return res.status(500).json({ error: 'An unexpected error occurred.', type: 'InternalServerError' });
}

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}

module.exports = { makeMonitorRouter, errorHandler, requestLogger };
