'use strict';

/**
 * store.js — persistence + the live countdown timers.
 *
 * Two interchangeable backends live here, each providing the same methods so
 * the rest of the app can't tell them apart:
 *
 *   • In-memory  — a Map. Fast, zero-setup, but state dies on restart.
 *   • SQLite     — survives restarts and re-arms timers on boot (default).
 *
 * A countdown is a live setTimeout, which can't be saved to a database, so the
 * SQLite store persists monitor *state* and rebuilds the timers when it loads.
 */

const { Monitor, MonitorAlreadyExistsError, MonitorNotFoundError } = require('./monitor');

// ── Timer registry ───────────────────────────────────────────────────────────
// A thin wrapper around setTimeout, keyed by monitor id, so arming, resetting
// and cancelling countdowns stays consistent and tearable-down on shutdown.

class TimerRegistry {
  constructor() {
    this._timers = new Map(); // id -> timeout handle
  }

  /** Arm (or re-arm) the countdown for `id`. Cancels any existing one first. */
  arm(id, ms, onExpire) {
    this.cancel(id);
    const handle = setTimeout(() => {
      this._timers.delete(id);
      onExpire();
    }, ms);
    if (typeof handle.unref === 'function') handle.unref(); // don't keep the process alive
    this._timers.set(id, handle);
  }

  cancel(id) {
    const handle = this._timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      this._timers.delete(id);
    }
  }

  clearAll() {
    for (const handle of this._timers.values()) clearTimeout(handle);
    this._timers.clear();
  }
}

// Shared timer helpers used by both monitor repositories.
function remainingMs(monitor) {
  if (!monitor.nextAlertAt) return monitor.timeoutSeconds * 1000;
  return Math.max(0, new Date(monitor.nextAlertAt).getTime() - Date.now());
}

// ── In-memory backend ────────────────────────────────────────────────────────

class InMemoryMonitorRepository {
  constructor({ onAlert }) {
    this._monitors = new Map();
    this._timers = new TimerRegistry();
    this._onAlert = onAlert;
  }

  save(monitor) {
    if (this._monitors.has(monitor.id)) {
      throw new MonitorAlreadyExistsError(`Monitor "${monitor.id}" already exists.`);
    }
    this._monitors.set(monitor.id, monitor);
    if (monitor.isActive()) this._arm(monitor);
  }

  update(monitor) {
    if (!this._monitors.has(monitor.id)) {
      throw new MonitorNotFoundError(`Monitor "${monitor.id}" not found.`);
    }
    this._timers.cancel(monitor.id);
    this._monitors.set(monitor.id, monitor);
    if (monitor.isActive()) this._arm(monitor);
  }

  delete(id) {
    if (!this._monitors.has(id)) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    this._timers.cancel(id);
    this._monitors.delete(id);
  }

  findById(id) { return this._monitors.get(id) ?? null; }
  findAll() { return Array.from(this._monitors.values()); }
  close() { this._timers.clearAll(); }

  _arm(monitor) {
    this._timers.arm(monitor.id, remainingMs(monitor), () => this._fire(monitor.id));
  }

  _fire(id) {
    const monitor = this._monitors.get(id);
    if (!monitor || !monitor.isActive()) return;
    monitor.status = 'down';
    monitor.nextAlertAt = null;
    this._onAlert(monitor);
  }
}

class InMemoryEventRepository {
  constructor() {
    this._events = new Map(); // monitorId -> events[]
  }

  record({ monitorId, type, message = '' }) {
    const list = this._events.get(monitorId) ?? [];
    list.push({ type, message, createdAt: new Date().toISOString() });
    this._events.set(monitorId, list);
  }

  findByMonitorId(monitorId) {
    return [...(this._events.get(monitorId) ?? [])];
  }
}

// ── SQLite backend ───────────────────────────────────────────────────────────
// node:sqlite is a stable-enough built-in but emits one ExperimentalWarning on
// first use; we filter only that warning so the console stays clean.

function suppressSqliteWarning() {
  const defaultListeners = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.name === 'ExperimentalWarning' && /SQLite/i.test(warning.message)) return;
    for (const listener of defaultListeners) listener(warning);
  });
}

/** Open (creating if needed) the SQLite database and apply the schema. */
function openDatabase(databaseFile) {
  suppressSqliteWarning();
  const fs = require('node:fs');
  const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');

  if (databaseFile !== ':memory:') {
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  }

  const db = new DatabaseSync(databaseFile);
  db.exec('PRAGMA journal_mode = WAL;'); // better read/write concurrency
  db.exec('PRAGMA foreign_keys = ON;'); //  enforce events -> monitors cascade
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

class SqliteMonitorRepository {
  constructor({ db, onAlert }) {
    this._db = db;
    this._onAlert = onAlert;
    this._timers = new TimerRegistry();
    this._stmts = {
      insert: db.prepare(
        `INSERT INTO monitors
           (id, timeout_seconds, alert_email, webhook_url, status, created_at, last_heartbeat, next_alert_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ),
      update: db.prepare(
        `UPDATE monitors SET
           timeout_seconds = ?, alert_email = ?, webhook_url = ?, status = ?,
           created_at = ?, last_heartbeat = ?, next_alert_at = ?
         WHERE id = ?`
      ),
      delete: db.prepare('DELETE FROM monitors WHERE id = ?'),
      findById: db.prepare('SELECT * FROM monitors WHERE id = ?'),
      findAll: db.prepare('SELECT * FROM monitors ORDER BY created_at ASC'),
    };
    this._rehydrate();
  }

  save(monitor) {
    if (this._exists(monitor.id)) {
      throw new MonitorAlreadyExistsError(`Monitor "${monitor.id}" already exists.`);
    }
    const r = this._toRow(monitor);
    this._stmts.insert.run(
      r.id, r.timeout_seconds, r.alert_email, r.webhook_url,
      r.status, r.created_at, r.last_heartbeat, r.next_alert_at
    );
    if (monitor.isActive()) this._arm(monitor);
  }

  update(monitor) {
    if (!this._exists(monitor.id)) {
      throw new MonitorNotFoundError(`Monitor "${monitor.id}" not found.`);
    }
    this._timers.cancel(monitor.id);
    this._writeRow(monitor);
    if (monitor.isActive()) this._arm(monitor);
  }

  delete(id) {
    if (!this._exists(id)) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    this._timers.cancel(id);
    this._stmts.delete.run(id); // events cascade via FK
  }

  findById(id) {
    const row = this._stmts.findById.get(id);
    return row ? this._toMonitor(row) : null;
  }

  findAll() {
    return this._stmts.findAll.all().map((row) => this._toMonitor(row));
  }

  close() { this._timers.clearAll(); }

  // On boot, re-arm every still-active countdown for the time remaining; any
  // deadline that lapsed while the process was down fires its alert now.
  _rehydrate() {
    for (const monitor of this.findAll()) {
      if (!monitor.isActive()) continue;
      const ms = remainingMs(monitor);
      if (ms <= 0) this._fire(monitor.id);
      else this._timers.arm(monitor.id, ms, () => this._fire(monitor.id));
    }
  }

  _arm(monitor) {
    this._timers.arm(monitor.id, remainingMs(monitor), () => this._fire(monitor.id));
  }

  _fire(id) {
    const monitor = this.findById(id);
    if (!monitor || !monitor.isActive()) return;
    monitor.status = 'down';
    monitor.nextAlertAt = null;
    this._writeRow(monitor);
    this._onAlert(monitor);
  }

  _exists(id) { return this._stmts.findById.get(id) !== undefined; }

  _writeRow(monitor) {
    const r = this._toRow(monitor);
    this._stmts.update.run(
      r.timeout_seconds, r.alert_email, r.webhook_url, r.status,
      r.created_at, r.last_heartbeat, r.next_alert_at, r.id
    );
  }

  _toRow(m) {
    return {
      id: m.id,
      timeout_seconds: m.timeoutSeconds,
      alert_email: m.alertEmail,
      webhook_url: m.webhookUrl,
      status: m.status,
      created_at: m.createdAt,
      last_heartbeat: m.lastHeartbeat,
      next_alert_at: m.nextAlertAt,
    };
  }

  _toMonitor(row) {
    return new Monitor({
      id: row.id,
      timeoutSeconds: row.timeout_seconds,
      alertEmail: row.alert_email,
      webhookUrl: row.webhook_url ?? null,
      status: row.status,
      createdAt: row.created_at,
      lastHeartbeat: row.last_heartbeat ?? null,
      nextAlertAt: row.next_alert_at ?? null,
    });
  }
}

class SqliteEventRepository {
  constructor({ db }) {
    this._insert = db.prepare(
      'INSERT INTO events (monitor_id, type, message, created_at) VALUES (?, ?, ?, ?)'
    );
    this._findByMonitorId = db.prepare(
      'SELECT type, message, created_at FROM events WHERE monitor_id = ? ORDER BY id ASC'
    );
  }

  record({ monitorId, type, message = '' }) {
    this._insert.run(monitorId, type, message, new Date().toISOString());
  }

  findByMonitorId(monitorId) {
    return this._findByMonitorId.all(monitorId).map((row) => ({
      type: row.type,
      message: row.message,
      createdAt: row.created_at,
    }));
  }
}

module.exports = {
  openDatabase,
  InMemoryMonitorRepository,
  InMemoryEventRepository,
  SqliteMonitorRepository,
  SqliteEventRepository,
};
