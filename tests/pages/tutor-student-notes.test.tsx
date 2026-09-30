import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentsPage from '@/pages/Students';
import { PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

const state = vi.hoisted(() => ({
  queriedTables: [] as string[],
  isOrgTutor: true,
  student: {
    id: 'student-1', full_name: 'Test Student', email: 'student@example.test', phone: '', invite_code: 'ABC123',
    tutor_id: 'tutor-1', linked_user_id: 'student-user', admin_comment: 'Focus on fractions\nUse visual examples.',
    admin_comment_visible_to_tutor: true,
  },
}));

vi.mock('@/components/Layout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/SendPackageModal', () => ({ default: () => null }));
vi.mock('@/components/SendInvoiceModal', () => ({ default: () => null }));
vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({ user: { id: 'tutor-1' }, profile: { organization_id: PRO_KLASE_ORG_ID } }),
}));
vi.mock('@/hooks/useOrgTutorPolicy', () => ({
  useOrgTutorPolicy: () => ({ isOrgTutor: state.isOrgTutor, loading: false, hideMoney: true, canToggleSessionPaid: false }),
}));
vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({ hasFeature: () => false, loading: false, entityType: 'company', organizationId: PRO_KLASE_ORG_ID }),
}));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (amount: unknown) => `€${amount}` }) }));
vi.mock('@/lib/dataCache', () => ({
  getCached: () => ({ students: [state.student] }), setCache: vi.fn(),
}));
vi.mock('@/lib/preload', () => ({
  tutorStudentsRowsDeduped: async () => ({ data: [state.student], error: null }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      state.queriedTables.push(table);
      const query: any = new Proxy({}, {
        get(_target, property) {
          if (property === 'then') return (resolve: (result: unknown) => void) => resolve({ data: [], error: null });
          if (property === 'single' || property === 'maybeSingle') return async () => ({
            data: table === 'profiles' ? { organization_id: PRO_KLASE_ORG_ID } : null, error: null,
          });
          return () => query;
        },
      });
      return query;
    },
    rpc: async () => ({ data: [], error: null }),
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) },
  },
}));

beforeEach(() => {
  state.queriedTables.length = 0;
  state.isOrgTutor = true;
  state.student.admin_comment = 'Focus on fractions\nUse visual examples.';
  state.student.admin_comment_visible_to_tutor = true;
});
afterEach(() => cleanup());

async function openStudentCard() {
  render(<MemoryRouter initialEntries={['/students']}><StudentsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Test Student'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
}

describe('organization tutor student notes', () => {
  it('shows the shared comment when the tutor opens the student card without fetching private administration notes', async () => {
    await openStudentCard();
    expect(screen.getByText('Komentaras korepetitoriui')).toBeTruthy();
    expect(screen.getByText(/Focus on fractions/).textContent).toBe('Focus on fractions\nUse visual examples.');
    expect(state.queriedTables).not.toContain('student_admin_notes');
    expect(screen.queryByText('Administracijos komentarai')).toBeNull();
    expect(screen.queryByText('Paskutinį kartą kontaktuota')).toBeNull();
  });

  it('respects the visibility flag for existing comments that administrators kept private', async () => {
    state.student.admin_comment_visible_to_tutor = false;
    await openStudentCard();
    expect(screen.queryByText(/Focus on fractions/)).toBeNull();
    expect(screen.queryByText('Komentaras korepetitoriui')).toBeNull();
    expect(state.queriedTables).not.toContain('student_admin_notes');
  });

  it('does not render an empty shared-comment panel', async () => {
    state.student.admin_comment = '   ';
    await openStudentCard();
    expect(screen.queryByText('Komentaras korepetitoriui')).toBeNull();
  });
});
