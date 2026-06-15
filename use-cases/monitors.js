'use strict';

const { Router } = require('express');
const { validateBody, validators } = require('../middleware/validateBody');
const { isNonEmptyString, isPositiveInteger, isEmail, isOptionalUrl } = validators;

/**
 * makeMonitorRouter
 *
 * Factory that wires use-cases into Express routes.
 * Controllers are thin: they translate HTTP ↔ use-case commands,
 * and let the central error handler deal with domain exceptions.
 *
 * @param {object} useCases
 * @returns {import('express').Router}
 */
function makeMonitorRouter({
  registerMonitor,
  heartbeatMonitor,
  pauseMonitor,
  getMonitor,
  listMonitors,
  deleteMonitor,
}) {
  const router = Router();

  // ── POST /monitors ─────────────────────────────────────────────────────────
  router.post(
    '/',
    validateBody({
      id:             isNonEmptyString('id'),
      timeout:        isPositiveInteger('timeout'),
      alert_email:    isEmail('alert_email'),
      webhook_url:    isOptionalUrl('webhook_url'),
    }),
    (req, res, next) => {
      try {
        const { id, timeout, alert_email, webhook_url } = req.body;
        const monitor = registerMonitor({
          id:             id.trim(),
          timeoutSeconds: timeout,
          alertEmail:     alert_email,
          webhookUrl:     webhook_url ?? null,
        });

        res.status(201).json({
          message: `Monitor "${monitor.id}" created. Countdown started: ${monitor.timeoutSeconds}s.`,
          monitor: monitor.toJSON(),
        });
      } catch (err) { next(err); }
    }
  );

  // ── POST /monitors/:id/heartbeat ───────────────────────────────────────────
  router.post('/:id/heartbeat', (req, res, next) => {
    try {
      const monitor = heartbeatMonitor({ id: req.params.id });
      res.status(200).json({
        message: `Heartbeat received. Timer reset to ${monitor.timeoutSeconds}s.`,
        monitor: monitor.toJSON(),
      });
    } catch (err) { next(err); }
  });

  // ── POST /monitors/:id/pause ───────────────────────────────────────────────
  router.post('/:id/pause', (req, res, next) => {
    try {
      const monitor = pauseMonitor({ id: req.params.id });
      res.status(200).json({
        message: `Monitor "${monitor.id}" paused. Send a heartbeat to resume.`,
        monitor: monitor.toJSON(),
      });
    } catch (err) { next(err); }
  });

  // ── GET /monitors ──────────────────────────────────────────────────────────
  router.get('/', (req, res) => {
    const monitors = listMonitors();
    res.status(200).json({
      count:    monitors.length,
      monitors: monitors.map((m) => m.toJSON()),
    });
  });

  // ── GET /monitors/:id ──────────────────────────────────────────────────────
  router.get('/:id', (req, res, next) => {
    try {
      const monitor = getMonitor({ id: req.params.id });
      res.status(200).json({ monitor: monitor.toJSON() });
    } catch (err) { next(err); }
  });

  // ── DELETE /monitors/:id ───────────────────────────────────────────────────
  router.delete('/:id', (req, res, next) => {
    try {
      const monitor = deleteMonitor({ id: req.params.id });
      res.status(200).json({
        message: `Monitor "${monitor.id}" deleted.`,
      });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { makeMonitorRouter };
