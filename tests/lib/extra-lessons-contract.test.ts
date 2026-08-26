import { describe, expect, it } from 'vitest';
import {
  buildExtraLessonsOrderSnapshot,
  canClickWrapAccept,
  freezeDocumentSource,
  indicativeMonthlyPrice,
  isWithinWithdrawalWindow,
  sha256Hex,
  validateExtraLessonsOrder,
} from '../../src/lib/extraLessonsContract';

describe('extraLessonsContract', () => {
  it('builds snapshot and indicative monthly price from base lessons × unit price', () => {
    const order = buildExtraLessonsOrderSnapshot({
      service_name: 'Matematika LT 2kl',
      service_type: 'group',
      duration_minutes: 45,
      start_date: '2026-09-01',
      end_date: '2027-06-15',
      unit_price_eur: 12,
      base_lessons_per_month: 8,
      schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
      school_email: 'info@laisvivaikai.lt',
    });
    expect(order.indicative_monthly_eur).toBe(96);
    expect(indicativeMonthlyPrice(8, 12)).toBe(96);
    expect(validateExtraLessonsOrder(order)).toEqual([]);
    expect(order.individual_cancel_terms).toBe('netaikoma');
  });

  it('requires terms checkbox for click-wrap', () => {
    expect(canClickWrapAccept({
      accepted_terms: false,
      start_within_14_days: true,
      recording_consent: true,
    })).toBe(false);
    expect(canClickWrapAccept({
      accepted_terms: true,
      start_within_14_days: false,
      recording_consent: null,
    })).toBe(true);
  });

  it('freezes SHA-256 identically for the same acceptance payload', async () => {
    const order = buildExtraLessonsOrderSnapshot({
      service_name: 'X',
      service_type: 'individual',
      duration_minutes: 60,
      start_date: '2026-09-01',
      end_date: '2026-12-31',
      unit_price_eur: 20,
      base_lessons_per_month: 4,
    });
    const source = freezeDocumentSource({
      payload: { sutarties_nr: 'PP-1', paslaugos_pavadinimas: order.service_name },
      filled_body: 'BODY',
      acceptance: { accepted_terms: true, start_within_14_days: true, recording_consent: false },
    });
    const a = await sha256Hex(source);
    const b = await sha256Hex(source);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects 14-day withdrawal window', () => {
    const accepted = new Date('2026-08-01T10:00:00Z').toISOString();
    expect(isWithinWithdrawalWindow(accepted, new Date('2026-08-10T10:00:00Z'))).toBe(true);
    expect(isWithinWithdrawalWindow(accepted, new Date('2026-08-20T10:00:00Z'))).toBe(false);
  });
});
