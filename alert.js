'use strict';

/**
 * alert.js — what happens when a monitor goes down.
 *
 * Injected into the app as a plain function, so the rest of the code never
 * imports it directly. Delivery is:
 *   1. A structured console alert (always).
 *   2. A webhook POST (only when the monitor has a webhook_url).
 */

const WEBHOOK_TIMEOUT_MS = 5_000;

async function fireAlert(monitor) {
  const payload = {
    ALERT: `Device ${monitor.id} is down!`,
    time: new Date().toISOString(),
    deviceId: monitor.id,
    alertEmail: monitor.alertEmail,
    lastHeartbeat: monitor.lastHeartbeat,
  };

  // 1. Console alert (always).
  console.error('[ALERT]', JSON.stringify(payload));

  // 2. Webhook delivery (best-effort — never throws into the alert path).
  if (!monitor.webhookUrl) return;
  try {
    const response = await fetch(monitor.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (response.ok) {
      console.log(`[ALERT] Webhook delivered for "${monitor.id}" → ${monitor.webhookUrl}`);
    } else {
      console.error(`[ALERT] Webhook delivery failed for "${monitor.id}": HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[ALERT] Webhook error for "${monitor.id}":`, err.message);
  }
}

module.exports = { fireAlert };
