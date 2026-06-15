'use strict';

/**
 * AlertService
 *
 * Concrete implementation of the alert side-effect.
 * Injected into use-cases as a plain function — callers never import this
 * file directly, so swapping to email / PagerDuty / SMS requires zero
 * changes to business logic.
 *
 * Delivery order:
 *   1. Structured console alert  (always, required by spec)
 *   2. Webhook POST              (only when monitor.webhookUrl is set)
 */

const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * Fire an alert for a monitor that has gone down.
 *
 * @param {import('../../domain/Monitor').Monitor} monitor
 * @returns {Promise<void>}
 */
async function fireAlert(monitor) {
  const payload = {
    ALERT:         `Device ${monitor.id} is down!`,
    deviceId:      monitor.id,
    alertEmail:    monitor.alertEmail,
    lastHeartbeat: monitor.lastHeartbeat,
    firedAt:       new Date().toISOString(),
  };

  // ── 1. Console alert ───────────────────────────────────────────────────────
  console.error('\n[ALERT]', JSON.stringify(payload, null, 2), '\n');

  // ── 2. Webhook delivery ────────────────────────────────────────────────────
  if (!monitor.webhookUrl) return;

  try {
    const response = await fetch(monitor.webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (response.ok) {
      console.log(`[ALERT] Webhook delivered for "${monitor.id}" → ${monitor.webhookUrl}`);
    } else {
      console.error(
        `[ALERT] Webhook delivery failed for "${monitor.id}": HTTP ${response.status}`
      );
    }
  } catch (err) {
    console.error(`[ALERT] Webhook error for "${monitor.id}":`, err.message);
  }
}

module.exports = { fireAlert };
