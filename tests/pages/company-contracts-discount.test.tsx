import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyContracts from '@/pages/company/CompanyContracts';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  discountAgreements: [] as any[],
  cache: {
    orgId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    orgName: 'Testinė mokykla',
    orgEmail: 'school@example.test',
    orgFeatures: { school_extra_lessons_contract: true },
    eSignEnabled: false,
    signingSettings: {
      email: 'school@example.test',
      reason: 'Ugdymo sutarties pasirašymas',
      location: 'Vilnius',
      contact: 'school@example.test',
    },
    templates: [],
    students: [{ id: 'student-id', full_name: 'Testinis mokinys', payer_email: 'parent@example.test' }],
    contractSummaries: [] as any[],
    contracts: [] as any[],
    contractsPage: 0,
    teacherContracts: [] as any[],
  },
}));

vi.mock('@/lib/dataCache', () => ({ getCached: () => testState.cache, setCache: vi.fn(), invalidateCache: vi.fn() }));
vi.mock('@/lib/authSession', () => ({ resolveAuthUser: vi.fn(async () => ({ id: 'admin-1' })) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: testState.from } }));
vi.mock('@/components/school/SchoolDiscountOfferDialog', () => ({
  default: ({ contractId, contractAccepted }: { contractId: string; contractAccepted: boolean }) =>
    <div data-testid="discount-dialog">{contractId}:{String(contractAccepted)}</div>,
}));

const contract = (patch: Record<string, unknown> = {}) => ({
  id: 'contract-id',
  organization_id: testState.cache.orgId,
  student_id: 'student-id',
  kind: 'extra_lessons',
  signing_status: 'sent',
  accepted_at: null,
  contract_number: 'PP-123',
  annual_fee: 48,
  created_at: '2026-09-01T10:00:00Z',
  order_snapshot: { service_name: 'Matematika', service_type: 'individual' },
  student: { full_name: 'Testinis mokinys', payer_name: 'Tėvas', payer_email: 'parent@example.test' },
  ...patch,
});

function setContracts(contracts: any[]) {
  testState.cache.contractSummaries = contracts;
  testState.cache.contracts = contracts;
  testState.cache.contractsPage = 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.cache.orgFeatures.school_extra_lessons_contract = true;
  setContracts([]);
  testState.discountAgreements = [];
  testState.from.mockImplementation((table: string) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      is: () => query,
      in: () => query,
      order: () => query,
      then: (resolve: any, reject: any) => {
        if (table === 'school_contracts') {
          return Promise.resolve({ data: testState.cache.contracts, error: null }).then(resolve, reject);
        }
        if (table === 'school_discount_agreements') {
          return Promise.resolve({ data: testState.discountAgreements, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return query;
  });
});

async function mount() {
  render(<MemoryRouter initialEntries={['/school/contracts']}><CompanyContracts /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Daugiau veiksmų' }));
}

describe('CompanyContracts discount addendum eligibility', () => {
  it.each([
    ['sent', null, false],
    ['signed', '2026-09-01T12:00:00Z', true],
  ])('allows an addendum for %s contracts and passes the main acceptance state', async (signing_status, accepted_at, accepted) => {
    setContracts([contract({ signing_status, accepted_at })]);
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Sukurti nuolaidos priedą' }));
    expect(screen.getByTestId('discount-dialog').textContent).toBe(`contract-id:${accepted}`);
  });

  it.each([
    { signing_status: 'draft' },
    { signing_status: 'signed', accepted_at: null },
    { signing_status: 'sent', accepted_at: '2026-09-01T12:00:00Z' },
    { archived_at: '2026-09-20T12:00:00Z' },
    { terminated_at: '2026-09-20T12:00:00Z' },
    { withdrawal_requested_at: '2026-09-20T12:00:00Z' },
    { kind: 'annual' },
    { student_id: null },
  ])('does not offer a discount for an ineligible contract: %j', async (patch) => {
    setContracts([contract(patch)]);
    await mount();
    expect(screen.queryByRole('button', { name: 'Sukurti nuolaidos priedą' })).toBeNull();
  });

  it('shows each sent discount addendum and whether parents confirmed it', async () => {
    setContracts([contract()]);
    testState.discountAgreements = [
      {
        contract_id: 'contract-id', id: 'pending-addendum', agreement_number: 'NPR-1', activity_label: 'Matematika',
        discount_type: 'percent', discount_value: 20, valid_from: '2026-10-01', valid_until: '2027-06-30', status: 'pending',
      },
      {
        contract_id: 'contract-id', id: 'accepted-addendum', agreement_number: 'NPR-2', activity_label: 'Lietuvių kalba',
        discount_type: 'amount', discount_value: 10, valid_from: '2026-09-01', valid_until: '2027-06-30', status: 'accepted',
      },
    ];
    render(<MemoryRouter initialEntries={['/school/contracts']}><CompanyContracts /></MemoryRouter>);
    expect(await screen.findByText('Nuolaidos priedas NPR-1')).toBeTruthy();
    expect(screen.getByText('Laukia tėvų patvirtinimo')).toBeTruthy();
    expect(screen.getByText('Nuolaidos priedas NPR-2')).toBeTruthy();
    expect(screen.getByText('Patvirtinta')).toBeTruthy();
    expect(screen.getByText('20 %')).toBeTruthy();
    expect(screen.getByText('10 €')).toBeTruthy();
  });

  it('retains the organization feature gate', async () => {
    setContracts([contract()]);
    testState.cache.orgFeatures.school_extra_lessons_contract = false;
    await mount();
    expect(screen.queryByRole('button', { name: 'Sukurti nuolaidos priedą' })).toBeNull();
  });
});
