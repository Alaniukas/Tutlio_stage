import { describe, it, expect } from 'vitest';
import { dedupeReminderRecipients } from '../../api/_lib/reminderRecipients';

describe('dedupeReminderRecipients', () => {
  it('returns all distinct recipients, preserving first-seen order', () => {
    const out = dedupeReminderRecipients([
      { email: 'mom@example.com', name: 'Mom' },
      { email: 'dad@example.com', name: 'Dad' },
    ]);
    expect(out).toEqual([
      { email: 'mom@example.com', name: 'Mom' },
      { email: 'dad@example.com', name: 'Dad' },
    ]);
  });

  it('dedupes case-insensitively, keeping the first occurrence', () => {
    const out = dedupeReminderRecipients([
      { email: 'Mom@Example.com', name: 'Mom' },
      { email: 'mom@example.com', name: 'Duplicate' },
    ]);
    expect(out).toEqual([{ email: 'Mom@Example.com', name: 'Mom' }]);
  });

  it("drops the student's own email", () => {
    const out = dedupeReminderRecipients(
      [
        { email: 'kid@example.com', name: 'Kid' },
        { email: 'mom@example.com', name: 'Mom' },
      ],
      { studentEmail: 'KID@example.com' },
    );
    expect(out).toEqual([{ email: 'mom@example.com', name: 'Mom' }]);
  });

  it('drops opted-out recipients', () => {
    const out = dedupeReminderRecipients(
      [
        { email: 'mom@example.com', name: 'Mom' },
        { email: 'dad@example.com', name: 'Dad' },
      ],
      { optedOutEmails: ['DAD@example.com'] },
    );
    expect(out).toEqual([{ email: 'mom@example.com', name: 'Mom' }]);
  });

  it('ignores blank emails and trims output', () => {
    const out = dedupeReminderRecipients([
      { email: '   ', name: 'Blank' },
      { email: '  mom@example.com  ', name: 'Mom' },
    ]);
    expect(out).toEqual([{ email: 'mom@example.com', name: 'Mom' }]);
  });
});
