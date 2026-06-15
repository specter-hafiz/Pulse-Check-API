'use strict';

const request = require('supertest');
const { createApp } = require('../../app');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VALID = { id: 'device-123', timeout: 60, alert_email: 'admin@critmon.com' };

describe('Monitors API (integration, in-memory store)', () => {
  let app;
  let close;

  beforeEach(() => {
    ({ app, close } = createApp({ store: 'memory', nodeEnv: 'test' }));
  });

  afterEach(() => close());

  describe('POST /api/monitors', () => {
    test('registers a monitor → 201', async () => {
      const res = await request(app).post('/api/monitors').send(VALID);
      expect(res.status).toBe(201);
      expect(res.body.monitor).toMatchObject({
        id: 'device-123',
        timeoutSeconds: 60,
        alertEmail: 'admin@critmon.com',
        status: 'active',
      });
    });

    test('duplicate id → 409', async () => {
      await request(app).post('/api/monitors').send(VALID);
      const res = await request(app).post('/api/monitors').send(VALID);
      expect(res.status).toBe(409);
      expect(res.body.type).toBe('MonitorAlreadyExistsError');
    });

    test('invalid body → 400 with field errors', async () => {
      const res = await request(app)
        .post('/api/monitors')
        .send({ id: '', timeout: -5, alert_email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.type).toBe('ValidationError');
      expect(res.body.errors.map((e) => e.field).sort()).toEqual([
        'alert_email',
        'id',
        'timeout',
      ]);
    });

    test('rejects an invalid webhook_url → 400', async () => {
      const res = await request(app)
        .post('/api/monitors')
        .send({ ...VALID, webhook_url: 'ftp://nope' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/monitors/:id/heartbeat', () => {
    test('existing monitor → 200 and resets timer', async () => {
      await request(app).post('/api/monitors').send(VALID);
      const res = await request(app).post('/api/monitors/device-123/heartbeat');
      expect(res.status).toBe(200);
      expect(res.body.monitor.lastHeartbeat).not.toBeNull();
    });

    test('unknown id → 404', async () => {
      const res = await request(app).post('/api/monitors/ghost/heartbeat');
      expect(res.status).toBe(404);
      expect(res.body.type).toBe('MonitorNotFoundError');
    });
  });

  describe('POST /api/monitors/:id/pause', () => {
    test('pauses an active monitor → 200', async () => {
      await request(app).post('/api/monitors').send(VALID);
      const res = await request(app).post('/api/monitors/device-123/pause');
      expect(res.status).toBe(200);
      expect(res.body.monitor.status).toBe('paused');
    });

    test('a heartbeat un-pauses → status active again', async () => {
      await request(app).post('/api/monitors').send(VALID);
      await request(app).post('/api/monitors/device-123/pause');
      const res = await request(app).post('/api/monitors/device-123/heartbeat');
      expect(res.body.monitor.status).toBe('active');
    });

    test('pausing an already-paused monitor → 409', async () => {
      await request(app).post('/api/monitors').send(VALID);
      await request(app).post('/api/monitors/device-123/pause');
      const res = await request(app).post('/api/monitors/device-123/pause');
      expect(res.status).toBe(409);
    });
  });

  describe('GET endpoints', () => {
    test('list and fetch a monitor', async () => {
      await request(app).post('/api/monitors').send(VALID);
      const list = await request(app).get('/api/monitors');
      expect(list.body.count).toBe(1);

      const one = await request(app).get('/api/monitors/device-123');
      expect(one.status).toBe(200);
      expect(one.body.monitor.id).toBe('device-123');

      const missing = await request(app).get('/api/monitors/ghost');
      expect(missing.status).toBe(404);
    });
  });

  describe('DELETE /api/monitors/:id', () => {
    test('deletes a monitor → 200, then 404 on re-fetch', async () => {
      await request(app).post('/api/monitors').send(VALID);
      const del = await request(app).delete('/api/monitors/device-123');
      expect(del.status).toBe(200);
      const res = await request(app).get('/api/monitors/device-123');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/monitors/:id/history (Developer\'s Choice)', () => {
    test('records the lifecycle events in order', async () => {
      await request(app).post('/api/monitors').send(VALID);
      await request(app).post('/api/monitors/device-123/heartbeat');
      await request(app).post('/api/monitors/device-123/pause');

      const res = await request(app).get('/api/monitors/device-123/history');
      expect(res.status).toBe(200);
      expect(res.body.events.map((e) => e.type)).toEqual([
        'registered',
        'heartbeat',
        'paused',
      ]);
    });

    test('unknown id → 404', async () => {
      const res = await request(app).get('/api/monitors/ghost/history');
      expect(res.status).toBe(404);
    });
  });

  describe('Alert firing (failure state)', () => {
    test('a monitor with a 1s timeout goes down and logs an alert event', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await request(app)
        .post('/api/monitors')
        .send({ id: 'fast', timeout: 1, alert_email: 'admin@critmon.com' });

      await sleep(1200);

      const res = await request(app).get('/api/monitors/fast');
      expect(res.body.monitor.status).toBe('down');

      const history = await request(app).get('/api/monitors/fast/history');
      expect(history.body.events.map((e) => e.type)).toContain('alert');

      // The required console alert payload was emitted.
      expect(errorSpy).toHaveBeenCalledWith(
        '[ALERT]',
        expect.stringContaining('"ALERT":"Device fast is down!"')
      );
      errorSpy.mockRestore();
    });
  });

  describe('health & unknown routes', () => {
    test('GET /health → 200', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    test('unknown route → 404 NotFoundError', async () => {
      const res = await request(app).get('/nope');
      expect(res.status).toBe(404);
      expect(res.body.type).toBe('NotFoundError');
    });
  });
});
