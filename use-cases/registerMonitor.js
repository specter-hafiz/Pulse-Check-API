'use strict';

const { Monitor } = require('../domain/Monitor');

/**
 * registerMonitor — create a monitor, persist it, arm its countdown, and
 * record the lifecycle event.
 *
 * @param {{ monitorRepository, eventRepository }} deps
 * @returns {(cmd: object) => Monitor}
 */
function makeRegisterMonitor({ monitorRepository, eventRepository }) {
  return function registerMonitor({ id, timeoutSeconds, alertEmail, webhookUrl = null }) {
    const now = new Date();
    const monitor = new Monitor({
      id,
      timeoutSeconds,
      alertEmail,
      webhookUrl,
      createdAt: now.toISOString(),
      nextAlertAt: new Date(now.getTime() + timeoutSeconds * 1000).toISOString(),
    });

    monitorRepository.save(monitor); // throws MonitorAlreadyExistsError if taken
    eventRepository.record({
      monitorId: monitor.id,
      type: 'registered',
      message: `Monitor created with a ${timeoutSeconds}s timeout.`,
    });

    return monitor;
  };
}

module.exports = { makeRegisterMonitor };
