import { describe, expect, it } from 'vitest';
import { normalizeReminderEmail } from '../../api/_lib/reminderOptOut';

describe('reminderOptOut', () => {
  it('normalizes email to trimmed lowercase', () => {
    expect(normalizeReminderEmail('  Foo@Example.COM ')).toBe('foo@example.com');
    expect(normalizeReminderEmail(null)).toBe('');
    expect(normalizeReminderEmail(undefined)).toBe('');
  });
});
