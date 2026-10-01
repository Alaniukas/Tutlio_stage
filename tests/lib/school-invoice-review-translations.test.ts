import { describe, expect, it } from 'vitest';
import { schoolInvoiceReviewEn, schoolInvoiceReviewLt } from '../../src/lib/i18n/schoolInvoiceReviewTranslations';
import { schoolInvoiceReviewTranslations } from '../../src/lib/i18n/schoolInvoiceReviewOtherTranslations';

describe('school invoice review translations', () => {
  it('provides every review label and the payer placeholder in all thirteen legacy locales', () => {
    const dictionaries = { en: schoolInvoiceReviewEn, lt: schoolInvoiceReviewLt, ...schoolInvoiceReviewTranslations };
    expect(Object.keys(dictionaries)).toHaveLength(13);
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary).sort(), locale).toEqual(Object.keys(schoolInvoiceReviewEn).sort());
      expect(Object.values(dictionary).every((value) => Boolean(value.trim())), locale).toBe(true);
      expect(dictionary['school.invoice.review.payer'], locale).toContain('{email}');
      expect(dictionary['school.invoice.batch.sent'], locale).toContain('{count}');
      expect(dictionary['school.invoice.batch.childLine'], locale).toContain('{name}');
      expect(dictionary['school.invoice.batch.childLine'], locale).toContain('{amount}');
    }
  });
});
