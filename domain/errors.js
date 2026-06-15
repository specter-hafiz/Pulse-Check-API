'use strict';

/**
 * Domain-specific error types.
 *
 * Using named subclasses instead of string `.code` properties lets callers
 * use `instanceof` for clean, exhaustive error handling in use-cases and
 * controllers — no magic string comparisons.
 */

class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Attempted to register a monitor whose ID is already in use. */
class MonitorAlreadyExistsError extends DomainError {}

/** Attempted to act on a monitor that does not exist. */
class MonitorNotFoundError extends DomainError {}

/** Attempted to send a heartbeat to a monitor that has already gone down. */
class MonitorAlreadyDownError extends DomainError {}

/** Attempted to pause a monitor that is already paused. */
class MonitorAlreadyPausedError extends DomainError {}

module.exports = {
  DomainError,
  MonitorAlreadyExistsError,
  MonitorNotFoundError,
  MonitorAlreadyDownError,
  MonitorAlreadyPausedError,
};
