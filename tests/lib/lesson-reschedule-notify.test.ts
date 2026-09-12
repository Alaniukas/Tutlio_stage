import { describe, expect, it } from 'vitest';
import {
  buildLessonRescheduleRecipients,
  shouldNotifyParentOnLessonReschedule,
} from '../../src/lib/lessonRescheduleNotify';

describe('lessonRescheduleNotify', () => {
  it('always notifies parents for school orgs', () => {
    expect(shouldNotifyParentOnLessonReschedule(true, 'student')).toBe(true);
  });

  it('notifies parents for company org only when payer is parent', () => {
    expect(shouldNotifyParentOnLessonReschedule(false, 'parent')).toBe(true);
    expect(shouldNotifyParentOnLessonReschedule(false, 'student')).toBe(false);
  });

  it('builds student and parent recipients for school lessons', () => {
    const recipients = buildLessonRescheduleRecipients({
      isSchoolOrg: true,
      studentEmail: 'child@example.com',
      payerEmail: 'parent@example.com',
      secondaryParentEmail: 'parent2@example.com',
      studentName: 'Ona',
    });

    expect(recipients).toEqual([
      { to: 'child@example.com', recipientRole: 'student', studentName: 'Ona' },
      { to: 'parent@example.com', recipientRole: 'payer', studentName: 'Ona' },
      { to: 'parent2@example.com', recipientRole: 'payer', studentName: 'Ona' },
    ]);
  });
});
