'use strict';

/**
 * server.js — composition root + entry point.
 *
 * This is the one place that knows about every layer at once. It picks a
 * storage backend, wires the store → actions → HTTP, and starts listening.
 * Swapping persistence (SQLite ↔ in-memory) happens *here only*.
 */

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { config } = require('./config');
const { makeMonitorService } = require('./monitor');
const { fireAlert } = require('./alert');
const {
  openDatabase,
  InMemoryMonitorRepository,
  InMemoryEventRepository,
  SqliteMonitorRepository,
  SqliteEventRepository,
} = require('./store');
const { makeMonitorRouter, errorHandler, requestLogger } = require('./routes');

// Build the chosen storage backend and the alert wiring.
function buildStores(cfg) {
  let db = null;
  let monitorRepository;
  let eventRepository;

  // Record the "down" event alongside firing the alert, so the audit trail and
  // the side-effect always stay in lock-step.
  const onAlert = (monitor) => {
    try {
      eventRepository.record({
        monitorId: monitor.id,
        type: 'alert',
        message: `Device ${monitor.id} is down — no heartbeat within ${monitor.timeoutSeconds}s.`,
      });
    } catch (err) {
      console.error('[ALERT] Failed to record alert event:', err.message);
    }
    return fireAlert(monitor);
  };

  if (cfg.store === 'sqlite') {
    db = openDatabase(cfg.databaseFile);
    eventRepository = new SqliteEventRepository({ db });
    monitorRepository = new SqliteMonitorRepository({ db, onAlert });
  } else {
    eventRepository = new InMemoryEventRepository();
    monitorRepository = new InMemoryMonitorRepository({ onAlert });
  }

  return { monitorRepository, eventRepository, db };
}

function createApp(cfg) {
  const { monitorRepository, eventRepository, db } = buildStores(cfg);
  const service = makeMonitorService({ monitorRepository, eventRepository });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // accurate client IPs behind a proxy for rate limiting

  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.use(requestLogger);

  const writeLimiter = rateLimit({
    windowMs: cfg.rateLimit.windowMs,
    max: cfg.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.', type: 'RateLimitError' },
  });

  app.use('/api/monitors', makeMonitorRouter(service, writeLimiter));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      store: cfg.store,
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '1.0.0',
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found.', type: 'NotFoundError' });
  });
  app.use(errorHandler);

  // Teardown: cancel timers and close the DB handle.
  const close = () => {
    monitorRepository.close?.();
    db?.close?.();
  };

  return { app, close };
}

// ── Start the server ─────────────────────────────────────────────────────────

const { app, close } = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`\n  Pulse-Check-API`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Listening  http://localhost:${config.port}`);
  console.log(`  Health     http://localhost:${config.port}/health`);
  console.log(`  Store      ${config.store}`);
  console.log(`  Env        ${config.nodeEnv}\n`);
});

function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(() => {
    close(); // cancel timers, close the DB handle
    console.log('Server closed. Goodbye.\n');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
