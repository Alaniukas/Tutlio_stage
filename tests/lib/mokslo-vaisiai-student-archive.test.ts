import { describe, expect, it } from 'vitest';
import {
  invoiceCountsAsUnpaid,
  packageCountsAsUnpaid,
  sessionCountsAsUnpaid,
} from '@/lib/moksloVaisiaiStudentArchive';
import { studentBelongsToMoksloVaisiai } from '../../api/_lib/moksloVaisiaiStudentArchive';
import { MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';

describe('Mokslo vaisiai student archive unpaid checks', () => {
  it('treats completed unpaid lessons as blocking', () => {
    expect(
      sessionCountsAsUnpaid({
        paid: false,
        payment_status: 'pending',
        status: 'completed',
        price: 25,
      }),
    ).toBe(true);
  });

  it('ignores complimentary, cancelled, and paid lessons', () => {
    expect(sessionCountsAsUnpaid({ paid: false, is_complimentary: true, price: 25 })).toBe(false);
    expect(sessionCountsAsUnpaid({ paid: false, status: 'cancelled', price: 25 })).toBe(false);
    expect(sessionCountsAsUnpaid({ paid: true, price: 25 })).toBe(false);
    expect(sessionCountsAsUnpaid({ paid: false, payment_status: 'paid', price: 25 })).toBe(false);
    expect(sessionCountsAsUnpaid({ paid: false, price: 0 })).toBe(false);
  });

  it('treats pending packages and unpaid invoices as blocking', () => {
    expect(packageCountsAsUnpaid({ paid: false, payment_status: 'pending' })).toBe(true);
    expect(packageCountsAsUnpaid({ paid: true, payment_status: 'pending' })).toBe(false);
    expect(packageCountsAsUnpaid({ paid: false, payment_status: 'expired' })).toBe(false);
    expect(invoiceCountsAsUnpaid({ paid: false })).toBe(true);
    expect(invoiceCountsAsUnpaid({ paid: true })).toBe(false);
  });

  it('matches Mokslo vaisiai students via student or tutor org', () => {
    expect(studentBelongsToMoksloVaisiai({ studentOrganizationId: MOKSLO_VAISIAI_ORG_ID })).toBe(true);
    expect(studentBelongsToMoksloVaisiai({ tutorOrganizationSlug: 'mokslovaisiai' })).toBe(true);
    expect(studentBelongsToMoksloVaisiai({ studentOrganizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })).toBe(
      false,
    );
  });
});
