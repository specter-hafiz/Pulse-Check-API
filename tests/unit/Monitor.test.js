'use strict';

const { Monitor, STATUSES } = require('../../domain/Monitor');

describe('Monitor entity', () => {
  const base = { id: 'dev-1', timeoutSeconds: 60, alertEmail: 'a@b.com' };

  test('defaults to active with no heartbeat', () => {
    const m = new Monitor(base);
    expect(m.isActive()).toBe(true);
    expect(m.isPaused()).toBe(false);
    expect(m.isDown()).toBe(false);
    expect(m.lastHeartbeat).toBeNull();
  });

  test('computeNextAlertAt adds the timeout to now', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const m = new Monitor(base);
    expect(m.computeNextAlertAt(now)).toBe('2026-01-01T00:01:00.000Z');
  });

  test('applyHeartbeat activates, stamps lastHeartbeat and recomputes nextAlertAt', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const m = new Monitor({ ...base, status: STATUSES.PAUSED });
    m.applyHeartbeat(now);
    expect(m.isActive()).toBe(true);
    expect(m.lastHeartbeat).toBe('2026-01-01T00:00:00.000Z');
    expect(m.nextAlertAt).toBe('2026-01-01T00:01:00.000Z');
  });

  test('applyHeartbeat recovers a downed monitor', () => {
    const m = new Monitor({ ...base, status: STATUSES.DOWN });
    m.applyHeartbeat();
    expect(m.isActive()).toBe(true);
  });

  test('pause stops the countdown and clears nextAlertAt', () => {
    const m = new Monitor({ ...base, nextAlertAt: '2026-01-01T00:01:00.000Z' });
    m.pause();
    expect(m.isPaused()).toBe(true);
    expect(m.nextAlertAt).toBeNull();
  });

  test('toJSON exposes the wire-safe shape', () => {
    const m = new Monitor(base);
    expect(m.toJSON()).toEqual({
      id: 'dev-1',
      timeoutSeconds: 60,
      alertEmail: 'a@b.com',
      webhookUrl: null,
      status: 'active',
      createdAt: expect.any(String),
      lastHeartbeat: null,
      nextAlertAt: null,
    });
  });
});
