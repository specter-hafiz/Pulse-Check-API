'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Monitor, STATUSES } = require('../../domain/Monitor');
const { openDatabase } = require('../../infrastructure/db/connection');
const { SqliteMonitorRepository } = require('../../infrastructure/store/SqliteMonitorRepository');

describe('SqliteMonitorRepository persistence', () => {
  let dbFile;

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `pulse-test-${process.pid}-${process.hrtime.bigint()}.db`);
  });

  afterEach(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbFile + suffix); } catch { /* ignore */ }
    }
  });

  test('monitor state survives a "restart" (new repository over the same file)', () => {
    const db1 = openDatabase(dbFile);
    const repo1 = new SqliteMonitorRepository({ db: db1, onAlert: jest.fn() });
    repo1.save(
      new Monitor({
        id: 'solar-1',
        timeoutSeconds: 3600,
        alertEmail: 'ops@critmon.com',
        nextAlertAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
    );
    repo1.close();
    db1.close();

    // Simulate a process restart.
    const db2 = openDatabase(dbFile);
    const repo2 = new SqliteMonitorRepository({ db: db2, onAlert: jest.fn() });
    const reloaded = repo2.findById('solar-1');
    expect(reloaded).not.toBeNull();
    expect(reloaded.alertEmail).toBe('ops@critmon.com');
    expect(reloaded.isActive()).toBe(true);
    repo2.close();
    db2.close();
  });

  test('rehydration fires an alert for a deadline that lapsed while offline', () => {
    const db1 = openDatabase(dbFile);
    const repo1 = new SqliteMonitorRepository({ db: db1, onAlert: jest.fn() });
    repo1.save(
      new Monitor({
        id: 'weather-1',
        timeoutSeconds: 60,
        alertEmail: 'ops@critmon.com',
        // Deadline already in the past — as if the device went silent while down.
        nextAlertAt: new Date(Date.now() - 1000).toISOString(),
      })
    );
    repo1.close();
    db1.close();

    const onAlert = jest.fn();
    const db2 = openDatabase(dbFile);
    const repo2 = new SqliteMonitorRepository({ db: db2, onAlert }); // rehydrates here
    expect(onAlert).toHaveBeenCalledTimes(1);
    expect(repo2.findById('weather-1').status).toBe(STATUSES.DOWN);
    repo2.close();
    db2.close();
  });
});
