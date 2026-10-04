import { describe, expect, it } from 'vitest';
import {
  findLessonDiscountForSession,
  mapAcceptedDiscountAgreement,
  mergeLessonDiscountInputs,
} from '../../src/lib/schoolMonthlyInvoiceDiscounts';
import { buildSchoolLessonInvoiceLines } from '../../src/lib/schoolMonthlyInvoiceLines';

describe('schoolMonthlyInvoiceDiscounts', () => {
  it('matches a group contract discount by class group id when the session has no subject id', () => {
    const discount = mapAcceptedDiscountAgreement({
      id: 'agr-1',
      student_id: 'child1',
      contract_id: 'contract-1',
      subject_id: null,
      tutor_id: 'teacher1',
      discount_type: 'percent',
      discount_value: 100,
      valid_from: '2026-09-01',
      valid_until: '2027-06-30',
      agreement_number: 'NPR-1',
      note: 'Visų mokslo metų nuolaida',
    }, { id: 'contract-1', class_group_id: 'group-russian' });

    expect(findLessonDiscountForSession([discount], {
      subjectId: 'group-russian',
      tutorId: 'teacher1',
      classGroupId: 'group-russian',
    })).toEqual(discount);
  });

  it('deduplicates synced lesson discounts and accepted agreements', () => {
    const saved = [{
      type: 'percent' as const,
      value: 100,
      subjectId: 'subject-1',
      tutorId: 'teacher1',
      agreementId: 'agr-1',
      note: 'NPR-1',
    }];
    const fromAgreement = [mapAcceptedDiscountAgreement({
      id: 'agr-1',
      student_id: 'child1',
      contract_id: 'contract-1',
      subject_id: 'subject-1',
      tutor_id: 'teacher1',
      discount_type: 'percent',
      discount_value: 100,
      valid_from: '2026-09-01',
      valid_until: '2027-06-30',
      agreement_number: 'NPR-1',
    }, { id: 'contract-1', class_group_id: 'group-russian' })];
    expect(mergeLessonDiscountInputs(saved, fromAgreement)).toHaveLength(1);
  });

  it('applies a confirmed 100 percent agreement to grouped lesson rows', () => {
    const discounts = [mapAcceptedDiscountAgreement({
      id: 'agr-1',
      student_id: 'child1',
      contract_id: 'contract-1',
      subject_id: 'russian-subject',
      tutor_id: 'teacher1',
      discount_type: 'percent',
      discount_value: 100,
      valid_from: '2026-09-01',
      valid_until: '2027-06-30',
      agreement_number: 'NPR-1',
    }, { id: 'contract-1', class_group_id: 'group-russian' })];
    const lines = buildSchoolLessonInvoiceLines([
      { id: 'l1', subjectId: 'group-russian', classGroupId: 'group-russian', subjectName: 'Rusų kalba 11 klasė', tutorId: 'teacher1', tutorName: 'Olga', unitPriceEur: 6 },
      { id: 'l2', subjectId: 'group-russian', classGroupId: 'group-russian', subjectName: 'Rusų kalba 11 klasė', tutorId: 'teacher1', tutorName: 'Olga', unitPriceEur: 6 },
      { id: 'l3', subjectId: 'group-russian', classGroupId: 'group-russian', subjectName: 'Rusų kalba 11 klasė', tutorId: 'teacher1', tutorName: 'Olga', unitPriceEur: 6 },
    ], discounts);
    expect(lines[0]).toMatchObject({
      quantity: 3,
      originalAmountEur: 18,
      discountAmountEur: 18,
      amountEur: 0,
      discountType: 'percent',
      discountValue: 100,
    });
  });
});
