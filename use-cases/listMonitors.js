'use strict';

/**
 * listMonitors — return every registered monitor.
 *
 * @param {{ monitorRepository }} deps
 * @returns {() => import('../domain/Monitor').Monitor[]}
 */
function makeListMonitors({ monitorRepository }) {
  return function listMonitors() {
    return monitorRepository.findAll();
  };
}

module.exports = { makeListMonitors };
