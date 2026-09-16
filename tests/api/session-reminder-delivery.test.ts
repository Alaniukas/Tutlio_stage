import { describe, expect, it } from 'vitest';
import {
  sessionReminderDeliveryKey,
  sessionReminderDeliveryOutcome,
  validSessionReminderDeliveryKey,
} from '../../api/_lib/sessionReminderDelivery';

describe('session reminder delivery keys', () => {
  it('is stable for normalized recipients and changes by occurrence', () => {
    const first = sessionReminderDeliveryKey('session_reminder', ' Tutor@Example.test ', 'tutor:t1:2026-09-16T09:00:00.000Z');
    const same = sessionReminderDeliveryKey('session_reminder', 'tutor@example.test', 'tutor:t1:2026-09-16T09:00:00.000Z');
    const other = sessionReminderDeliveryKey('session_reminder', 'tutor@example.test', 'tutor:t1:2026-09-16T12:00:00.000Z');

    expect(first).toBe(same);
    expect(first).toMatch(/^session-reminder\/[a-f0-9]{64}$/);
    expect(other).not.toBe(first);
  });

  it('validates only the exact reminder type, recipient and scope', () => {
    const scope = 'payer:session-1';
    const key = sessionReminderDeliveryKey('session_reminder_payer', 'parent@example.test', scope);

    expect(validSessionReminderDeliveryKey(
      'session_reminder_payer',
      'parent@example.test',
      { reminderDeliveryScope: scope },
      key,
    )).toBe(true);
    expect(validSessionReminderDeliveryKey(
      'session_reminder',
      'parent@example.test',
      { reminderDeliveryScope: scope },
      key,
    )).toBe(false);
    expect(validSessionReminderDeliveryKey(
      'session_reminder_payer',
      'other@example.test',
      { reminderDeliveryScope: scope },
      key,
    )).toBe(false);
  });

  it('requires a provider message id before a reminder is considered sent', () => {
    expect(sessionReminderDeliveryOutcome(true, { success: true, id: 'email-1' })).toBe('sent');
    expect(sessionReminderDeliveryOutcome(true, { success: true })).toBe('retry');
    expect(sessionReminderDeliveryOutcome(true, {
      success: true,
      skipped: true,
      reason: 'school_contract_not_active',
    })).toBe('retry');
    expect(sessionReminderDeliveryOutcome(false, { error: 'failed' })).toBe('retry');
  });

  it('treats a notification preference as an intentional permanent skip', () => {
    expect(sessionReminderDeliveryOutcome(true, {
      success: true,
      skipped: true,
      reason: 'parent_notification_preference',
    })).toBe('permanent_skip');
    expect(sessionReminderDeliveryOutcome(true, {
      success: true,
      skipped: true,
      reason: 'tutor_notification_preference',
    })).toBe('permanent_skip');
  });
});
