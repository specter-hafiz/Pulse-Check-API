'use strict';

const { Monitor, STATUSES } = require('../../domain/Monitor');
const { InMemoryMonitorRepository } = require('../../infrastructure/store/InMemoryMonitorRepository');

function makeMonitor(overrides = {}) {
  const now = Date.now();
  return new Monitor({
    id: 'dev-1',
    timeoutSeconds: 60,
    alertEmail: 'a@b.com',
    nextAlertAt: new Date(now + 60_000).toISOString(),
    ...overrides,
  });
}

describe('InMemoryMonitorRepository countdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('fires the alert and marks the monitor down when the timer elapses', () => {
    const onAlert = jest.fn();
    const repo = new InMemoryMonitorRepository({ onAlert });
    repo.save(makeMonitor());

    jest.advanceTimersByTime(60_000);

    expect(onAlert).toHaveBeenCalledTimes(1);
    expect(repo.findById('dev-1').status).toBe(STATUSES.DOWN);
    repo.close();
  });

  test('a heartbeat before expiry resets the countdown — no alert', () => {
    const onAlert = jest.fn();
    const repo = new InMemoryMonitorRepository({ onAlert });
    repo.save(makeMonitor());

    jest.advanceTimersByTime(59_000);
    const m = repo.findById('dev-1');
    m.applyHeartbeat(new Date());
    repo.update(m); // re-arm

    jest.advanceTimersByTime(59_000); // would have fired under the old timer
    expect(onAlert).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2_000); // now cross the new deadline
    expect(onAlert).toHaveBeenCalledTimes(1);
    repo.close();
  });

  test('a paused monitor never fires', () => {
    const onAlert = jest.fn();
    const repo = new InMemoryMonitorRepository({ onAlert });
    repo.save(makeMonitor());

    const m = repo.findById('dev-1');
    m.pause();
    repo.update(m); // cancels the timer

    jest.advanceTimersByTime(120_000);
    expect(onAlert).not.toHaveBeenCalled();
    expect(repo.findById('dev-1').isPaused()).toBe(true);
    repo.close();
  });

  test('deleting a monitor cancels its timer', () => {
    const onAlert = jest.fn();
    const repo = new InMemoryMonitorRepository({ onAlert });
    repo.save(makeMonitor());
    repo.delete('dev-1');

    jest.advanceTimersByTime(120_000);
    expect(onAlert).not.toHaveBeenCalled();
    repo.close();
  });
});
