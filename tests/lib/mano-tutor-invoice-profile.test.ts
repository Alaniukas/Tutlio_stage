import { describe, expect, it } from 'vitest';
import {
  isLikelyLithuanianPersonalCode,
  manoOrgTutorInvoiceAddressError,
} from '../../src/lib/manoTutorInvoiceProfile';

describe('manoTutorInvoiceProfile', () => {
  it('detects an eleven-digit personal code', () => {
    expect(isLikelyLithuanianPersonalCode('39001010000')).toBe(true);
    expect(isLikelyLithuanianPersonalCode('Veteranų 14-30, Visaginas')).toBe(false);
  });

  it('requires a real address for MK tutor invoices', () => {
    expect(manoOrgTutorInvoiceAddressError(null)).toMatch(/būtinas adresas/);
    expect(manoOrgTutorInvoiceAddressError({ address: '39001010000' })).toMatch(/asmens kodas/);
    expect(manoOrgTutorInvoiceAddressError({ address: 'Veteranų 14-30, Visaginas' })).toBeNull();
  });
});
