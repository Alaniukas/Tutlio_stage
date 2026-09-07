import { describe, expect, it } from 'vitest';
import {
  invoicePartyMatches,
  PRO_KLASE_VAT_EXEMPTION_NOTE,
  proKlaseVatExemptionNote,
} from '../../api/_lib/proKlaseInvoice';
import {
  PRO_KLASE_ORG_ID,
  PRO_KLASE_QA_ORG_ID,
} from '../../api/_lib/marketMoney';

describe('Pro Klasė invoice tax exemption note', () => {
  it('uses the requested legal wording when Pro Klasė is the seller', () => {
    expect(proKlaseVatExemptionNote(PRO_KLASE_ORG_ID, true))
      .toBe('PVM neapmokestinama pagal LR PVMĮ 22 str.');
    expect(proKlaseVatExemptionNote(PRO_KLASE_QA_ORG_ID, true))
      .toBe(PRO_KLASE_VAT_EXEMPTION_NOTE);
  });

  it('does not apply the organization note to tutor invoices or other organizations', () => {
    expect(proKlaseVatExemptionNote(PRO_KLASE_ORG_ID, false)).toBeUndefined();
    expect(proKlaseVatExemptionNote('00000000-0000-0000-0000-000000000000', true)).toBeUndefined();
  });

  it('matches stored invoice parties by company code or normalized name', () => {
    expect(invoicePartyMatches(
      { name: 'Old name', companyCode: ' 123456789 ' },
      { name: 'Pro Klasė', companyCode: '123456789' },
    )).toBe(true);
    expect(invoicePartyMatches(
      { name: '  PRO   KLASĖ ' },
      { name: 'Pro Klasė' },
    )).toBe(true);
    expect(invoicePartyMatches(
      { name: 'Korepetitorius' },
      { name: 'Pro Klasė' },
    )).toBe(false);
  });
});
