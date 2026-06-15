'use strict';

/**
 * Monitor — the core domain entity.
 *
 * This is a plain value object: no framework deps, no I/O, no side-effects.
 * All business rules that describe what a Monitor *is* live here.
 */

const STATUSES = Object.freeze({
  ACTIVE: 'active',
  PAUSED: 'paused',
  DOWN:   'down',
});

class Monitor {
  /**
   * @param {object} props
   * @param {string}      props.id
   * @param {number}      props.timeoutSeconds
   * @param {string}      props.alertEmail
   * @param {string|null} [props.webhookUrl]
   * @param {string}      [props.status]
   * @param {string}      [props.createdAt]   - ISO timestamp
   * @param {string|null} [props.lastHeartbeat]
   * @param {string|null} [props.nextAlertAt]
   */
  constructor({
    id,
    timeoutSeconds,
    alertEmail,
    webhookUrl     = null,
    status         = STATUSES.ACTIVE,
    createdAt      = new Date().toISOString(),
    lastHeartbeat  = null,
    nextAlertAt    = null,
  }) {
    this.id             = id;
    this.timeoutSeconds = timeoutSeconds;
    this.alertEmail     = alertEmail;
    this.webhookUrl     = webhookUrl;
    this.status         = status;
    this.createdAt      = createdAt;
    this.lastHeartbeat  = lastHeartbeat;
    this.nextAlertAt    = nextAlertAt;
  }

  /** Whether the monitor is currently ticking. */
  isActive()  { return this.status === STATUSES.ACTIVE; }

  /** Whether the monitor has been manually paused. */
  isPaused()  { return this.status === STATUSES.PAUSED; }

  /** Whether the monitor has already triggered an alert. */
  isDown()    { return this.status === STATUSES.DOWN; }

  /**
   * Return the timestamp at which the next alert would fire
   * given the current moment, as an ISO string.
   *
   * @param {Date} [now]
   * @returns {string}
   */
  computeNextAlertAt(now = new Date()) {
    return new Date(now.getTime() + this.timeoutSeconds * 1000).toISOString();
  }

  /**
   * Produce a plain-object snapshot safe to send over the wire.
   * Intentionally omits internal scheduler state.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      id:             this.id,
      timeoutSeconds: this.timeoutSeconds,
      alertEmail:     this.alertEmail,
      webhookUrl:     this.webhookUrl,
      status:         this.status,
      createdAt:      this.createdAt,
      lastHeartbeat:  this.lastHeartbeat,
      nextAlertAt:    this.nextAlertAt,
    };
  }
}

module.exports = { Monitor, STATUSES };
