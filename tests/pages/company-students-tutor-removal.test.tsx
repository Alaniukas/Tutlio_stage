import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { rowQuery } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({ students: [] as any[], rpc: vi.fn(), canEditLessons: true, canEditStudents: true }));
vi.mock('@/lib/dataCache', () => ({
  getCached: (key: string) => key === 'company_students' ? { students: state.students, tutors: [], contractsByStudent: {} } : null,
  setCache: vi.fn(), invalidateCache: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
  from: (table: string) => {
    const query = rowQuery(table, () => table === 'students' ? state.students : [], [], []);
    query.or = () => query;
    return query;
  },
  rpc: state.rpc,
} }));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => 'company' }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: null, profile: null, loading: false }) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOrgAdminAccess: () => ({
  loading: false, membership: { organizationId: 'b0a00000-7e57-4000-8000-000000000001' }, isOwner: false,
  can: (permission: string) => permission === 'sessions.edit' ? state.canEditLessons : permission === 'students.edit' ? state.canEditStudents : true,
  refresh: async () => {}, firstAllowedPath: () => '/company',
}) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({ loading: false, hasFeature: () => false }) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: unknown) => `€${value}` }) }));

beforeEach(() => {
  state.canEditLessons = true;
  state.canEditStudents = true;
  state.students = [
    { id: 'lt-card', tutor_id: 'lt-tutor', tutor: { full_name: 'Vakarė Testinė' } },
    { id: 'math-card', tutor_id: 'math-tutor', tutor: { full_name: 'Barbora Testinė' } },
  ].map((row) => ({ ...row, organization_id: 'b0a00000-7e57-4000-8000-000000000001',
    full_name: 'Test Student', email: 'synthetic@example.test', payer_email: 'parent@example.test',
    linked_user_id: 'child-account', detached_at: null, invite_code: row.id, enrollment_status: 'active',
    created_at: '2026-10-01T00:00:00Z', phone: null, grade: '5 klasė' }));
  state.rpc.mockResolvedValue({ data: { mode: 'detached', cancelledSessions: 34 }, error: null });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ packages: [], plans: [], rows: [] }) })));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

async function openStudent() {
  await act(async () => { render(<MemoryRouter><CompanyStudents /></MemoryRouter>); });
  fireEvent.click(screen.getAllByText('Test Student')[0]);
  const dialog = await screen.findByRole('dialog');
  const tutorRow = within(dialog).getByText('Vakarė Testinė', { selector: 'p' }).parentElement!.parentElement!;
  return { dialog, removeButton: within(tutorRow).getByRole('button', { name: 'Pašalinti' }) };
}

describe('student card tutor removal', () => {
  it('confirms stopping lessons and calls the atomic RPC without selecting a transfer target', async () => {
    const { dialog, removeButton } = await openStudent();
    fireEvent.click(removeButton);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('remove_org_student_tutor_pairing', {
      p_student_id: 'lt-card', p_expected_tutor_id: 'lt-tutor', p_remaining_student_ids: ['math-card'],
    }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('būsimas neapmokėtas individualias pamokas'));
    await waitFor(() => expect(within(dialog).queryByText('Vakarė Testinė', { selector: 'p' })).toBeNull());
    expect(within(dialog).getByText('Barbora Testinė', { selector: 'p' })).toBeTruthy();
  });

  it('keeps both tutors and explains a package-offer conflict', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'tutor_pairing_billing_review_required' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { dialog, removeButton } = await openStudent();
    fireEvent.click(removeButton);
    await screen.findByText(/laukiančius paketų pasiūlymus/);
    expect(within(dialog).getByText('Vakarė Testinė', { selector: 'p' })).toBeTruthy();
    expect(within(dialog).getByText('Barbora Testinė', { selector: 'p' })).toBeTruthy();
    expect((removeButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not send a removal when the confirmation is declined', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const { removeButton } = await openStudent();
    fireEvent.click(removeButton);
    expect(state.rpc.mock.calls.some(([name]) => name === 'remove_org_student_tutor_pairing')).toBe(false);
  });

  it.each(['lessons', 'students'])('disables removal without %s editing permission', async (permission) => {
    if (permission === 'lessons') state.canEditLessons = false;
    else state.canEditStudents = false;
    const { removeButton } = await openStudent();
    expect((removeButton as HTMLButtonElement).disabled).toBe(true);
  });
});
