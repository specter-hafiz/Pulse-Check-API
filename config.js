'use strict';

/**
 * Configuration — the single place that reads process.env.
 *
 * Everything else takes its settings from this object, so the rest of the
 * code stays free of environment lookups.
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

  // Storage backend: 'sqlite' (persistent, default) or 'memory' (volatile).
  store: process.env.STORE ?? 'sqlite',

  // Absolute path to the SQLite database file (created on demand).
  databaseFile:
    process.env.DATABASE_FILE ?? path.join(__dirname, 'data', 'pulse-check.db'),

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000), // 1 minute
    max: toInt(process.env.RATE_LIMIT_MAX, 100), // requests per window per IP
  },
};

module.exports = { config };
