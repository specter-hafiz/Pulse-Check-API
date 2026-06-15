'use strict';

/**
 * config — single source of truth for environment-driven settings.
 *
 * Reading process.env in exactly one place keeps the rest of the codebase
 * pure and testable: nothing else reaches into the environment directly.
 */

const path = require('node:path');

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

const config = {
  nodeEnv,
  port: toInt(process.env.PORT, 3000),

  /**
   * Storage backend: 'sqlite' (persistent, default) or 'memory' (volatile).
   * Tests run on 'memory' for isolation and speed.
   */
  store: process.env.STORE ?? (nodeEnv === 'test' ? 'memory' : 'sqlite'),

  /** Absolute path to the SQLite database file. */
  databaseFile:
    process.env.DATABASE_FILE ?? path.join(__dirname, '..', 'data', 'pulse-check.db'),

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000), // 1 minute
    max: toInt(process.env.RATE_LIMIT_MAX, 100), // requests per window per IP
  },
};

module.exports = { config };
