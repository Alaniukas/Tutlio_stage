import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    students: [
      {
        id: 'pk-1',
        full_name: 'Pro Klasė Mokinys',
        grade: '5 klas?',
        email: 'mokinys@example.com',
        phone: null,
        tutor_id: null,
        tutor: null,
        linked_user_id: null,
        detached_at: null,
        invite_code: 'ABC123',
        created_at: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 'pk-2',
        full_name: null,
        grade: '7 klasė',
        email: '',
        phone: null,
        tutor_id: null,
        tutor: null,
        linked_user_id: null,
        detached_at: null,
        invite_code: null,
        created_at: '2026-07-02T10:00:00.000Z',
      },
    ],
    tutors: [],
    contractsByStudent: {},
  },
}));

vi.mock('@/lib/dataCache', () => ({
  getCached: vi.fn(() => testState.cache),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } } })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
    },
    from: testState.from,
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

vi.mock('@/contexts/OrgEntityContext', () => ({
  useOrgEntityType: () => 'company',
}));

vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({ user: { id: 'admin-1' }, profile: null, loading: false, refetchProfile: async () => {} }),
}));

vi.mock('@/contexts/OrgAdminAccessContext', () => ({
  useOrgAdminAccess: () => ({
    loading: false,
    membership: { organizationId: PRO_KLASE_ORG_ID, role: 'owner' },
    isOwner: true,
    can: () => true,
    refresh: async () => {},
    firstAllowedPath: () => '/company',
  }),
}));

vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({
    loading: false,
    hasFeature: (id: string) =>
      id === 'monthly_packages' || id === 'student_card_booking' || id === 'full_student_edit',
  }),
}));

vi.mock('@/hooks/useMarketMoney', () => ({
  useMarketMoney: () => ({ fmt: (n: unknown) => `€${n}` }),
}));

describe('CompanyStudents Pro Klasė list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.from.mockImplementation(() => {
      const query: any = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'then') return (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 });
            return () => query;
          },
        },
      );
      return query;
    });
  });

  it('renders the list and opens a student with a corrupted grade without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/company/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    expect(screen.getByText('(2)')).toBeTruthy();
    expect(screen.getAllByText(/Pro Klasė Mokinys/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);
    expect(screen.getByText('Mokinio informacija')).toBeTruthy();
  });

  it('does not show school-only personal code fields for company orgs with full_student_edit', () => {
    render(
      <MemoryRouter initialEntries={['/company/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);
    fireEvent.click(screen.getByRole('button', { name: /rodyti|show/i }));

    expect(screen.queryByPlaceholderText('Asmens kodas')).toBeNull();
    expect(screen.queryByPlaceholderText(/adresas/i)).toBeNull();
  });
});
