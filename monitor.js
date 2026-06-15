'use strict';

/**
 * monitor.js — the heart of the app.
 *
 * Contains three things, in order:
 *   1. The error types the app can throw.
 *   2. The Monitor entity (what a monitor IS and how its state changes).
 *   3. The monitor actions (register, heartbeat, pause, …) that orchestrate
 *      the entity together with the storage + alert layers.
 */

// ── 1. Errors ────────────────────────────────────────────────────────────────
// Named subclasses let the HTTP layer map each to a status code with
// `instanceof`, instead of comparing magic strings.

class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
class MonitorAlreadyExistsError extends DomainError {} // 409
class MonitorNotFoundError extends DomainError {} //       404
class MonitorAlreadyPausedError extends DomainError {} //  409

// ── 2. The Monitor entity ────────────────────────────────────────────────────

const STATUSES = Object.freeze({
  ACTIVE: 'active',
  PAUSED: 'paused',
  DOWN: 'down',
});

class Monitor {
  constructor({
    id,
    timeoutSeconds,
    alertEmail,
    webhookUrl = null,
    status = STATUSES.ACTIVE,
    createdAt = new Date().toISOString(),
    lastHeartbeat = null,
    nextAlertAt = null,
  }) {
    this.id = id;
    this.timeoutSeconds = timeoutSeconds;
    this.alertEmail = alertEmail;
    this.webhookUrl = webhookUrl;
    this.status = status;
    this.createdAt = createdAt;
    this.lastHeartbeat = lastHeartbeat;
    this.nextAlertAt = nextAlertAt;
  }

  isActive() { return this.status === STATUSES.ACTIVE; }
  isPaused() { return this.status === STATUSES.PAUSED; }
  isDown() { return this.status === STATUSES.DOWN; }

  /**
   * Apply a heartbeat: (re)activate the monitor and restart the countdown.
   * Works from any state — a heartbeat from a paused or downed device means it
   * is alive again, so it un-pauses / recovers automatically.
   */
  applyHeartbeat(now = new Date()) {
    this.status = STATUSES.ACTIVE;
    this.lastHeartbeat = now.toISOString();
    this.nextAlertAt = new Date(now.getTime() + this.timeoutSeconds * 1000).toISOString();
    return this;
  }

  /** Pause monitoring: stop the countdown so no alert can fire. */
  pause() {
    this.status = STATUSES.PAUSED;
    this.nextAlertAt = null;
    return this;
  }

  /** Plain-object snapshot safe to send over the wire. */
  toJSON() {
    return {
      id: this.id,
      timeoutSeconds: this.timeoutSeconds,
      alertEmail: this.alertEmail,
      webhookUrl: this.webhookUrl,
      status: this.status,
      createdAt: this.createdAt,
      lastHeartbeat: this.lastHeartbeat,
      nextAlertAt: this.nextAlertAt,
    };
  }
}

// ── 3. Monitor actions ───────────────────────────────────────────────────────
// Given the two repositories, this returns every action the API can perform.
// Each action is a small, framework-free function — easy to read in isolation.

function makeMonitorService({ monitorRepository, eventRepository }) {
  return {
    /** Create a monitor, persist it, arm its countdown, log the event. */
    registerMonitor({ id, timeoutSeconds, alertEmail, webhookUrl = null }) {
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
    },

    /** Reset the countdown. Also un-pauses / recovers the device. */
    heartbeatMonitor({ id }) {
      const monitor = monitorRepository.findById(id);
      if (!monitor) throw new MonitorNotFoundError(`Monitor "${id}" not found.`);

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
    },

    /** Stop the countdown so no alert can fire. Heartbeat to resume. */
    pauseMonitor({ id }) {
      const monitor = monitorRepository.findById(id);
      if (!monitor) throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
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
    },

    /** Fetch a single monitor by id. */
    getMonitor({ id }) {
      const monitor = monitorRepository.findById(id);
      if (!monitor) throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
      return monitor;
    },

    /** Return every registered monitor. */
    listMonitors() {
      return monitorRepository.findAll();
    },

    /** Remove a monitor and cancel its countdown. */
    deleteMonitor({ id }) {
      const monitor = monitorRepository.findById(id);
      if (!monitor) throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
      monitorRepository.delete(id);
      return monitor;
    },

    /** Return the chronological audit trail for a monitor. */
    getMonitorHistory({ id }) {
      if (!monitorRepository.findById(id)) {
        throw new MonitorNotFoundError(`Monitor "${id}" not found.`);
      }
      return eventRepository.findByMonitorId(id);
    },
  };
}

module.exports = {
  Monitor,
  STATUSES,
  makeMonitorService,
  DomainError,
  MonitorAlreadyExistsError,
  MonitorNotFoundError,
  MonitorAlreadyPausedError,
};
