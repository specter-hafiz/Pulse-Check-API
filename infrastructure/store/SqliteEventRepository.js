'use strict';

/**
 * SqliteEventRepository
 *
 * Persists the monitor audit trail to the `events` table. Rows cascade-delete
 * with their monitor (see the foreign key in connection.js), so history never
 * outlives the monitor it describes.
 *
 * @implements {IEventRepository}
 */
class SqliteEventRepository {
  /**
   * @param {{ db: import('node:sqlite').DatabaseSync }} deps
   */
  constructor({ db }) {
    this._insert = db.prepare(
      'INSERT INTO events (monitor_id, type, message, created_at) VALUES (?, ?, ?, ?)'
    );
    this._findByMonitorId = db.prepare(
      'SELECT type, message, created_at FROM events WHERE monitor_id = ? ORDER BY id ASC'
    );
  }

  /**
   * @param {{ monitorId: string, type: string, message?: string }} event
   */
  record({ monitorId, type, message = '' }) {
    this._insert.run(monitorId, type, message, new Date().toISOString());
  }

  /**
   * @param {string} monitorId
   * @returns {Array<{type: string, message: string, createdAt: string}>}
   */
  findByMonitorId(monitorId) {
    return this._findByMonitorId.all(monitorId).map((row) => ({
      type: row.type,
      message: row.message,
      createdAt: row.created_at,
    }));
  }
}

module.exports = { SqliteEventRepository };
