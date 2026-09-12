import { describe, expect, it } from 'vitest';
import {
  isSchoolParentConfirmationPending,
  schoolParentConfirmationLabel,
  sumPendingSchoolInvoices,
} from '../../src/lib/schoolDashboard';

describe('school dashboard action queues', () => {
  it('includes every contract state that still requires a parent action', () => {
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'sent' })).toBe(true);
    expect(isSchoolParentConfirmationPending({
      kind: 'annual',
      signing_status: 'signed_by_school',
      signatures: [{ role: 'school', status: 'signed' }],
    })).toBe(true);
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'signed_by_school' })).toBe(false);
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'awaiting_school_signature' })).toBe(false);
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'signed' })).toBe(false);
    expect(isSchoolParentConfirmationPending({ kind: 'extra_lessons', signing_status: 'sent', accepted_at: null })).toBe(true);
    expect(isSchoolParentConfirmationPending({ kind: 'extra_lessons', signing_status: 'sent', accepted_at: '2026-09-10T10:00:00Z' })).toBe(false);
  });

  it('labels the pending parent action clearly', () => {
    expect(schoolParentConfirmationLabel({ kind: 'annual', signing_status: 'sent' })).toBe('data');
    expect(schoolParentConfirmationLabel({ kind: 'annual', signing_status: 'signed_by_school' })).toBe('signature');
    expect(schoolParentConfirmationLabel({ kind: 'extra_lessons', signing_status: 'sent' })).toBe('offer');
  });

  it('sums only unpaid monthly invoices in cents', () => {
    expect(sumPendingSchoolInvoices([
      { total_eur: '100.10', payment_status: 'pending' },
      { total_eur: 20.20, payment_status: 'pending' },
      { total_eur: 50, payment_status: 'paid' },
      { total_eur: null, payment_status: 'pending' },
    ])).toBe(120.30);
  });
});
