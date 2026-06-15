'use strict';

/**
 * AlertService
 *
 * Concrete implementation of the alert side-effect. It is injected into the
 * composition root as a plain function — business logic never imports this
 * file directly, so swapping to email / PagerDuty / SMS requires zero changes
 * to use-cases or repositories.
 *
 * Delivery:
 *   1. Structured console alert  (always — required by the spec)
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
  // Exact shape required by the brief, enriched with useful context.
  const payload = {
    ALERT: `Device ${monitor.id} is down!`,
    time: new Date().toISOString(),
    deviceId: monitor.id,
    alertEmail: monitor.alertEmail,
    lastHeartbeat: monitor.lastHeartbeat,
  };

  // ── 1. Console alert ──────────────────────────────────────────────────────
  console.error('[ALERT]', JSON.stringify(payload));

  // ── 2. Webhook delivery (best-effort) ─────────────────────────────────────
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
      console.error(
        `[ALERT] Webhook delivery failed for "${monitor.id}": HTTP ${response.status}`
      );
    }
  } catch (err) {
    console.error(`[ALERT] Webhook error for "${monitor.id}":`, err.message);
  }
}

module.exports = { fireAlert };
