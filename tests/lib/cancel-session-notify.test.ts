import { describe, expect, it } from 'vitest';
import { collectCancellationNotifyRecipients } from '../../api/_lib/cancelSessionNotify';

describe('collectCancellationNotifyRecipients', () => {
  it('notifies payer when the student has no email (school cards)', () => {
    expect(
      collectCancellationNotifyRecipients({
        tutorEmail: 'tutor@school.lt',
        studentEmail: '',
        payerEmail: 'parent@example.com',
      }),
    ).toEqual([
      { email: 'parent@example.com', kind: 'parent' },
      { email: 'tutor@school.lt', kind: 'tutor' },
    ]);
  });

  it('notifies both payer and secondary parent', () => {
    const emails = collectCancellationNotifyRecipients({
      studentEmail: null,
      payerEmail: 'jurgasdk@gmail.com',
      parentSecondaryEmail: 'vkurzajevas@gmail.com',
      tutorEmail: 'ieva.v@laisvivaikai.lt',
    });
    expect(emails.map((r) => r.email)).toEqual([
      'jurgasdk@gmail.com',
      'vkurzajevas@gmail.com',
      'ieva.v@laisvivaikai.lt',
    ]);
  });

  it('does not duplicate when payer and student share an inbox', () => {
    expect(
      collectCancellationNotifyRecipients({
        studentEmail: 'same@example.com',
        payerEmail: 'same@example.com',
        tutorEmail: 'tutor@example.com',
      }),
    ).toEqual([
      { email: 'same@example.com', kind: 'parent' },
      { email: 'tutor@example.com', kind: 'tutor' },
    ]);
  });

  it('skips empty or invalid addresses', () => {
    expect(
      collectCancellationNotifyRecipients({
        studentEmail: '  ',
        payerEmail: 'not-an-email',
        parentSecondaryEmail: null,
        tutorEmail: undefined,
      }),
    ).toEqual([]);
  });
});
