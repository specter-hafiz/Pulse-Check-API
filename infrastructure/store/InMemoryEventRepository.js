'use strict';

/**
 * InMemoryEventRepository
 *
 * Append-only audit log of monitor lifecycle events, held in a Map keyed by
 * monitor id. Mirrors the SQLite implementation's interface.
 *
 * @implements {IEventRepository}
 */
class InMemoryEventRepository {
  constructor() {
    /** @type {Map<string, Array<{type: string, message: string, createdAt: string}>>} */
    this._events = new Map();
  }

  /**
   * @param {{ monitorId: string, type: string, message?: string }} event
   */
  record({ monitorId, type, message = '' }) {
    const list = this._events.get(monitorId) ?? [];
    list.push({ type, message, createdAt: new Date().toISOString() });
    this._events.set(monitorId, list);
  }

  /**
   * @param {string} monitorId
   * @returns {Array<{type: string, message: string, createdAt: string}>}
   */
  findByMonitorId(monitorId) {
    return [...(this._events.get(monitorId) ?? [])];
  }
}

module.exports = { InMemoryEventRepository };
