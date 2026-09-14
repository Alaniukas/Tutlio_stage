import { describe, expect, it } from 'vitest';
import {
  parentNotificationKeyForEmailType,
  parseParentNotificationOptOut,
  setParentNotificationEnabled,
} from '../../src/lib/parentNotificationPreferences';
import { shouldSkipParentNotification } from '../../api/_lib/parentNotificationPreferences';

function preferenceClient(row: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      }),
    }),
  } as any;
}

describe('parent notification preferences', () => {
  it('preserves the legacy lesson-reminder opt-out', () => {
    expect(parseParentNotificationOptOut([], true)).toEqual(['lesson_reminders']);
  });

  it('keeps the stored opt-out list ordered and limited to supported keys', () => {
    expect(parseParentNotificationOptOut(['payment_reminders', 'unknown', 'lesson_updates'])).toEqual([
      'lesson_updates',
      'payment_reminders',
    ]);
    expect(setParentNotificationEnabled(['lesson_updates'], 'lesson_updates', true)).toEqual([]);
  });

  it('maps only optional parent-facing emails to configurable categories', () => {
    expect(parentNotificationKeyForEmailType('session_cancelled_parent')).toBe('lesson_updates');
    expect(parentNotificationKeyForEmailType('session_reminder_payer')).toBe('lesson_reminders');
    expect(parentNotificationKeyForEmailType('session_student_no_show')).toBe('attendance_updates');
    expect(parentNotificationKeyForEmailType('payment_after_lesson_reminder')).toBe('payment_reminders');
    expect(parentNotificationKeyForEmailType('booking_confirmation', { forPayer: true })).toBe('lesson_updates');
    expect(parentNotificationKeyForEmailType('booking_confirmation', { forPayer: false })).toBeNull();
    expect(parentNotificationKeyForEmailType('lesson_rescheduled', { recipientRole: 'payer' })).toBe('lesson_updates');
    expect(parentNotificationKeyForEmailType('lesson_rescheduled', { recipientRole: 'student' })).toBeNull();
    expect(parentNotificationKeyForEmailType('school_monthly_invoice')).toBeNull();
    expect(parentNotificationKeyForEmailType('payment_success')).toBeNull();
  });

  it('skips an opted-out parent cancellation notification', async () => {
    const client = preferenceClient({
      email_notification_opt_out: ['lesson_updates'],
      disable_lesson_reminders: false,
    });
    await expect(shouldSkipParentNotification(
      client,
      'parent@example.com',
      'session_cancelled_parent',
    )).resolves.toBe(true);
  });

  it('fails open when preferences cannot be loaded', async () => {
    const client = preferenceClient(null, { message: 'temporary database error' });
    await expect(shouldSkipParentNotification(
      client,
      'parent@example.com',
      'session_cancelled_parent',
    )).resolves.toBe(false);
  });
});
