'use strict';

const { MonitorNotFoundError } = require('../domain/errors');

/**
 * deleteMonitor — remove a monitor and cancel its countdown.
 *
 * @param {{ monitorRepository }} deps
 * @returns {(cmd: { id: string }) => import('../domain/Monitor').Monitor}
 */
function makeDeleteMonitor({ monitorRepository }) {
  return function deleteMonitor({ id }) {
    const monitor = monitorRepository.findById(id);
    if (!monitor) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    monitorRepository.delete(id);
    return monitor;
  };
}

module.exports = { makeDeleteMonitor };
