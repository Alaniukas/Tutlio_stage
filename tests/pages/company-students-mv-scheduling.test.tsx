import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { MOKSLO_VAISIAI_DEMO_ORG_ID } from '@/lib/marketMoney';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    students: [
      {
        id: 'mv-student-unactivated',
        full_name: 'Testinis Mokinys',
        grade: '6 klasė',
        email: null,
        phone: null,
        tutor_id: null,
        tutor: null,
        linked_user_id: null,
        parent_user_id: null,
        detached_at: null,
        invite_code: 'MVTEST',
        payment_payer: 'parent',
        payer_name: 'Testinis Tėvas',
        payer_email: 'parent@example.test',
        created_at: '2026-09-10T10:00:00.000Z',
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
      getUser: vi.fn(async () => ({ data: { user: { id: 'mv-admin-test' } } })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'synthetic-token' } } })),
    },
    from: testState.from,
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

vi.mock('@/contexts/OrgEntityContext', () => ({
  useOrgEntityType: () => 'company',
}));

vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({ user: { id: 'mv-admin-test' }, profile: null, loading: false, refetchProfile: async () => {} }),
}));

vi.mock('@/contexts/OrgAdminAccessContext', () => ({
  useOrgAdminAccess: () => ({
    loading: false,
    membership: { organizationId: MOKSLO_VAISIAI_DEMO_ORG_ID, role: 'owner' },
    isOwner: true,
    can: () => true,
    refresh: async () => {},
    firstAllowedPath: () => '/company',
  }),
}));

vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({
    loading: false,
    organizationId: MOKSLO_VAISIAI_DEMO_ORG_ID,
    hasFeature: (id: string) => id === 'manual_payments' || id === 'full_student_edit',
  }),
}));

vi.mock('@/hooks/useMarketMoney', () => ({
  useMarketMoney: () => ({ fmt: (value: unknown) => `€${value}` }),
}));

vi.mock('@/components/FindTutorModal', () => ({
  default: ({ isOpen, primaryTutorId, frequencyEnabled }: {
    isOpen: boolean;
    primaryTutorId?: string | null;
    frequencyEnabled?: boolean;
  }) => isOpen ? (
    <div
      data-testid="find-tutor-modal"
      data-context={primaryTutorId === undefined ? 'new-student' : 'existing-student'}
      data-frequency={String(Boolean(frequencyEnabled))}
    />
  ) : null,
}));

describe('CompanyStudents Mokslo Vaisiai pre-activation scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.from.mockImplementation(() => {
      const query: any = new Proxy({}, {
        get: (_target, prop) => {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 });
          }
          return () => query;
        },
      });
      return query;
    });
  });

  it('lets an admin choose schedule slots while creating an unactivated student', () => {
    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Pridėti mokinį' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ieškoti pagal laisvą laiką' }));

    const modal = screen.getByTestId('find-tutor-modal');
    expect(modal.getAttribute('data-context')).toBe('new-student');
    expect(modal.getAttribute('data-frequency')).toBe('true');
  });

  it('lets an admin book recurring lessons from an unactivated student card without a Pro Klasė flag', () => {
    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);

    fireEvent.click(screen.getAllByText('Testinis Mokinys')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Ieškoti korepetitoriaus laiko' }));

    const modal = screen.getByTestId('find-tutor-modal');
    expect(modal.getAttribute('data-context')).toBe('existing-student');
    expect(modal.getAttribute('data-frequency')).toBe('true');
  });
});
