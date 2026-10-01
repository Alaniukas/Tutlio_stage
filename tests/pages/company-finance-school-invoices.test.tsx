import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyFinance from '@/pages/company/CompanyFinance';

type Row = Record<string, any>;

const testState = vi.hoisted(() => ({
  organizationId: 'school-org',
  entityType: 'school' as 'school' | 'company',
  features: { school_family_portal: true },
  students: [] as Row[],
  studentError: null as { message: string } | null,
  studentQueries: [] as Array<{ filters: Array<[string, unknown]>; range: [number, number] }>,
}));

vi.mock('@/lib/dataCache', () => ({ getCached: () => null, setCache: vi.fn(), invalidateCache: vi.fn() }));
vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({
    loading: false,
    hasFeature: () => false,
    features: testState.features,
    entityType: testState.entityType,
  }),
}));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: unknown) => `€${value}` }) }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: async () => [{ id: 'teacher', full_name: 'Mokytojas' }] }));
vi.mock('@/components/company/OrgPayerFeeSplitSettings', () => ({ default: () => null }));
vi.mock('@/components/school/SchoolMonthlyInvoiceDialog', () => ({
  default: ({ open, batch, organizationId, students }: { open: boolean; batch?: boolean; organizationId: string; students: Array<{ id: string; fullName: string; payerEmail?: string | null }> }) => open ? (
    <div role="dialog" aria-label="School invoice review" data-batch={String(batch)} data-organization={organizationId}>
      {students.map((student) => <span key={student.id} data-payer={student.payerEmail}>{student.fullName}</span>)}
    </div>
  ) : null,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const ordering: string[] = [];
      let range: [number, number] = [0, Number.POSITIVE_INFINITY];
      const result = () => {
        if (table === 'students') testState.studentQueries.push({ filters, range });
        const source = table === 'students' ? testState.students
          : table === 'organization_admins' ? [{ user_id: 'admin', organization_id: testState.organizationId }]
          : table === 'organizations' ? [{ id: testState.organizationId, enable_monthly_billing: true, features: testState.features }]
          : [];
        const rows = source.filter((row) => filters.every(([column, value]) => row[column] === value));
        rows.sort((a, b) => {
          for (const column of ordering) {
            const comparison = String(a[column]).localeCompare(String(b[column]));
            if (comparison) return comparison;
          }
          return 0;
        });
        return { data: rows.slice(range[0], range[1] + 1), error: table === 'students' ? testState.studentError : null };
      };
      const query: any = new Proxy({}, {
        get: (_target, method) => {
          if (method === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
          if (method === 'single' || method === 'maybeSingle') return async () => {
            const value = result();
            return { ...value, data: value.data[0] || null };
          };
          if (method === 'eq') return (column: string, value: unknown) => { filters.push([column, value]); return query; };
          if (method === 'order') return (column: string) => { ordering.push(column); return query; };
          if (method === 'range') return (start: number, end: number) => { range = [start, end]; return query; };
          return () => query;
        },
      });
      return query;
    },
  },
}));

function renderFinance() {
  return render(<MemoryRouter initialEntries={['/school/finance?tab=finance']}><CompanyFinance /></MemoryRouter>);
}

describe('School finance monthly invoice entry', () => {
  beforeEach(() => {
    testState.entityType = 'school';
    testState.features = { school_family_portal: true };
    testState.studentError = null;
    testState.studentQueries = [];
    testState.students = [
      { id: 'child', full_name: 'Testinė Austėja', organization_id: 'school-org', payer_email: 'parent@example.test' },
      { id: 'other-child', full_name: 'Svetimos mokyklos vaikas', organization_id: 'other-org', payer_email: 'other@example.test' },
    ];
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens the payer review with school students without sending invoices', async () => {
    renderFinance();
    fireEvent.click(await screen.findByRole('button', { name: 'Peržiūrėti mokėtojus' }));

    const dialog = await screen.findByRole('dialog', { name: 'School invoice review' });
    expect(dialog.getAttribute('data-batch')).toBe('true');
    expect(dialog.getAttribute('data-organization')).toBe('school-org');
    expect(within(dialog).getByText('Testinė Austėja').getAttribute('data-payer')).toBe('parent@example.test');
    expect(within(dialog).queryByText('Svetimos mokyklos vaikas')).toBeNull();
    expect(testState.studentQueries[0].filters).toContainEqual(['organization_id', 'school-org']);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Siųsti sąskaitas' })).toBeNull();
  });

  it('loads every page of school students for the review', async () => {
    testState.students = Array.from({ length: 501 }, (_, index) => ({
      id: `child-${index}`, full_name: `Mokinys ${String(index).padStart(3, '0')}`, organization_id: 'school-org', payer_email: `parent-${index}@example.test`,
    }));
    renderFinance();
    fireEvent.click(await screen.findByRole('button', { name: 'Peržiūrėti mokėtojus' }));

    const dialog = await screen.findByRole('dialog', { name: 'School invoice review' });
    expect(within(dialog).getByText('Mokinys 500')).toBeTruthy();
    expect(dialog.querySelectorAll('span')).toHaveLength(501);
    expect(testState.studentQueries.map((query) => query.range)).toEqual([[0, 499], [500, 999]]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the existing company workflow even with a school feature present', async () => {
    testState.entityType = 'company';
    renderFinance();
    fireEvent.click(await screen.findByRole('button', { name: 'Siųsti sąskaitas' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Peržiūrėti neapmokėtas pamokas' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'School invoice review' })).toBeNull();
    expect(testState.studentQueries).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not open a send flow when school student loading fails', async () => {
    testState.studentError = { message: 'Nepavyko įkelti mokinių.' };
    renderFinance();
    fireEvent.click(await screen.findByRole('button', { name: 'Peržiūrėti mokėtojus' }));

    await waitFor(() => expect(screen.getByText('Nepavyko įkelti mokinių.')).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
