'use strict';

const { MonitorNotFoundError } = require('../domain/errors');

/**
 * getMonitorHistory — return the chronological audit trail for a monitor.
 *
 * Validates the monitor exists first so callers get a clean 404 rather than
 * an empty list for an unknown id.
 *
 * @param {{ monitorRepository, eventRepository }} deps
 * @returns {(cmd: { id: string }) => Array<object>}
 */
function makeGetMonitorHistory({ monitorRepository, eventRepository }) {
  return function getMonitorHistory({ id }) {
    if (!monitorRepository.findById(id)) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    return eventRepository.findByMonitorId(id);
  };
}

module.exports = { makeGetMonitorHistory };
