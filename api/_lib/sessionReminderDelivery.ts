import { createHash } from 'node:crypto';

const SESSION_REMINDER_TYPES = new Set(['session_reminder', 'session_reminder_payer']);

export type SessionReminderDeliveryOutcome = 'sent' | 'permanent_skip' | 'retry';

/** Resend reserves an idempotency key only after the original email was sent. */
export function reminderWasAlreadySent(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const providerError = error as { statusCode?: unknown; name?: unknown };
  return providerError.statusCode === 409 && providerError.name === 'invalid_idempotent_request';
}

function normalizedRecipient(to: unknown): string | null {
  const value = Array.isArray(to) ? to[0] : to;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/**
 * Resend idempotency key for one logical reminder recipient and occurrence.
 * The hash keeps email addresses out of provider keys and logs.
 */
export function sessionReminderDeliveryKey(type: unknown, to: unknown, scope: unknown): string | null {
  if (!SESSION_REMINDER_TYPES.has(String(type))) return null;
  const recipient = normalizedRecipient(to);
  if (!recipient || typeof scope !== 'string' || !scope.trim() || scope.length > 300 || /[\r\n]/.test(scope)) {
    return null;
  }
  const digest = createHash('sha256')
    .update(`${String(type)}\0${scope.trim()}\0${recipient}`)
    .digest('hex');
  return `session-reminder/${digest}`;
}

export function validSessionReminderDeliveryKey(
  type: unknown,
  to: unknown,
  data: unknown,
  key: unknown,
): boolean {
  if (typeof key !== 'string') return false;
  const scope = (data as { reminderDeliveryScope?: unknown } | null)?.reminderDeliveryScope;
  return key === sessionReminderDeliveryKey(type, to, scope);
}

/**
 * `/api/send-email` may intentionally return HTTP 200 without sending anything
 * (for example while a school contract is still awaiting acceptance). The
 * reminder cron must therefore inspect the response body instead of treating
 * every 2xx response as provider-confirmed delivery.
 */
export function sessionReminderDeliveryOutcome(
  responseOk: boolean,
  body: unknown,
): SessionReminderDeliveryOutcome {
  const payload = body && typeof body === 'object'
    ? body as { success?: unknown; id?: unknown; skipped?: unknown; reason?: unknown }
    : null;

  if (
    responseOk
    && payload?.success === true
    && typeof payload.id === 'string'
    && payload.id.trim()
  ) {
    return 'sent';
  }

  // Notification preferences are a durable, intentional skip. Marking that
  // recipient handled prevents the cron from retrying every five minutes.
  if (
    responseOk
    && payload?.success === true
    && payload.skipped === true
    && (payload.reason === 'parent_notification_preference'
      || payload.reason === 'tutor_notification_preference'
      || payload.reason === 'already_sent_with_modified_payload')
  ) {
    return 'permanent_skip';
  }

  // A contract can be accepted before the lesson, so contract-gated reminders
  // remain pending and are retried on the next cron run.
  return 'retry';
}
