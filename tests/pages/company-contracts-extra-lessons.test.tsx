import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgEntityProvider } from '@/contexts/OrgEntityContext';
import CompanyContracts from '@/pages/company/CompanyContracts';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    orgId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    orgName: 'VšĮ Laisvi vaikai',
    orgEmail: 'irminta@laisvivaikai.lt',
    orgFeatures: { school_extra_lessons_contract: true, school_contract_esign: false },
    eSignEnabled: false,
    signingSettings: {
      email: 'irminta@laisvivaikai.lt',
      reason: 'Ugdymo sutarties pasirašymas',
      location: 'Vilnius',
      contact: 'irminta@laisvivaikai.lt',
    },
    templates: [],
    students: [{ id: 's1', full_name: 'Emilija Bar', payer_email: 'parent@test.lt' }],
    contractSummaries: [] as any[],
    contracts: [] as any[],
  },
}));

const extraContractsFixture = () => [
  {
    id: 'c-extra-1',
    kind: 'extra_lessons',
    organization_id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    student_id: 's1',
    signing_status: 'sent',
    contract_number: 'PP-100',
    annual_fee: 24,
    unit_price_eur: 6,
    sent_at: '2026-09-01T10:00:00.000Z',
    order_snapshot: {
      service_name: 'lietuvių kalba',
      service_type: 'group',
      schedule_label: 'antradieniais 16:00–16:45',
      group_name: 'LT 5 kl.',
      tutor_name: 'Ona Mokytoja',
    },
    class_group: { name: 'LT 5 kl.', tutor: { full_name: 'Ona Mokytoja' } },
    student: { full_name: 'Emilija Bar', payer_name: 'Tėvas', payer_email: 'parent@test.lt' },
    signatures: [],
    installments: [],
  },
  {
    id: 'c-extra-2',
    kind: 'extra_lessons',
    organization_id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    student_id: 's1',
    signing_status: 'sent',
    contract_number: 'PP-101',
    annual_fee: 80,
    unit_price_eur: 20,
    sent_at: '2026-09-02T10:00:00.000Z',
    order_snapshot: {
      service_name: 'matematika',
      service_type: 'individual',
      schedule_label: 'trečiadieniais 17:00–17:45',
    },
    student: { full_name: 'Emilija Bar', payer_name: 'Tėvas', payer_email: 'parent@test.lt' },
    signatures: [],
    installments: [],
  },
];

vi.mock('@/lib/dataCache', () => ({
  getCached: vi.fn(() => testState.cache),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: testState.from,
  },
}));

vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({
    loading: false,
    hasFeature: (id: string) => id === 'school_extra_lessons_contract',
  }),
}));

describe('CompanyContracts extra-lessons list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    testState.from.mockImplementation(() => {
      const query: Record<string, unknown> = {};
      const self = () => query;
      query.select = self;
      query.eq = self;
      query.is = self;
      query.order = () => Promise.resolve({ data: testState.cache.contractSummaries, error: null });
      query.in = () => Promise.resolve({ data: extraContractsFixture(), error: null });
      return query;
    });
    testState.cache.contractSummaries = extraContractsFixture();
    testState.cache.contracts = extraContractsFixture();
  });

  it('renders extra-lessons titles, monthly fee and search without crashing', async () => {
    render(
      <OrgEntityProvider value="school">
        <MemoryRouter initialEntries={['/school/contracts']}>
          <CompanyContracts />
        </MemoryRouter>
      </OrgEntityProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Emilija Bar – lietuvių kalba – grupinis užsiėmimas')).toBeTruthy();
    });
    expect(screen.getByText('Emilija Bar – matematika – individualus užsiėmimas')).toBeTruthy();
    expect(screen.getAllByText(/Mėnesinis mokestis:/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Mokytojas: Ona Mokytoja/)).toBeTruthy();
    expect(
      screen.getByPlaceholderText('Ieškoti pagal mokinį, tėvą, dalyką, mokytoją ar sutarties nr.'),
    ).toBeTruthy();
    expect(screen.queryByText('common.edit')).toBeNull();
    expect(screen.queryByText('school.extra.monthlyFee')).toBeNull();
  });
});
