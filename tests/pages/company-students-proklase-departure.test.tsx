import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { PRO_KLASE_QA_ORG_ID } from '@/lib/marketMoney';

const state = vi.hoisted(() => ({
  students: [] as any[], from: vi.fn(), canEdit: true, failSave: false,
  logs: [] as RowQueryLog[], writes: [] as any[],
}));
vi.mock('@/lib/dataCache', () => ({
  getCached: (key: string) => key === 'company_students' ? { students: state.students, tutors: [], contractsByStudent: {} } : null,
  setCache: vi.fn(), invalidateCache: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
  from: state.from, rpc: async () => ({ data: [], error: null }),
} }));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => 'company' }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: null, profile: null, loading: false }) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOrgAdminAccess: () => ({
  loading: false, membership: { organizationId: 'b0a00000-7e57-4000-8000-000000000001' },
  isOwner: true, can: (permission: string) => permission !== 'students.edit' || state.canEdit,
  refresh: async () => {}, firstAllowedPath: () => '/company',
}) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({ loading: false, hasFeature: () => false }) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: unknown) => `€${value}` }) }));

const student = (id: string, full_name: string, fields: Record<string, unknown> = {}) => ({
  id, full_name, organization_id: PRO_KLASE_QA_ORG_ID, email: '', phone: null,
  payer_email: 'parent@example.test', tutor_id: null, tutor: null, linked_user_id: null,
  detached_at: null, invite_code: null, enrollment_status: 'active',
  created_at: '2026-10-01T00:00:00Z', ...fields,
});

beforeEach(() => {
  state.canEdit = true; state.failSave = false; state.logs = []; state.writes = [];
  state.students = [
    student('child-1', 'Test Child', { linked_user_id: 'account-1', tutor_id: 'tutor-1' }),
    student('child-2', 'Test Child', { linked_user_id: 'account-1', tutor_id: 'tutor-2' }),
    student('sibling', 'Test Sibling'),
    student('former', 'Former Child', { linked_user_id: 'account-2', enrollment_status: 'left' }),
    student('deleted', 'Deleted Child', { detached_at: '2026-10-02T00:00:00Z', enrollment_status: 'left' }),
  ];
  state.from.mockImplementation((table: string) => {
    const query = rowQuery(table, () => table === 'students' ? state.students : [], state.logs, state.writes);
    query.or = () => query;
    const log = state.logs.at(-1)!;
    const originalThen = query.then;
    query.then = (resolve: any, reject: any) => originalThen((result: any) => {
      if (log.operation === 'update') {
        if (state.failSave) return resolve({ data: [], error: null });
        state.students = state.students.map(row => result.data.find((saved: any) => saved.id === row.id) || row);
      }
      return resolve(result);
    }, reject);
    return query;
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ packages: [], plans: [], rows: [] }) })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const mount = async () => {
  await act(async () => { render(<MemoryRouter initialEntries={['/company/students']}><CompanyStudents /></MemoryRouter>); });
};
const chip = (label: string, count: number) => {
  const button = screen.getByText(label).closest('button')!;
  expect(within(button).getByText(String(count))).toBeTruthy();
  return button;
};

describe('Pro Klasė former client status', () => {
  it('shows former clients separately from unconfirmed accounts and the trash', async () => {
    await mount();
    expect(chip('Visi klientai', 2)).toBeTruthy();
    expect(chip('Aktyvūs klientai', 1)).toBeTruthy();
    expect(chip('Neaktyvūs klientai', 1)).toBeTruthy();
    fireEvent.click(chip('Išėję klientai', 1));
    expect(screen.getAllByText('Former Child').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Test Child')).toHaveLength(0);
    expect(screen.queryAllByText('Deleted Child')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Šiukšlinė' }));
    expect(screen.getAllByText('Deleted Child').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Former Child')).toHaveLength(0);
  });

  it('marks and returns the whole child across tutors without changing siblings, account links or history', async () => {
    await mount();
    fireEvent.click(screen.getAllByText('Test Child')[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pažymėti kaip išėjusį' }));
    await waitFor(() => expect(chip('Išėję klientai', 2)).toBeTruthy());
    expect(chip('Visi klientai', 1)).toBeTruthy();
    expect(state.students.filter(row => row.full_name === 'Test Child').every(row => row.enrollment_status === 'left' && !row.detached_at && row.linked_user_id === 'account-1' && row.tutor_id)).toBe(true);
    expect(state.students.find(row => row.id === 'sibling').enrollment_status).toBe('active');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Grąžinti į esamus klientus' }));
    await waitFor(() => expect(chip('Išėję klientai', 1)).toBeTruthy());
    expect(chip('Visi klientai', 2)).toBeTruthy();
    expect(state.writes).toEqual([
      { table: 'students', value: { enrollment_status: 'left' } },
      { table: 'students', value: { enrollment_status: 'active' } },
    ]);
  });

  it('keeps the status and count when the database saves no rows', async () => {
    state.failSave = true;
    await mount();
    fireEvent.click(screen.getAllByText('Test Child')[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pažymėti kaip išėjusį' }));
    await screen.findByText('Nepavyko išsaugoti kliento būsenos. Bandykite dar kartą.');
    expect(chip('Išėję klientai', 1)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Pažymėti kaip išėjusį' })).toBeTruthy();
  });

  it('shows the status without editing controls when students.edit is missing', async () => {
    state.canEdit = false;
    await mount();
    fireEvent.click(screen.getAllByText('Test Child')[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Pažymėti kaip išėjusį' })).toBeNull();
    expect(state.writes).toEqual([]);
  });
});
