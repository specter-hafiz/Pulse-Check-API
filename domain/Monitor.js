'use strict';

/**
 * Monitor — the core domain entity.
 *
 * A plain object with no framework deps, no I/O and no side-effects. Every
 * rule describing what a Monitor *is* and how its state may legally change
 * lives here; repositories persist it and use-cases orchestrate it, but the
 * transitions themselves are owned by the entity.
 */

const STATUSES = Object.freeze({
  ACTIVE: 'active',
  PAUSED: 'paused',
  DOWN: 'down',
});

class Monitor {
  /**
   * @param {object} props
   * @param {string}      props.id
   * @param {number}      props.timeoutSeconds
   * @param {string}      props.alertEmail
   * @param {string|null} [props.webhookUrl]
   * @param {string}      [props.status]
   * @param {string}      [props.createdAt]      - ISO timestamp
   * @param {string|null} [props.lastHeartbeat]  - ISO timestamp
   * @param {string|null} [props.nextAlertAt]    - ISO timestamp
   */
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
   * Works from any state — a heartbeat from a paused or downed device means
   * it is alive again, so the monitor un-pauses / recovers automatically.
   *
   * @param {Date} [now]
   */
  applyHeartbeat(now = new Date()) {
    this.status = STATUSES.ACTIVE;
    this.lastHeartbeat = now.toISOString();
    this.nextAlertAt = this.computeNextAlertAt(now);
    return this;
  }

  /**
   * Pause monitoring: stop the countdown so no alert can fire.
   *
   * @param {Date} [now]
   */
  pause() {
    this.status = STATUSES.PAUSED;
    this.nextAlertAt = null;
    return this;
  }

  /**
   * The timestamp at which the next alert would fire, as an ISO string.
   *
   * @param {Date} [now]
   * @returns {string}
   */
  computeNextAlertAt(now = new Date()) {
    return new Date(now.getTime() + this.timeoutSeconds * 1000).toISOString();
  }

  /**
   * Plain-object snapshot safe to send over the wire.
   *
   * @returns {object}
   */
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

module.exports = { Monitor, STATUSES };
