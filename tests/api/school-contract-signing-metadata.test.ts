import { beforeEach, describe, expect, it, vi } from 'vitest';

const initOneSignMock = vi.hoisted(() =>
  vi.fn(async () => ({ transactionId: 'T1', signingUrl: 'https://sign.test/t1' })),
);

vi.mock('../../api/_lib/gosignClient', () => ({
  initOneSign: initOneSignMock,
  pollSigningResult: vi.fn(),
  cancelSigning: vi.fn(),
}));

import { beginGoSignForRow } from '../../api/_lib/schoolContractSigning';

const CONTRACT = {
  id: 'contract-1',
  organization_id: 'org-1',
  pdf_url: 'org-1/contracts/contract-1/original.pdf',
  contract_number: 'SUT-2026-001',
  organizations: {
    name: 'VšĮ Test mokykla',
    email: 'info@school.test',
    features: {
      school_contract_signing_email: 'irminta@school.test',
      school_contract_signature_reason: 'Ugdymo sutarties pasirašymas',
      school_contract_signature_location: 'Kaišiadorys',
      school_contract_signature_contact: 'info@school.test',
    },
  },
};

const SCHOOL_ROW = {
  id: 'row-school',
  role: 'school',
  token: 'tok-school',
  signer_email: null,
  signer_personal_code: null,
  signed_pdf_path: 'org-1/contracts/contract-1/signed/school.pdf',
};

const PARENT_ROW = {
  id: 'row-parent',
  role: 'parent_primary',
  token: 'tok-parent',
  signer_email: 'margarita@example.test',
  signer_personal_code: '49001011234',
  signed_pdf_path: null,
};

function fakeSupabase(rows: any[]) {
  return {
    from: () => ({
      select: () => ({ eq: async () => ({ data: rows }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
          error: null,
        }),
      }),
    },
  } as any;
}

describe('beginGoSignForRow signature metadata per role', () => {
  beforeEach(() => {
    initOneSignMock.mockClear();
  });

  it('stamps the school signature with the org location and contact', async () => {
    await beginGoSignForRow(fakeSupabase([SCHOOL_ROW, PARENT_ROW]), CONTRACT, SCHOOL_ROW, 'https://tutlio.lt');

    expect(initOneSignMock).toHaveBeenCalledTimes(1);
    const params = initOneSignMock.mock.calls[0][0] as any;
    expect(params.reason).toBe('Ugdymo sutarties pasirašymas');
    expect(params.location).toBe('Kaišiadorys');
    expect(params.contact).toBe('info@school.test');
  });

  it('stamps a parent signature with the parent email and NO school location', async () => {
    await beginGoSignForRow(fakeSupabase([SCHOOL_ROW, PARENT_ROW]), CONTRACT, PARENT_ROW, 'https://tutlio.lt');

    expect(initOneSignMock).toHaveBeenCalledTimes(1);
    const params = initOneSignMock.mock.calls[0][0] as any;
    expect(params.reason).toBe('Ugdymo sutarties pasirašymas');
    expect(params.location).toBeUndefined();
    expect(params.contact).toBe('margarita@example.test');
    expect(params.signerPersonalCode).toBe('49001011234');
  });

  it('omits the contact entirely for a parent without an email (never falls back to info@)', async () => {
    const row = { ...PARENT_ROW, signer_email: '' };
    await beginGoSignForRow(fakeSupabase([SCHOOL_ROW, row]), CONTRACT, row, 'https://tutlio.lt');

    const params = initOneSignMock.mock.calls[0][0] as any;
    expect(params.location).toBeUndefined();
    expect(params.contact).toBeUndefined();
  });
});
