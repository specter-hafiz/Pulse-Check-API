'use strict';

const { MonitorNotFoundError } = require('../domain/errors');

/**
 * heartbeatMonitor — reset a monitor's countdown.
 *
 * A heartbeat always means "the device is alive", so it also un-pauses a
 * paused monitor and recovers a downed one. The emitted event type reflects
 * which transition happened, giving the audit trail meaningful semantics.
 *
 * @param {{ monitorRepository, eventRepository }} deps
 * @returns {(cmd: { id: string }) => import('../domain/Monitor').Monitor}
 */
function makeHeartbeatMonitor({ monitorRepository, eventRepository }) {
  return function heartbeatMonitor({ id }) {
    const monitor = monitorRepository.findById(id);
    if (!monitor) {
      throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
    }

    const wasPaused = monitor.isPaused();
    const wasDown = monitor.isDown();

    monitor.applyHeartbeat(new Date());
    monitorRepository.update(monitor); // re-arms the timer

    const type = wasDown ? 'recovered' : wasPaused ? 'resumed' : 'heartbeat';
    eventRepository.record({
      monitorId: monitor.id,
      type,
      message: `Countdown reset to ${monitor.timeoutSeconds}s.`,
    });

    return monitor;
  };
}

module.exports = { makeHeartbeatMonitor };
