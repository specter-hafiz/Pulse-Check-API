'use strict';

const { Monitor, STATUSES } = require('../../domain/Monitor');
const { MonitorAlreadyExistsError, MonitorNotFoundError } = require('../../domain/errors');
const { TimerRegistry } = require('../scheduler/TimerRegistry');

/**
 * InMemoryMonitorRepository
 *
 * Volatile store (a Map) plus the live countdown timers. Fast and dependency
 * free — ideal for tests and local experiments — but state is lost on restart.
 * The SQLite implementation shares the exact same interface, so the rest of
 * the app cannot tell which one it is talking to.
 *
 * The `onAlert` callback is injected at construction, so the repository has no
 * dependency on the alert infrastructure — it only knows it must invoke a
 * function when a countdown reaches zero.
 *
 * @implements {IMonitorRepository}
 */
class InMemoryMonitorRepository {
  /**
   * @param {{ onAlert: (monitor: Monitor) => void }} deps
   */
  constructor({ onAlert }) {
    /** @type {Map<string, Monitor>} */
    this._monitors = new Map();
    this._timers = new TimerRegistry();
    this._onAlert = onAlert;
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /** @param {Monitor} monitor @throws {MonitorAlreadyExistsError} */
  save(monitor) {
    if (this._monitors.has(monitor.id)) {
      throw new MonitorAlreadyExistsError(`Monitor "${monitor.id}" already exists.`);
    }
    this._monitors.set(monitor.id, monitor);
    if (monitor.isActive()) this._armTimer(monitor);
  }

  /** @param {Monitor} monitor @throws {MonitorNotFoundError} */
  update(monitor) {
    if (!this._monitors.has(monitor.id)) {
      throw new MonitorNotFoundError(`Monitor "${monitor.id}" not found.`);
    }
    this._timers.cancel(monitor.id);
    this._monitors.set(monitor.id, monitor);
    if (monitor.isActive()) this._armTimer(monitor);
  }

  /** @param {string} id @throws {MonitorNotFoundError} */
  delete(id) {
    if (!this._monitors.has(id)) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    this._timers.cancel(id);
    this._monitors.delete(id);
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  /** @param {string} id @returns {Monitor | null} */
  findById(id) {
    return this._monitors.get(id) ?? null;
  }

  /** @returns {Monitor[]} */
  findAll() {
    return Array.from(this._monitors.values());
  }

  /** Release all timers (graceful shutdown / test teardown). */
  close() {
    this._timers.clearAll();
  }

  // ── Timer management ────────────────────────────────────────────────────────

  _armTimer(monitor) {
    const ms = this._remainingMs(monitor);
    this._timers.arm(monitor.id, ms, () => this._fire(monitor.id));
  }

  _remainingMs(monitor) {
    if (!monitor.nextAlertAt) return monitor.timeoutSeconds * 1000;
    return Math.max(0, new Date(monitor.nextAlertAt).getTime() - Date.now());
  }

  _fire(id) {
    const current = this._monitors.get(id);
    if (!current || !current.isActive()) return;
    current.status = STATUSES.DOWN;
    current.nextAlertAt = null;
    this._onAlert(current);
  }
}

module.exports = { InMemoryMonitorRepository };
