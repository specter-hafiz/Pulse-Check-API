'use strict';

const { InMemoryMonitorRepository } = require('../../infrastructure/store/InMemoryMonitorRepository');
const { InMemoryEventRepository } = require('../../infrastructure/store/InMemoryEventRepository');
const { makeRegisterMonitor } = require('../../use-cases/registerMonitor');
const { makeHeartbeatMonitor } = require('../../use-cases/heartbeatMonitor');
const { makePauseMonitor } = require('../../use-cases/pauseMonitor');
const { makeGetMonitorHistory } = require('../../use-cases/getMonitorHistory');
const {
  MonitorAlreadyExistsError,
  MonitorNotFoundError,
  MonitorAlreadyPausedError,
} = require('../../domain/errors');

function makeContext() {
  const monitorRepository = new InMemoryMonitorRepository({ onAlert: jest.fn() });
  const eventRepository = new InMemoryEventRepository();
  return {
    monitorRepository,
    eventRepository,
    register: makeRegisterMonitor({ monitorRepository, eventRepository }),
    heartbeat: makeHeartbeatMonitor({ monitorRepository, eventRepository }),
    pause: makePauseMonitor({ monitorRepository, eventRepository }),
    history: makeGetMonitorHistory({ monitorRepository, eventRepository }),
  };
}

const VALID = { id: 'dev-1', timeoutSeconds: 60, alertEmail: 'admin@critmon.com' };

describe('registerMonitor', () => {
  test('creates an active monitor and logs a "registered" event', () => {
    const ctx = makeContext();
    const m = ctx.register(VALID);
    expect(m.isActive()).toBe(true);
    expect(ctx.monitorRepository.findById('dev-1')).not.toBeNull();
    expect(ctx.history({ id: 'dev-1' })).toEqual([
      expect.objectContaining({ type: 'registered' }),
    ]);
    ctx.monitorRepository.close();
  });

  test('rejects a duplicate id', () => {
    const ctx = makeContext();
    ctx.register(VALID);
    expect(() => ctx.register(VALID)).toThrow(MonitorAlreadyExistsError);
    ctx.monitorRepository.close();
  });
});

describe('heartbeatMonitor', () => {
  test('resets the countdown and records a heartbeat event', () => {
    const ctx = makeContext();
    ctx.register(VALID);
    const m = ctx.heartbeat({ id: 'dev-1' });
    expect(m.lastHeartbeat).not.toBeNull();
    const types = ctx.history({ id: 'dev-1' }).map((e) => e.type);
    expect(types).toEqual(['registered', 'heartbeat']);
    ctx.monitorRepository.close();
  });

  test('un-pauses a paused monitor and logs "resumed"', () => {
    const ctx = makeContext();
    ctx.register(VALID);
    ctx.pause({ id: 'dev-1' });
    const m = ctx.heartbeat({ id: 'dev-1' });
    expect(m.isActive()).toBe(true);
    expect(ctx.history({ id: 'dev-1' }).map((e) => e.type)).toContain('resumed');
    ctx.monitorRepository.close();
  });

  test('throws 404-style error for an unknown id', () => {
    const ctx = makeContext();
    expect(() => ctx.heartbeat({ id: 'nope' })).toThrow(MonitorNotFoundError);
    ctx.monitorRepository.close();
  });
});

describe('pauseMonitor', () => {
  test('pauses an active monitor', () => {
    const ctx = makeContext();
    ctx.register(VALID);
    const m = ctx.pause({ id: 'dev-1' });
    expect(m.isPaused()).toBe(true);
    expect(m.nextAlertAt).toBeNull();
    ctx.monitorRepository.close();
  });

  test('rejects pausing an already-paused monitor', () => {
    const ctx = makeContext();
    ctx.register(VALID);
    ctx.pause({ id: 'dev-1' });
    expect(() => ctx.pause({ id: 'dev-1' })).toThrow(MonitorAlreadyPausedError);
    ctx.monitorRepository.close();
  });
});
