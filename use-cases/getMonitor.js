'use strict';

const { MonitorNotFoundError } = require('../domain/errors');

/**
 * getMonitor — fetch a single monitor by id.
 *
 * @param {{ monitorRepository }} deps
 * @returns {(cmd: { id: string }) => import('../domain/Monitor').Monitor}
 */
function makeGetMonitor({ monitorRepository }) {
  return function getMonitor({ id }) {
    const monitor = monitorRepository.findById(id);
    if (!monitor) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    return monitor;
  };
}

module.exports = { makeGetMonitor };
