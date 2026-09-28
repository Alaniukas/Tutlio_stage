import { describe, expect, it } from 'vitest';
import { schoolDiscountCopy, schoolDiscountText } from '@/lib/i18n/schoolDiscountCopy';

describe('discount contract UI copy', () => {
  it('has complete translations for the 13 existing school languages', () => {
    const keys = Object.keys(schoolDiscountCopy.lt).sort();
    expect(Object.keys(schoolDiscountCopy).sort()).toEqual(['lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl'].sort());
    for (const [locale, copy] of Object.entries(schoolDiscountCopy)) {
      expect(Object.keys(copy).sort(), locale).toEqual(keys);
      expect(copy.offerSentTogether, locale).toContain('{agreementNumber}');
      expect(copy.offerSentTogether, locale).toContain('{emailTo}');
      expect(Object.values(copy).every((value) => value.trim().length > 0), locale).toBe(true);
    }
  });

  it('interpolates delivery details and falls back to English for other languages', () => {
    expect(schoolDiscountText('lt', 'offerSentTogether', { agreementNumber: 'NPR-123', emailTo: 'parent@example.test' })).toContain('NPR-123 išsiųsti parent@example.test');
    expect(schoolDiscountText('it', 'discountAddendaTitle')).toBe('Discount addenda');
  });
});
