import { describe, expect, it } from 'vitest';
import { collectCancellationNotifyRecipients, shouldSendCancellationEmails } from '../../api/_lib/cancelSessionNotify';

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

describe('shouldSendCancellationEmails', () => {
  const now = new Date('2026-09-15T11:16:00+03:00');

  it('does not email when the lesson already ended (late school leftover cancel)', () => {
    expect(
      shouldSendCancellationEmails({
        previousStatus: 'completed',
        startTime: '2026-09-07T12:00:00+03:00',
        endTime: '2026-09-07T13:00:00+03:00',
        now,
      }),
    ).toBe(false);
  });

  it('does not email a second time for an already cancelled row', () => {
    expect(
      shouldSendCancellationEmails({
        previousStatus: 'cancelled',
        startTime: '2026-09-16T16:00:00+03:00',
        endTime: '2026-09-16T17:00:00+03:00',
        now,
      }),
    ).toBe(false);
  });

  it('emails parents when a future lesson is cancelled', () => {
    expect(
      shouldSendCancellationEmails({
        previousStatus: 'active',
        startTime: '2026-09-16T16:00:00+03:00',
        endTime: '2026-09-16T17:00:00+03:00',
        now,
      }),
    ).toBe(true);
  });
});
