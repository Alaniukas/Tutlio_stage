import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

type Row = Record<string, any>;

const testState = vi.hoisted(() => ({
  students: [] as Row[],
  sessions: [] as Row[],
  tutors: [
    { id: 'liepa', full_name: 'Liepa', email: 'liepa@example.test' },
    { id: 'vakare', full_name: 'Vakarė', email: 'vakare@example.test' },
  ],
}));

vi.mock('@/lib/dataCache', () => ({
  getCached: () => ({ students: testState.students, tutors: testState.tutors, contractsByStudent: {} }),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => 'company' }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'admin' } }) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({
  useOrgAdminAccess: () => ({
    membership: { organizationId: PRO_KLASE_ORG_ID, role: 'owner' },
    loading: false,
    isOwner: true,
    can: () => true,
  }),
}));
vi.mock('@/hooks/useOrgFeatures', () => ({
  useOrgFeatures: () => ({
    loading: false,
    hasFeature: (feature: string) => ['monthly_packages', 'student_card_booking', 'full_student_edit'].includes(feature),
  }),
}));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: unknown) => `€${value}` }) }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: async () => testState.tutors }));
vi.mock('@/components/company/StudentNotesCard', () => ({ default: () => null }));
vi.mock('@/components/company/StudentScheduleSummary', () => ({ default: () => null }));
vi.mock('@/components/FindTutorModal', () => ({
  default: ({ isOpen, primaryTutorId, onClose }: { isOpen: boolean; primaryTutorId?: string; onClose: () => void }) => isOpen ? (
    <div data-testid="current-booking-tutor" data-tutor-id={primaryTutorId}>
      <button onClick={onClose}>Uždaryti laiko paiešką</button>
    </div>
  ) : null,
}));
vi.mock('@/components/SendInvoiceModal', () => ({
  default: ({ isOpen, studentId, billingTutorId }: { isOpen: boolean; studentId?: string; billingTutorId?: string }) => isOpen ? (
    <div data-testid="current-billing-tutor" data-student-id={studentId} data-tutor-id={billingTutorId} />
  ) : null,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin' } } }),
      getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }),
    },
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      const ordering: Array<{ column: string; ascending: boolean }> = [];
      let limit = Number.POSITIVE_INFINITY;
      const results = () => {
        const source = table === 'students' ? testState.students
          : table === 'sessions' ? testState.sessions
          : table === 'organizations' ? [{
            id: PRO_KLASE_ORG_ID,
            features: {},
            enable_per_lesson: true,
            enable_monthly_billing: true,
            enable_prepaid_packages: false,
          }]
          : [];
        const data = source.filter((row) => filters.every((filter) => filter(row)));
        data.sort((left, right) => {
          for (const { column, ascending } of ordering) {
            if (left[column] === right[column]) continue;
            return (left[column] < right[column] ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        return { data: data.slice(0, limit), error: null, count: data.length };
      };
      const query: any = new Proxy({}, {
        get: (_target, method) => {
          if (method === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve(results()).then(resolve);
          if (method === 'single' || method === 'maybeSingle') return async () => ({ data: results().data[0] ?? null, error: null });
          if (method === 'eq' || method === 'is') return (column: string, value: unknown) => {
            filters.push((row) => (row[column] ?? null) === value);
            return query;
          };
          if (method === 'in') return (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; };
          if (method === 'gte') return (column: string, value: string) => { filters.push((row) => row[column] >= value); return query; };
          if (method === 'order') return (column: string, options?: { ascending?: boolean }) => {
            ordering.push({ column, ascending: options?.ascending !== false });
            return query;
          };
          if (method === 'limit') return (value: number) => { limit = value; return query; };
          return () => query;
        },
      });
      return query;
    },
  },
}));

function historyCard(topic: string) {
  const card = screen.getByText(topic).closest('.bg-card');
  if (!card) throw new Error(`Missing history card for ${topic}`);
  return within(card as HTMLElement);
}

function selectTutor(tutorName: string) {
  const dialog = screen.getByRole('dialog');
  const tutorNameElement = within(dialog).getAllByText(tutorName)
    .find((element) => Array.from(element.parentElement?.parentElement?.querySelectorAll('button') ?? [])
      .some((button) => button.textContent === 'Pasirinkti'));
  if (!tutorNameElement) throw new Error(`Missing assigned tutor row for ${tutorName}`);
  fireEvent.click(within(tutorNameElement.parentElement!.parentElement!).getByRole('button', { name: 'Pasirinkti' }));
}

describe('Pro Klasė student history across tutor assignments', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ packages: [] }) })));
    const common = {
      full_name: 'Austėja Testinė',
      email: 'shared-family@example.test',
      payer_email: 'parent@example.test',
      organization_id: PRO_KLASE_ORG_ID,
      linked_user_id: 'shared-family-login',
      parent_user_id: 'parent-account',
      grade: '6 klasė',
      detached_at: null,
    };
    testState.students = [
      { ...common, id: 'austeja-liepa', tutor_id: 'liepa', tutor: { full_name: 'Liepa' }, invite_code: 'LIEPA', created_at: '2026-10-01T08:00:00.000Z' },
      { ...common, id: 'austeja-vakare', tutor_id: 'vakare', tutor: { full_name: 'Vakarė' }, invite_code: 'VAKARE', created_at: '2026-09-20T08:00:00.000Z' },
      { ...common, id: 'sibling-liepa', full_name: 'Kamilė Testinė', tutor_id: 'liepa', tutor: { full_name: 'Liepa' }, invite_code: 'SIBLING', created_at: '2026-09-19T08:00:00.000Z' },
    ];
    const session = {
      status: 'completed',
      price: 25,
      student: { full_name: common.full_name },
      subject: { name: 'Matematika' },
    };
    testState.sessions = [
      { ...session, id: 'paid-trial', student_id: 'austeja-vakare', tutor_id: 'vakare', tutor: { full_name: 'Vakarė' }, topic: 'Rugsėjo 25 bandomoji', start_time: '2026-09-25T14:00:00.000Z', end_time: '2026-09-25T15:00:00.000Z', paid: true, payment_status: 'paid' },
      { ...session, id: 'unpaid-current', student_id: 'austeja-liepa', tutor_id: 'liepa', tutor: { full_name: 'Liepa' }, topic: 'Rugsėjo 26 pamoka', start_time: '2026-09-26T14:00:00.000Z', end_time: '2026-09-26T15:00:00.000Z', paid: false, payment_status: 'pending' },
      { ...session, id: 'sibling-history', student_id: 'sibling-liepa', tutor_id: 'liepa', tutor: { full_name: 'Liepa' }, topic: 'Kamilės atskira pamoka', start_time: '2026-09-30T14:00:00.000Z', end_time: '2026-09-30T15:00:00.000Z', paid: true, payment_status: 'paid' },
      { ...session, id: 'outside-six-months', student_id: 'austeja-vakare', tutor_id: 'vakare', tutor: { full_name: 'Vakarė' }, topic: 'Sena kovo pamoka', start_time: '2026-03-25T14:00:00.000Z', end_time: '2026-03-25T15:00:00.000Z', paid: true, payment_status: 'paid' },
    ];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the paid old-tutor trial under Liepa, excludes a sibling, and preserves current booking and billing selection', async () => {
    render(<MemoryRouter initialEntries={['/company/students']}><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText('Austėja Testinė')[0]);
    await screen.findByText('Rugsėjo 25 bandomoji');

    expect(historyCard('Rugsėjo 25 bandomoji').getByText('Vakarė')).toBeTruthy();
    expect(historyCard('Rugsėjo 25 bandomoji').getByText('Įvyko')).toBeTruthy();
    expect(historyCard('Rugsėjo 25 bandomoji').getByText('Apmokėta')).toBeTruthy();
    expect(historyCard('Rugsėjo 26 pamoka').getByText('Neapmokėta')).toBeTruthy();
    expect(screen.queryByText('Kamilės atskira pamoka')).toBeNull();
    expect(screen.queryByText('Sena kovo pamoka')).toBeNull();

    selectTutor('Vakarė');
    await screen.findByText('Rugsėjo 25 bandomoji');
    expect(historyCard('Rugsėjo 26 pamoka').getByText('Liepa')).toBeTruthy();
    selectTutor('Liepa');
    await screen.findByText('Rugsėjo 25 bandomoji');
    expect(historyCard('Rugsėjo 25 bandomoji').getByText('Vakarė')).toBeTruthy();
    expect(historyCard('Rugsėjo 25 bandomoji').getByText('Apmokėta')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ieškoti korepetitoriaus laiko' }));
    expect(screen.getByTestId('current-booking-tutor').getAttribute('data-tutor-id')).toBe('liepa');
    fireEvent.click(within(screen.getByTestId('current-booking-tutor')).getByText('Uždaryti laiko paiešką'));
    fireEvent.click(await screen.findByRole('button', { name: 'Siųsti mėnesinę sąskaitą (laikotarpis)' }));
    expect(screen.getByTestId('current-billing-tutor').getAttribute('data-tutor-id')).toBe('liepa');
    expect(screen.getByTestId('current-billing-tutor').getAttribute('data-student-id')).toBe('austeja-liepa');
    expect(historyCard('Rugsėjo 25 bandomoji').getByText('Vakarė')).toBeTruthy();
  });

  it('keeps the old paid trial when its student row no longer has an assigned tutor', async () => {
    const previousAssignment = testState.students.find((row) => row.id === 'austeja-vakare')!;
    previousAssignment.tutor_id = null;
    previousAssignment.tutor = null;

    render(<MemoryRouter initialEntries={['/company/students']}><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText('Austėja Testinė')[0]);
    await screen.findByText('Rugsėjo 25 bandomoji');
    selectTutor('Liepa');
    await screen.findByText('Rugsėjo 25 bandomoji');

    const trial = historyCard('Rugsėjo 25 bandomoji');
    expect(trial.getByText('Vakarė')).toBeTruthy();
    expect(trial.getByText('Apmokėta')).toBeTruthy();
    expect(trial.getByText('Įvyko')).toBeTruthy();
    expect(screen.queryByText('Kamilės atskira pamoka')).toBeNull();
    // The historical session's tutor must not become the current billing pair.
    fireEvent.click(await screen.findByRole('button', { name: 'Siųsti mėnesinę sąskaitą (laikotarpis)' }));
    expect(screen.getByTestId('current-billing-tutor').getAttribute('data-tutor-id')).toBe('liepa');
    expect(screen.getByTestId('current-billing-tutor').getAttribute('data-student-id')).toBe('austeja-liepa');
  });
});
