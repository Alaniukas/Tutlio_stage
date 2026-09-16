import { describe, expect, it } from 'vitest';
import {
  proKlasePackageCountsAsSent,
  proKlaseTrialFollowupStudentIds,
} from '../../src/lib/proKlasePackageStatus';

const students = [
  {
    id: 'student-a',
    organization_id: 'org-1',
    full_name: 'Benas Testas',
    payer_email: 'parent@example.com',
    tutor_id: 'tutor-a',
  },
  {
    id: 'student-b',
    organization_id: 'org-1',
    full_name: 'Benas Testas',
    payer_email: 'PARENT@example.com',
    tutor_id: 'tutor-b',
  },
];

describe('Pro Klasė package status', () => {
  it('counts a pooled pending package only after its email was sent', () => {
    expect(proKlasePackageCountsAsSent({
      payment_status: 'pending',
      pool_organization_id: 'org-1',
      pool_email_sent_at: null,
    })).toBe(false);
    expect(proKlasePackageCountsAsSent({
      payment_status: 'pending',
      pool_organization_id: 'org-1',
      pool_email_sent_at: '2026-09-16T18:53:00.000Z',
    })).toBe(true);
  });

  it('never counts a cancelled package as sent, even if it used to be emailed', () => {
    expect(proKlasePackageCountsAsSent({
      payment_status: 'cancelled',
      pool_organization_id: 'org-1',
      pool_email_sent_at: '2026-09-16T18:53:00.000Z',
      paid: false,
    })).toBe(false);
  });

  it('clears the warning for every tutor row in the same student identity', () => {
    const result = proKlaseTrialFollowupStudentIds(students, ['student-a'], [{
      student_id: 'student-b',
      payment_status: 'pending',
      pool_organization_id: 'org-1',
      pool_email_sent_at: '2026-09-16T18:53:00.000Z',
    }]);
    expect([...result]).toEqual([]);
  });

  it('restores the identity-wide warning after that package is cancelled', () => {
    const result = proKlaseTrialFollowupStudentIds(students, ['student-a'], [{
      student_id: 'student-b',
      payment_status: 'cancelled',
      pool_organization_id: 'org-1',
      pool_email_sent_at: '2026-09-16T18:53:00.000Z',
    }]);
    expect([...result].sort()).toEqual(['student-a', 'student-b']);
  });

  it('continues to recognize a regular non-trial package', () => {
    expect(proKlasePackageCountsAsSent({
      payment_status: 'pending',
      subject: { is_trial: false },
    })).toBe(true);
    expect(proKlasePackageCountsAsSent({
      payment_status: 'pending',
      subject: { is_trial: true },
    })).toBe(false);
  });
});
