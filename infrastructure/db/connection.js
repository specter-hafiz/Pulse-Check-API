'use strict';

require('./suppressSqliteWarning');

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

/**
 * Open (and, if necessary, create) the SQLite database, applying the schema.
 *
 * Pass ':memory:' as the file to get an ephemeral database — handy for tests.
 * For a file-backed database the parent directory is created on demand so a
 * fresh clone "just works" with no manual setup.
 *
 * @param {string} databaseFile - absolute path or ':memory:'
 * @returns {import('node:sqlite').DatabaseSync}
 */
function openDatabase(databaseFile) {
  if (databaseFile !== ':memory:') {
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  }

  const db = new DatabaseSync(databaseFile);

  // Pragmas: WAL gives better read/write concurrency; foreign_keys enforces
  // the events → monitors relationship (cascade delete on monitor removal).
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id              TEXT PRIMARY KEY,
      timeout_seconds INTEGER NOT NULL,
      alert_email     TEXT NOT NULL,
      webhook_url     TEXT,
      status          TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      last_heartbeat  TEXT,
      next_alert_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id TEXT NOT NULL,
      type       TEXT NOT NULL,
      message    TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_monitor_id ON events(monitor_id);
  `);

  return db;
}

module.exports = { openDatabase };
