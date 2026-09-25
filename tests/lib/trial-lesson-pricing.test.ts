import { describe, expect, it } from 'vitest';
import { parseTrialLessonPricing, trialLessonPrice } from '../../src/lib/trialLessonPricing';
import { resolveOrgSessionSubjectDefaults } from '../../src/lib/orgSessionSubjectDefaults';

describe('trial lesson percentage pricing', () => {
  it('keeps existing fixed-price organizations unchanged', () => {
    const pricing = parseTrialLessonPricing({ trial_lesson_price_eur: 12 });
    expect(pricing.mode).toBe('fixed');
    expect(trialLessonPrice(pricing, 40)).toBe(12);
  });

  it('discounts the resolved lesson price with cent rounding', () => {
    const pricing = parseTrialLessonPricing({
      trial_lesson_price_mode: 'discount_percent',
      trial_lesson_discount_percent: 25,
      trial_lesson_price_eur: 10,
    });
    expect(trialLessonPrice(pricing, 30)).toBe(22.5);
    expect(trialLessonPrice(pricing, 42)).toBe(31.5);
    expect(trialLessonPrice({ ...pricing, discountPercent: 33 }, 19.99)).toBe(13.39);
  });

  it('uses student-specific price before applying the discount', () => {
    const result = resolveOrgSessionSubjectDefaults({
      subject: { id: 'math', name: 'Matematika', price: 35, duration_minutes: 60 },
      studentId: 'student-1',
      tutorId: 'tutor-1',
      students: [{ id: 'student-1', grade: '8 klasė' }],
      individualPricing: [{ student_id: 'student-1', subject_id: 'math', price: 28 }],
      trialDefaults: {
        topic: 'Bandomoji', durationMinutes: 45, priceEur: 10,
        priceMode: 'discount_percent', discountPercent: 25,
      },
      forceTrialPricing: true,
    });
    expect(result.price).toBe(21);
    expect(result.durationMinutes).toBe(45);
  });

  it('rejects malformed discount settings rather than silently charging the fixed price', () => {
    const pricing = parseTrialLessonPricing({
      trial_lesson_price_mode: 'discount_percent',
      trial_lesson_discount_percent: 120,
      trial_lesson_price_eur: 10,
    });
    expect(() => trialLessonPrice(pricing, 30)).toThrow();
  });
});
