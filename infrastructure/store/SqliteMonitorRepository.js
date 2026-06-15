'use strict';

const { Monitor, STATUSES } = require('../../domain/Monitor');
const { MonitorAlreadyExistsError, MonitorNotFoundError } = require('../../domain/errors');
const { TimerRegistry } = require('../scheduler/TimerRegistry');

/**
 * SqliteMonitorRepository
 *
 * Drop-in replacement for InMemoryMonitorRepository backed by SQLite, so the
 * monitor *state* survives a restart. Timers themselves cannot be persisted,
 * so on construction we **rehydrate**: every still-active monitor has its
 * countdown re-armed for the time remaining, and any monitor whose deadline
 * already passed while the process was down fires its alert immediately.
 * That recovery behaviour is the whole point of adding persistence.
 *
 * @implements {IMonitorRepository}
 */
class SqliteMonitorRepository {
  /**
   * @param {{ db: import('node:sqlite').DatabaseSync, onAlert: (m: Monitor) => void }} deps
   */
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

  // ── Writes ────────────────────────────────────────────────────────────────

  /** @param {Monitor} monitor @throws {MonitorAlreadyExistsError} */
  save(monitor) {
    if (this._exists(monitor.id)) {
      throw new MonitorAlreadyExistsError(`Monitor "${monitor.id}" already exists.`);
    }
    const r = this._toRow(monitor);
    this._stmts.insert.run(
      r.id, r.timeout_seconds, r.alert_email, r.webhook_url,
      r.status, r.created_at, r.last_heartbeat, r.next_alert_at
    );
    if (monitor.isActive()) this._armTimer(monitor);
  }

  /** @param {Monitor} monitor @throws {MonitorNotFoundError} */
  update(monitor) {
    if (!this._exists(monitor.id)) {
      throw new MonitorNotFoundError(`Monitor "${monitor.id}" not found.`);
    }
    this._timers.cancel(monitor.id);
    const r = this._toRow(monitor);
    this._stmts.update.run(
      r.timeout_seconds, r.alert_email, r.webhook_url, r.status,
      r.created_at, r.last_heartbeat, r.next_alert_at, r.id
    );
    if (monitor.isActive()) this._armTimer(monitor);
  }

  /** @param {string} id @throws {MonitorNotFoundError} */
  delete(id) {
    if (!this._exists(id)) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    this._timers.cancel(id);
    this._stmts.delete.run(id); // events cascade via FK
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  /** @param {string} id @returns {Monitor | null} */
  findById(id) {
    const row = this._stmts.findById.get(id);
    return row ? this._toMonitor(row) : null;
  }

  /** @returns {Monitor[]} */
  findAll() {
    return this._stmts.findAll.all().map((row) => this._toMonitor(row));
  }

  /** Release timers; the shared DB handle is closed by the composition root. */
  close() {
    this._timers.clearAll();
  }

  // ── Rehydration & timers ────────────────────────────────────────────────────

  _rehydrate() {
    for (const monitor of this.findAll()) {
      if (!monitor.isActive()) continue;
      const ms = this._remainingMs(monitor);
      if (ms <= 0) {
        // Deadline lapsed while the process was offline → fire now.
        this._fire(monitor.id);
      } else {
        this._timers.arm(monitor.id, ms, () => this._fire(monitor.id));
      }
    }
  }

  _armTimer(monitor) {
    const ms = this._remainingMs(monitor);
    this._timers.arm(monitor.id, ms, () => this._fire(monitor.id));
  }

  _remainingMs(monitor) {
    if (!monitor.nextAlertAt) return monitor.timeoutSeconds * 1000;
    return Math.max(0, new Date(monitor.nextAlertAt).getTime() - Date.now());
  }

  _fire(id) {
    const monitor = this.findById(id);
    if (!monitor || !monitor.isActive()) return;
    monitor.status = STATUSES.DOWN;
    monitor.nextAlertAt = null;
    const r = this._toRow(monitor);
    this._stmts.update.run(
      r.timeout_seconds, r.alert_email, r.webhook_url, r.status,
      r.created_at, r.last_heartbeat, r.next_alert_at, r.id
    );
    this._onAlert(monitor);
  }

  // ── Row ↔ entity mapping ────────────────────────────────────────────────────

  _exists(id) {
    return this._stmts.findById.get(id) !== undefined;
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

module.exports = { SqliteMonitorRepository };
