import { describe, expect, it } from 'vitest';
import { countParentUnpaidPastLessons } from '@/lib/preload';

const now = new Date('2026-09-29T12:00:00Z');
const completed = { tutorId: 'monthly-tutor', status: 'completed', paid: false, payment_status: 'pending' };

describe('parent dashboard preloaded unpaid count', () => {
  it('does not show monthly lessons as an unpaid debt when the student inherits org settings', () => {
    const flags = new Map([['monthly-tutor', { enable_per_lesson: true, enable_monthly_billing: true }]]);
    expect(countParentUnpaidPastLessons([completed], null, flags, now)).toBe(0);
    expect(countParentUnpaidPastLessons([completed], 'monthly_billing', flags, now)).toBe(0);
  });

  it('counts explicit per-lesson debt by the lesson tutor and fails closed for unknown owners', () => {
    const flags = new Map([['monthly-tutor', { enable_per_lesson: true, enable_monthly_billing: true }]]);
    expect(countParentUnpaidPastLessons([completed], 'per_lesson', flags, now)).toBe(1);
    expect(countParentUnpaidPastLessons([{ ...completed, tutorId: 'unknown' }], 'per_lesson', flags, now)).toBe(0);
  });
});
