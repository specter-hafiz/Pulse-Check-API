'use strict';

const { Monitor, STATUSES } = require('../../domain/Monitor');
const {
  MonitorAlreadyExistsError,
  MonitorNotFoundError,
  MonitorAlreadyDownError,
  MonitorAlreadyPausedError,
} = require('../../domain/errors');

/**
 * InMemoryMonitorRepository
 *
 * Owns the in-memory store AND the Node.js setTimeout handles that back
 * each active countdown. Keeping them co-located means the timer lifecycle
 * (start, reset, cancel) is always consistent with the entity state.
 *
 * The `onAlert` callback is injected at construction so the repository
 * has no direct dependency on the alert infrastructure — it only knows
 * it must call a function when a timer expires.
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

    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    this._timers = new Map();

    this._onAlert = onAlert;
  }

  // ─── Write operations ──────────────────────────────────────────────────────

  /**
   * Persist a new monitor and arm its countdown.
   *
   * @param {Monitor} monitor
   * @throws {MonitorAlreadyExistsError}
   */
  save(monitor) {
    if (this._monitors.has(monitor.id)) {
      throw new MonitorAlreadyExistsError(
        `Monitor "${monitor.id}" already exists.`
      );
    }
    this._monitors.set(monitor.id, monitor);
    this._armTimer(monitor);
  }

  /**
   * Persist an updated monitor, rescheduling its timer as needed.
   *
   * @param {Monitor} monitor
   * @throws {MonitorNotFoundError}
   */
  update(monitor) {
    if (!this._monitors.has(monitor.id)) {
      throw new MonitorNotFoundError(`Monitor "${monitor.id}" not found.`);
    }
    this._cancelTimer(monitor.id);
    this._monitors.set(monitor.id, monitor);

    if (monitor.isActive()) {
      this._armTimer(monitor);
    }
  }

  /**
   * Remove a monitor and cancel any running timer.
   *
   * @param {string} id
   * @throws {MonitorNotFoundError}
   */
  delete(id) {
    if (!this._monitors.has(id)) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    this._cancelTimer(id);
    this._monitors.delete(id);
  }

  // ─── Read operations ───────────────────────────────────────────────────────

  /**
   * @param {string} id
   * @returns {Monitor | null}
   */
  findById(id) {
    return this._monitors.get(id) ?? null;
  }

  /**
   * @returns {Monitor[]}
   */
  findAll() {
    return Array.from(this._monitors.values());
  }

  // ─── Timer management (private) ────────────────────────────────────────────

  _armTimer(monitor) {
    const timerId = setTimeout(() => {
      const current = this._monitors.get(monitor.id);
      if (!current || !current.isActive()) return;

      current.status       = STATUSES.DOWN;
      current.nextAlertAt  = null;

      this._timers.delete(monitor.id);
      this._onAlert(current);
    }, monitor.timeoutSeconds * 1000);

    this._timers.set(monitor.id, timerId);
  }

  _cancelTimer(id) {
    const timerId = this._timers.get(id);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this._timers.delete(id);
    }
  }
}

module.exports = { InMemoryMonitorRepository };
