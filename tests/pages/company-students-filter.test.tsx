import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { supabase } from '@/lib/supabase';

const studentBase = {
  email: '',
  phone: null,
  tutor_id: null,
  tutor: null,
  linked_user_id: null,
  detached_at: null,
  invite_code: null,
};

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    students: [
      {
        id: 's1',
        full_name: 'Vėgėlė Ąžuolas',
        grade: '5',
        media_publicity_consent: 'agree',
        enrollment_status: 'active',
        created_at: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 's2',
        full_name: 'Petraitis Jonas',
        grade: '7',
        media_publicity_consent: 'disagree',
        enrollment_status: 'active',
        created_at: '2026-07-02T10:00:00.000Z',
      },
      {
        id: 's3',
        full_name: 'Išėjęs Mokinys',
        grade: '6',
        media_publicity_consent: 'agree',
        enrollment_status: 'left',
        created_at: '2026-07-03T10:00:00.000Z',
      },
    ],
    tutors: [],
    contractsByStudent: {
      s1: { signing_status: 'signed', pdf_url: null, signed_contract_url: 'org/x.pdf' },
      s2: { signing_status: 'signed_by_school', pdf_url: 'org/y.pdf', signed_contract_url: null },
    },
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
      getUser: vi.fn(async () => ({ data: { user: null } })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
    from: testState.from,
  },
}));

vi.mock('@/contexts/OrgEntityContext', () => ({
  useOrgEntityType: () => 'school',
}));

vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({ user: null, profile: null, loading: false, refetchProfile: async () => {} }),
}));

vi.mock('@/contexts/OrgAdminAccessContext', () => ({
  useOrgAdminAccess: () => ({
    loading: false,
    membership: null,
    isOwner: true,
    can: () => true,
    refresh: async () => {},
    firstAllowedPath: () => '/school',
  }),
}));

vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({ loading: false, hasFeature: () => false }),
}));

vi.mock('@/hooks/useMarketMoney', () => ({
  useMarketMoney: () => ({ fmt: (n: unknown) => `€${n}` }),
}));

describe('CompanyStudents school list filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.cache.students = testState.cache.students.map((s: any) => ({ ...studentBase, ...s }));
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

  it('shows the count, numbers the rows and renders grade + contract filters', () => {
    render(
      <MemoryRouter initialEntries={['/school/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    // Count next to the title.
    expect(screen.getByText('(2)')).toBeTruthy();
    expect(supabase.auth.getUser).not.toHaveBeenCalled();

    // Rows numbered (mobile + desktop render both → use getAllBy).
    expect(screen.getAllByText('1.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2.').length).toBeGreaterThan(0);

    // Filter dropdowns present with their "all" labels (school view only).
    expect(screen.getByText('Aktyvūs')).toBeTruthy();
    expect(screen.getByText('Visos klasės')).toBeTruthy();
    expect(screen.getByText('Visos sutartys')).toBeTruthy();
    expect(screen.getByText('Visi atvaizdai')).toBeTruthy();
    expect(screen.getByText('Eksportuoti į „Excel“')).toBeTruthy();

    // Plain search still narrows the list.
    fireEvent.change(screen.getByPlaceholderText(/Ieškoti|Search/i), { target: { value: 'Petraitis' } });
    expect(screen.queryAllByText(/Vėgėlė Ąžuolas/).length).toBe(0);
    expect(screen.getAllByText(/Petraitis Jonas/).length).toBeGreaterThan(0);
    // Default enrollment filter hides left students.
    expect(screen.queryAllByText(/Išėjęs Mokinys/).length).toBe(0);
  });

  it('opens student info as a constrained two-column student/payer layout', async () => {
    testState.cache.students = testState.cache.students.map((s: any) => ({
      ...studentBase,
      ...s,
      payer_name: 'Tėvas Jonas',
      payer_email: 'parent@example.com',
      payer_phone: '+37060000000',
      invite_code: 'ABC123',
    }));

    render(
      <MemoryRouter initialEntries={['/school/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByText(/Vėgėlė Ąžuolas/)[0]);

    expect(await screen.findByText('Mokinio informacija')).toBeTruthy();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.className).toMatch(/max-w-3xl/);
    expect(dialog?.className).not.toMatch(/95vw/);
    expect(dialog?.className).not.toMatch(/minmax\(16rem/);

    const payerGrid = [...(dialog?.querySelectorAll('div') ?? [])].find((el) =>
      el.className.includes('sm:grid-cols-2') && el.textContent?.includes('Mokinys') && el.textContent?.includes('Mokėtojas'),
    );
    expect(payerGrid).toBeTruthy();
    expect(payerGrid?.className).toMatch(/grid-cols-1/);
    expect(screen.getByText('Tėvas Jonas')).toBeTruthy();
  });
});
