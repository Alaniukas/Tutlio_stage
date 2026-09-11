import { describe, expect, it } from 'vitest';
import { cancelEffect, isLateCancellation } from '@/lib/schoolConsultationCancel';

describe('schoolConsultationCancel', () => {
  it('detects late cancellation within 24h', () => {
    const start = '2026-03-10T12:00:00Z';
    const cancelled = new Date('2026-03-10T00:00:00Z');
    expect(isLateCancellation(start, cancelled)).toBe(true);
  });

  it('releases quota when early', () => {
    expect(
      cancelEffect({
        kind: 'teacher_subject',
        mode: 'individual',
        isPaid: false,
        startTimeIso: '2099-03-10T12:00:00Z',
        cancelledAt: new Date('2099-03-01T00:00:00Z'),
      }),
    ).toBe('release_quota');
  });

  it('charges individual US on late cancel', () => {
    expect(
      cancelEffect({
        kind: 'teacher_subject',
        mode: 'individual',
        isPaid: false,
        startTimeIso: '2026-03-10T12:00:00Z',
        cancelledAt: new Date('2026-03-10T00:00:00Z'),
      }),
    ).toBe('charge_individual_us');
  });

  it('paid help team late cancel not invoiced', () => {
    expect(
      cancelEffect({
        kind: 'help_team',
        mode: 'individual',
        isPaid: true,
        startTimeIso: '2026-03-10T12:00:00Z',
        cancelledAt: new Date('2026-03-10T00:00:00Z'),
      }),
    ).toBe('paid_not_invoiced');
  });
});
