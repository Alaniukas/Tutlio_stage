import { describe, expect, it } from 'vitest';
import { shouldSkipTutorNotification } from '../../api/_lib/tutorNotificationPreferences';
import {
  parseEmailOptOutList,
  toggleEmailOptOut,
} from '../../src/lib/emailNotificationOptOut';

function preferenceClient(rows: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        ilike: () => ({
          limit: async () => ({ data: rows, error }),
        }),
      }),
    }),
  } as any;
}

describe('tutor notification preferences', () => {
  it('stores the organization availability notice as a supported opt-out', () => {
    expect(parseEmailOptOutList(['org_tutor_availability_notice', 'unknown'])).toEqual([
      'org_tutor_availability_notice',
    ]);
    expect(toggleEmailOptOut([], 'org_tutor_availability_notice')).toEqual([
      'org_tutor_availability_notice',
    ]);
  });

  it('skips an organization availability email when the recipient opted out', async () => {
    const client = preferenceClient([{ email_notification_opt_out: ['org_tutor_availability_notice'] }]);
    await expect(shouldSkipTutorNotification(
      client,
      'ausra@example.com',
      'org_tutor_availability_notice',
    )).resolves.toBe(true);
  });

  it('does not apply the availability preference to other email types', async () => {
    const client = preferenceClient([{ email_notification_opt_out: ['org_tutor_availability_notice'] }]);
    await expect(shouldSkipTutorNotification(
      client,
      'ausra@example.com',
      'session_reminder',
    )).resolves.toBe(false);
  });

  it('fails open when the preference lookup fails', async () => {
    const client = preferenceClient(null, { message: 'temporary database error' });
    await expect(shouldSkipTutorNotification(
      client,
      'ausra@example.com',
      'org_tutor_availability_notice',
    )).resolves.toBe(false);
  });
});
