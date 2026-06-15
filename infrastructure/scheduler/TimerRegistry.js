'use strict';

/**
 * TimerRegistry — a thin wrapper around setTimeout keyed by monitor id.
 *
 * Both the in-memory and SQLite repositories use this to manage the live
 * countdowns. Timers are inherently process-local state (they cannot be
 * persisted), so keeping the bookkeeping in one place guarantees the
 * arm/reset/cancel lifecycle stays consistent and that we can tear every
 * timer down cleanly on shutdown (and between tests, so the event loop
 * never hangs).
 */
class TimerRegistry {
  constructor() {
    /** @type {Map<string, NodeJS.Timeout>} */
    this._timers = new Map();
  }

  /**
   * Arm (or re-arm) a countdown for `id`. Any existing timer for the same id
   * is cancelled first, so this doubles as "reset".
   *
   * @param {string} id
   * @param {number} ms      - delay in milliseconds
   * @param {() => void} onExpire
   */
  arm(id, ms, onExpire) {
    this.cancel(id);
    const handle = setTimeout(() => {
      this._timers.delete(id);
      onExpire();
    }, ms);

    // Don't let a pending timer keep the process alive on its own.
    if (typeof handle.unref === 'function') handle.unref();

    this._timers.set(id, handle);
  }

  /** Cancel the timer for `id`, if any. */
  cancel(id) {
    const handle = this._timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      this._timers.delete(id);
    }
  }

  /** Cancel every timer — used on graceful shutdown and in test teardown. */
  clearAll() {
    for (const handle of this._timers.values()) clearTimeout(handle);
    this._timers.clear();
  }

  /** @returns {boolean} */
  has(id) {
    return this._timers.has(id);
  }
}

module.exports = { TimerRegistry };
