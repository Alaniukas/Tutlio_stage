import { describe, expect, it } from 'vitest';
import { buildSchoolServiceInvoiceLines, parseServiceChargeInput, type SchoolServiceCharge } from '../../src/lib/schoolServiceCharges';
import { schoolStudentInvoiceSendable } from '../../src/lib/schoolPayerInvoiceGroups';
import { schoolServiceTranslations } from '../../src/lib/i18n/schoolServiceTranslations';

const input = { description: 'Olimpiada', unitPriceEur: 8.25, quantity: 2, serviceDate: '2026-10-21', invoiceMonth: '2026-10', internalNote: 'Private' };
describe('one-off service pricing and invoice sources', () => {
  it('translates all service labels and interpolation parameters in the 13 base languages', () => {
    const base = schoolServiceTranslations.en;
    expect(Object.keys(schoolServiceTranslations)).toHaveLength(13);
    for (const copy of Object.values(schoolServiceTranslations)) {
      expect(Object.keys(copy)).toEqual(Object.keys(base));
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim()).not.toBe('');
        expect([...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort())
          .toEqual([...base[key].matchAll(/\{\w+\}/g)].map(match => match[0]).sort());
      }
    }
  });
  it.each([{ ...input, unitPriceEur: -1 }, { ...input, unitPriceEur: 1.001 }, { ...input, quantity: 0.5 },
    { ...input, serviceDate: '2026-02-30' }, { ...input, invoiceMonth: '2026-13' }, { ...input, description: ' ' }])('rejects malformed billing inputs', row => {
    expect(() => parseServiceChargeInput(row)).toThrow('school.services.invalid');
  });
  it('bills a source once, excludes cancelled/claimed charges, and never leaks notes or lesson discounts', () => {
    const base = { ...parseServiceChargeInput(input), id: 'one', student_id: 'child', version: 2 } as SchoolServiceCharge;
    const rows = buildSchoolServiceInvoiceLines([base, base, { ...base, id: 'two', cancelled_at: 'now' },
      { ...base, id: 'three', invoice_id: 'paid' }, { ...base, id: 'four', invoice_id: 'draft' }],
    new Map([['child', { full_name: 'Child' }]]), new Set(['draft']));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ amountEur: 16.5, discountAmountEur: 0, source: 'service', sessionIds: [], studentName: 'Child', serviceChargeVersion: 2 });
    expect(JSON.stringify(rows)).not.toContain('Private');
    expect(rows[0].tutorId).toBeUndefined();
  });
  it('makes a service-only invoice sendable without inventing a lesson count', () => {
    expect(schoolStudentInvoiceSendable({ lessonCount: 0, serviceCount: 1, payerEmail: 'parent@example.com', alreadyIssued: false, reviewSessionIds: [] })).toBe(true);
    expect(schoolStudentInvoiceSendable({ lessonCount: 0, serviceCount: 1, payerEmail: '', alreadyIssued: false, reviewSessionIds: [] })).toBe(false);
  });
});
