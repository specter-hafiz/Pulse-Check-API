'use strict';

const { MonitorNotFoundError, MonitorAlreadyPausedError } = require('../domain/errors');

/**
 * pauseMonitor — stop a monitor's countdown so no alert can fire.
 * Send a heartbeat to resume (see heartbeatMonitor).
 *
 * @param {{ monitorRepository, eventRepository }} deps
 * @returns {(cmd: { id: string }) => import('../domain/Monitor').Monitor}
 */
function makePauseMonitor({ monitorRepository, eventRepository }) {
  return function pauseMonitor({ id }) {
    const monitor = monitorRepository.findById(id);
    if (!monitor) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }
    if (monitor.isPaused()) {
      throw new MonitorAlreadyPausedError(`Monitor "${id}" is already paused.`);
    }

    monitor.pause();
    monitorRepository.update(monitor); // cancels the timer

    eventRepository.record({
      monitorId: monitor.id,
      type: 'paused',
      message: 'Monitoring paused; alerts suppressed until next heartbeat.',
    });

    return monitor;
  };
}

module.exports = { makePauseMonitor };
