'use strict';

/**
 * server.js — entry point.
 *
 * Deliberately thin: create the app, bind a port, and tear everything down
 * cleanly on OS signals. No business logic lives here.
 */

const { createApp } = require('./app');
const { config } = require('./config');

const { app, close } = createApp();

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

module.exports = app; // exported for completeness
