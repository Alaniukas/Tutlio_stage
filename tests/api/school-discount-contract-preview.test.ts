import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSchoolDiscountContractPreviews } from '../../api/_lib/schoolDiscountContractPreview';

const signPdf = vi.hoisted(() => vi.fn());
vi.mock('../../api/_lib/schoolDiscountAgreementShared.js', async (importOriginal) => ({
  ...await importOriginal<any>(),
  signSchoolDiscountPdf: signPdf,
}));

const organizationId = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const contract = {
  id: 'contract-1', organization_id: organizationId, student_id: 'student-1',
  kind: 'extra_lessons', signing_status: 'sent', accepted_at: null,
};
const features = { school_extra_lessons_contract: true };
const at = new Date('2026-09-28T10:00:00Z');
const row = {
  id: 'discount-1', organization_id: organizationId, student_id: 'student-1', contract_id: 'contract-1',
  agreement_number: 'NPR-1', activity_label: 'Matematika', discount_type: 'percent', discount_value: '25',
  valid_from: '2026-09-01', valid_until: '2027-06-30', status: 'pending', accepted_at: null,
  pdf_path: 'private/proposal.pdf', token_expires_at: '2026-10-28T10:00:00Z',
  acceptance_token_hash: 'secret-token-hash', recipient_email: 'private@example.com',
};

function database(rows = [row], error: object | null = null) {
  const filters: Array<[string, unknown]> = [];
  let statuses: string[] = [];
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query; }),
    in: vi.fn((_key: string, values: string[]) => { statuses = values; return query; }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: any) => resolve({
      data: rows.filter((candidate) => filters.every(([key, value]) => (candidate as any)[key] === value)
        && statuses.includes(candidate.status)),
      error,
    }),
  };
  const from = vi.fn(() => query);
  return { client: { from } as any, from, filters };
}

beforeEach(() => {
  vi.clearAllMocks();
  signPdf.mockImplementation(async (_db, path) => path ? `https://storage.example/${path}` : null);
});

describe('discount addenda in the main contract preview', () => {
  it('shows an unsigned contract addendum and keeps access scoped to its organization, student and contract', async () => {
    const db = database([
      row,
      { ...row, id: 'foreign-org', organization_id: 'other-org' },
      { ...row, id: 'foreign-child', student_id: 'other-child' },
      { ...row, id: 'foreign-contract', contract_id: 'other-contract' },
    ]);
    const result = await loadSchoolDiscountContractPreviews(db.client, contract, 'main token&value', features, at);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      agreementNumber: 'NPR-1', discountValue: 25, status: 'pending',
      pdfUrl: 'https://storage.example/private/proposal.pdf',
      acceptUrl: '/school-discount-accept?contractToken=main%20token%26value&agreementId=discount-1',
    });
    expect(db.filters).toEqual([
      ['organization_id', organizationId], ['student_id', 'student-1'], ['contract_id', 'contract-1'],
    ]);
    expect(signPdf).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('secret-token-hash');
    expect(JSON.stringify(result)).not.toContain('private@example.com');
  });

  it('hides expired and cancelled offers while retaining approved evidence', async () => {
    const db = database([
      { ...row, id: 'expired', token_expires_at: '2026-09-27T10:00:00Z' },
      { ...row, id: 'cancelled', status: 'cancelled' },
      { ...row, id: 'approved', status: 'accepted', accepted_at: '2026-09-27T10:00:00Z', token_expires_at: '2026-09-27T10:00:00Z' },
    ]);
    expect((await loadSchoolDiscountContractPreviews(db.client, contract, 'token', features, at)).map((item) => item.id))
      .toEqual(['approved']);
  });

  it('keeps approved addenda visible if new discount offers are disabled', async () => {
    const db = database([row, { ...row, id: 'approved', status: 'accepted', accepted_at: '2026-09-27T10:00:00Z' }]);
    expect((await loadSchoolDiscountContractPreviews(db.client, contract, 'token', {}, at)).map((item) => item.id))
      .toEqual(['approved']);
  });

  it.each([
    { archived_at: '2026-09-27T10:00:00Z' },
    { terminated_at: '2026-09-27T10:00:00Z' },
    { withdrawal_requested_at: '2026-09-27T10:00:00Z' },
    { kind: 'annual' },
    { signing_status: 'draft' },
  ])('does not offer a discount on a closed or ineligible main contract: %j', async (change) => {
    const db = database();
    expect(await loadSchoolDiscountContractPreviews(db.client, { ...contract, ...change }, 'token', features, at)).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('fails the preview when addenda cannot be loaded instead of silently hiding the promised discount', async () => {
    const db = database([], { message: 'Database unavailable' });
    await expect(loadSchoolDiscountContractPreviews(db.client, contract, 'token', features, at))
      .rejects.toThrow('Nepavyko įkelti nuolaidos priedų');
  });
});
