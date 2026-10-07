import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyContracts from '@/pages/company/CompanyContracts';

const state = vi.hoisted(() => ({
  from: vi.fn(),
  setCache: vi.fn(),
  getCached: vi.fn(),
  failures: new Set<string>(),
  contract: {
    id: 'contract-1',organization_id: 'org-1',student_id: 'student-1',template_id: null,
    filled_body: '',annual_fee: 300,signing_status: 'signed',created_at: '2026-10-01T10:00:00Z',
    student: {full_name: 'Loaded student',email: '',payer_name: 'Parent',payer_email: 'parent@example.test'},
  },
}));

vi.mock('@/lib/dataCache', () => ({getCached: state.getCached,setCache: state.setCache,invalidateCache: vi.fn()}));
vi.mock('@/lib/orgLookup', () => ({fetchOrganizationRow: vi.fn(async () => ({name: 'School',email: '',features: {}}))}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {getUser: vi.fn(async () => ({data: {user: {id: 'admin-1'}},error: null}))},
    from: state.from,
  },
}));

const cache = () => ({orgId: 'org-1',orgName: 'School',orgEmail: '',orgFeatures: {},templates: [],students: [],contracts: [state.contract]});
function renderPage() {
  return render(<MemoryRouter initialEntries={['/school/contracts']}><CompanyContracts /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.failures.clear();
  state.getCached.mockReturnValue(null);
  vi.spyOn(console,'error').mockImplementation(() => undefined);
  state.from.mockImplementation((table: string) => {
    const response = () => state.failures.has(table)
      ? {data: null,error: {message: 'canceling statement due to statement timeout'}}
      : {data: table==='organization_admins' ? {organization_id: 'org-1'} : table==='school_contracts' ? [state.contract] : [],error: null};
    const query: any = {
      select: () => query,eq: () => query,is: () => query,order: () => query,limit: () => query,
      maybeSingle: async () => response(),then: (resolve: any,reject: any) => Promise.resolve(response()).then(resolve,reject),
    };
    return query;
  });
});

describe('CompanyContracts load failures', () => {
  it.each(['school_contracts','school_contract_templates','students'])('shows a retry action instead of an empty list when %s fails', async table => {
    state.failures.add(table);
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain('Nepavyko įkelti sutarčių');
    expect(screen.queryByText(/Dar nėra sutarčių/)).toBeNull();
    expect(state.setCache).not.toHaveBeenCalled();
    state.failures.clear();
    fireEvent.click(screen.getByText('Bandyti iš naujo'));
    expect(await screen.findByText('Loaded student')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(state.setCache).toHaveBeenCalledWith('company_contracts',expect.objectContaining({contracts: [expect.objectContaining({id: 'contract-1'})]}));
  });

  it('retains cached contracts when a background refresh fails and clears the error after recovery', async () => {
    state.getCached.mockReturnValue(cache());
    state.failures.add('school_contracts');
    renderPage();
    expect(screen.getByText('Loaded student')).toBeTruthy();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect((await screen.findByRole('alert')).textContent).toContain('Nepavyko įkelti sutarčių');
    expect(screen.getByText('Loaded student')).toBeTruthy();
    expect(state.setCache).not.toHaveBeenCalled();
    state.failures.clear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Loaded student')).toBeTruthy();
  });
});
