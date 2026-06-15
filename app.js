'use strict';

/**
 * app.js — composition root.
 *
 * The only place that knows about every layer at once. It selects a storage
 * backend, wires infrastructure → use-cases → HTTP, and returns both the
 * Express app and a `close()` for graceful teardown.
 *
 * Swapping persistence (in-memory ↔ SQLite) happens *here only* — the clean
 * boundaries mean no use-case or route changes when the backend changes.
 */

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { config } = require('./config');

// Infrastructure
const { fireAlert } = require('./infrastructure/alert/AlertService');
const { openDatabase } = require('./infrastructure/db/connection');
const { InMemoryMonitorRepository } = require('./infrastructure/store/InMemoryMonitorRepository');
const { SqliteMonitorRepository } = require('./infrastructure/store/SqliteMonitorRepository');
const { InMemoryEventRepository } = require('./infrastructure/store/InMemoryEventRepository');
const { SqliteEventRepository } = require('./infrastructure/store/SqliteEventRepository');

// Use-cases
const { makeRegisterMonitor } = require('./use-cases/registerMonitor');
const { makeHeartbeatMonitor } = require('./use-cases/heartbeatMonitor');
const { makePauseMonitor } = require('./use-cases/pauseMonitor');
const { makeGetMonitor } = require('./use-cases/getMonitor');
const { makeListMonitors } = require('./use-cases/listMonitors');
const { makeDeleteMonitor } = require('./use-cases/deleteMonitor');
const { makeGetMonitorHistory } = require('./use-cases/getMonitorHistory');

// HTTP
const { makeMonitorRouter } = require('./interfaces/http/routes/monitors');
const { requestLogger } = require('./interfaces/http/middleware/requestLogger');
const { errorHandler } = require('./interfaces/http/middleware/errorHandler');

/**
 * Build the storage layer for the configured backend.
 *
 * @param {typeof config} cfg
 * @returns {{ monitorRepository, eventRepository, db: (object|null) }}
 */
function buildStores(cfg) {
  let db = null;
  let eventRepository;

  if (cfg.store === 'sqlite') {
    db = openDatabase(cfg.databaseFile);
    eventRepository = new SqliteEventRepository({ db });
  } else {
    eventRepository = new InMemoryEventRepository();
  }

  // Record the "down" event alongside firing the alert, so the audit trail and
  // the side-effect always stay in lock-step. The monitor repository remains
  // oblivious to the existence of events — it just calls onAlert.
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

  const monitorRepository =
    cfg.store === 'sqlite'
      ? new SqliteMonitorRepository({ db, onAlert })
      : new InMemoryMonitorRepository({ onAlert });

  return { monitorRepository, eventRepository, db };
}

/**
 * @param {Partial<typeof config>} [overrides]
 * @returns {{ app: import('express').Express, close: () => void }}
 */
function createApp(overrides = {}) {
  const cfg = { ...config, ...overrides };

  // 1. Infrastructure
  const { monitorRepository, eventRepository, db } = buildStores(cfg);

  // 2. Use-cases (inject repositories)
  const useCases = {
    registerMonitor: makeRegisterMonitor({ monitorRepository, eventRepository }),
    heartbeatMonitor: makeHeartbeatMonitor({ monitorRepository, eventRepository }),
    pauseMonitor: makePauseMonitor({ monitorRepository, eventRepository }),
    getMonitor: makeGetMonitor({ monitorRepository }),
    listMonitors: makeListMonitors({ monitorRepository }),
    deleteMonitor: makeDeleteMonitor({ monitorRepository }),
    getMonitorHistory: makeGetMonitorHistory({ monitorRepository, eventRepository }),
  };

  // 3. HTTP layer
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
    skip: () => cfg.nodeEnv === 'test', // never throttle the test suite
    message: { error: 'Too many requests, please slow down.', type: 'RateLimitError' },
  });

  app.use('/api/monitors', makeMonitorRouter(useCases, writeLimiter));

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

module.exports = { createApp };
