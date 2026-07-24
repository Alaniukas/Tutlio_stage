import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyContracts from '@/pages/company/CompanyContracts';

const contractBase = {
  organization_id: 'org-1',
  template_id: null,
  filled_body: '',
  annual_fee: 300,
  signed_at: null,
  sent_at: '2026-07-10T10:00:00.000Z',
  created_at: '2026-07-10T10:00:00.000Z',
};

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    orgId: 'org-1',
    orgName: 'Test school',
    orgEmail: 'school@example.test',
    orgFeatures: { school_contract_esign: true },
    eSignEnabled: true,
    signingSettings: {
      email: 'school@example.test',
      reason: 'Ugdymo sutarties pasirašymas',
      location: 'Vilnius',
      contact: 'school@example.test',
    },
    templates: [],
    students: [],
    contracts: [] as any[],
  },
}));

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

describe('CompanyContracts list filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.from.mockImplementation(() => {
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => new Promise(() => undefined),
      };
      return query;
    });
    testState.cache.contracts = [
      {
        ...contractBase,
        id: 'contract-signed',
        student_id: 'student-1',
        signing_status: 'signed',
        contract_number: 'SUT-1',
        student: { full_name: 'Vėgėlė Ąžuolas', email: 'a@example.test', payer_name: 'Brigita Vėgėlė', payer_email: 'b@example.test' },
        installments: [
          { installment_number: 2, amount: 150, due_date: '2027-01-15', payment_status: 'pending' },
          { installment_number: 1, amount: 170, due_date: '2026-09-01', payment_status: 'paid' },
        ],
      },
      {
        ...contractBase,
        id: 'contract-pending',
        student_id: 'student-2',
        signing_status: 'signed_by_school',
        contract_number: 'SUT-2',
        student: { full_name: 'Petraitis Jonas', email: 'j@example.test', payer_name: 'Rasa Petraitienė', payer_email: 'r@example.test' },
      },
    ];
  });

  it('filters by signed/unsigned with counts and searches diacritics-insensitively', () => {
    render(
      <MemoryRouter initialEntries={['/school/contracts']}>
        <CompanyContracts />
      </MemoryRouter>,
    );

    // Both cards + counts visible by default.
    expect(screen.getByText('Vėgėlė Ąžuolas')).toBeTruthy();
    expect(screen.getByText('Petraitis Jonas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Visos (2)' })).toBeTruthy();

    // Cards are numbered and show the installment schedule sorted by number,
    // with paid entries marked.
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('2.')).toBeTruthy();
    expect(screen.getByText('Įmokos:')).toBeTruthy();
    expect(screen.getByText(/1\) €170\.00 \(2026-09-01\) ✓/)).toBeTruthy();
    expect(screen.getByText(/2\) €150\.00 \(2027-01-15\)/)).toBeTruthy();

    // Unsigned bucket hides the signed contract.
    fireEvent.click(screen.getByRole('button', { name: 'Nepasirašytos (1)' }));
    expect(screen.queryByText('Vėgėlė Ąžuolas')).toBeNull();
    expect(screen.getByText('Petraitis Jonas')).toBeTruthy();

    // Signed bucket shows only the signed one.
    fireEvent.click(screen.getByRole('button', { name: 'Pasirašytos (1)' }));
    expect(screen.getByText('Vėgėlė Ąžuolas')).toBeTruthy();
    expect(screen.queryByText('Petraitis Jonas')).toBeNull();

    // Search without diacritics finds the diacritic name (within "Visos").
    fireEvent.click(screen.getByRole('button', { name: 'Visos (2)' }));
    fireEvent.change(screen.getByPlaceholderText('Ieškoti pagal mokinį, tėvą ar sutarties nr.'), {
      target: { value: 'vegele' },
    });
    expect(screen.getByText('Vėgėlė Ąžuolas')).toBeTruthy();
    expect(screen.queryByText('Petraitis Jonas')).toBeNull();

    // No matches → dedicated empty message.
    fireEvent.change(screen.getByPlaceholderText('Ieškoti pagal mokinį, tėvą ar sutarties nr.'), {
      target: { value: 'nėra tokio' },
    });
    expect(screen.getByText('Pagal pasirinktą filtrą ar paiešką sutarčių nerasta.')).toBeTruthy();
  });
});
