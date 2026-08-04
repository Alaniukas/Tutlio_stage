import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';

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
        created_at: '2026-07-01T10:00:00.000Z',
      },
      {
        id: 's2',
        full_name: 'Petraitis Jonas',
        grade: '7',
        media_publicity_consent: 'disagree',
        created_at: '2026-07-02T10:00:00.000Z',
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
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: testState.from,
  },
}));

vi.mock('@/contexts/OrgEntityContext', () => ({
  useOrgEntityType: () => 'school',
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
            if (prop === 'then') return undefined;
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

    // Rows numbered (mobile + desktop render both → use getAllBy).
    expect(screen.getAllByText('1.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2.').length).toBeGreaterThan(0);

    // Filter dropdowns present with their "all" labels (school view only).
    expect(screen.getByText('Visos klasės')).toBeTruthy();
    expect(screen.getByText('Visos sutartys')).toBeTruthy();
    expect(screen.getByText('Visi atvaizdai')).toBeTruthy();
    expect(screen.getByText('Eksportuoti Excel')).toBeTruthy();

    // Plain search still narrows the list.
    fireEvent.change(screen.getByPlaceholderText(/Ieškoti|Search/i), { target: { value: 'Petraitis' } });
    expect(screen.queryAllByText(/Vėgėlė Ąžuolas/).length).toBe(0);
    expect(screen.getAllByText(/Petraitis Jonas/).length).toBeGreaterThan(0);
  });
});
