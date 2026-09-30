import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  studentInserts: [] as Array<Record<string, unknown>>,
  selectedSlots: null as Array<{
    tutorId: string; tutorName: string; subjectId: string; subjectName: string;
    start: Date; end: Date; durationMinutes: number;
  }> | null,
  sendEmailDetailed: vi.fn(),
  createSession: vi.fn(),
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
    rpc: testState.rpc,
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

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async () => true),
  sendEmailDetailed: testState.sendEmailDetailed,
}));

vi.mock('@/lib/orgVisibleTutors', () => ({
  getOrgVisibleTutors: vi.fn(async () => []),
}));

vi.mock('@/pages/company/orgAdminSessionCreate', () => ({
  runOrgAdminCreateSession: testState.createSession,
}));

vi.mock('@/components/FindTutorModal', () => ({
  default: ({ isOpen, frequencyEnabled, confirmSelection, onConfirmSlots }: {
    isOpen: boolean;
    frequencyEnabled?: boolean;
    confirmSelection?: boolean;
    onConfirmSlots?: (slots: Array<{
      tutorId: string;
      tutorName: string;
      subjectId: string;
      subjectName: string;
      start: Date;
      end: Date;
      durationMinutes: number;
    }>) => void;
  }) => isOpen ? (
    <div
      data-testid="proklase-availability-search"
      data-frequency={String(Boolean(frequencyEnabled))}
      data-confirm-selection={String(Boolean(confirmSelection))}
    >
      <button type="button" onClick={() => onConfirmSlots?.(testState.selectedSlots ?? [{
        tutorId: 'tutor-second-child',
        tutorName: 'Antras Mokytojas',
        subjectId: 'math-second-child',
        subjectName: 'Matematika',
        start: new Date('2026-10-01T15:00:00.000Z'),
        end: new Date('2026-10-01T16:00:00.000Z'),
        durationMinutes: 60,
      }])}>
        Pasirinkti laisvą laiką
      </button>
    </div>
  ) : null,
}));

vi.mock('@/components/ui/date-input', () => ({
  DateInput: ({ id, value, disabled, onChange }: {
    id: string; value: string; disabled?: boolean;
    onChange: (event: { target: { value: string } }) => void;
  }) => <input id={id} type="date" value={value} disabled={disabled} onChange={onChange} />,
}));

vi.mock('@/components/company/PickedAvailabilityTimeEditor', () => ({
  default: ({ tutorName, subjectName }: { tutorName: string; subjectName: string }) => (
    <div data-testid="picked-availability-lesson">{tutorName} · {subjectName}</div>
  ),
}));

function mockStudentSaveQueries() {
  testState.from.mockImplementation((table: string) => {
    let insertedStudent: Record<string, unknown> | null = null;
    const query: any = new Proxy({}, {
      get: (_target, prop) => {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void) => resolve({ data: [], error: null, count: 0 });
        }
        if (prop === 'insert') {
          return (payload: Record<string, unknown>) => {
            if (table === 'students') {
              insertedStudent = payload;
              testState.studentInserts.push(payload);
            }
            return query;
          };
        }
        if (prop === 'single') {
          return async () => ({
            data: insertedStudent
              ? {
                  id: `created-child-${testState.studentInserts.length}`,
                  tutor_id: insertedStudent.tutor_id ?? null,
                  invite_code: insertedStudent.invite_code,
                }
              : null,
            error: null,
          });
        }
        if (prop === 'maybeSingle') {
          return async () => ({
            data: table === 'subjects'
              ? {
                  id: 'math-second-child',
                  name: 'Matematika',
                  price: 25,
                  duration_minutes: 60,
                  is_group: false,
                  max_students: 1,
                  meeting_link: null,
                }
              : table === 'organizations' ? { features: {} } : null,
            error: null,
          });
        }
        return () => query;
      },
    });
    return query;
  });
}

describe('CompanyStudents Pro Klasė list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.studentInserts.length = 0;
    testState.selectedSlots = null;
    testState.rpc.mockResolvedValue({ data: [], error: null });
    testState.sendEmailDetailed.mockResolvedValue({ ok: true, skipped: false });
    testState.createSession.mockResolvedValue({ createdSessionIds: ['created-lesson'] });
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
    fireEvent.click(screen.getByRole('button', { name: /^Aktyvūs klientai/ }));
    expect(screen.queryByText(/Pro Klasė Mokinys/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Aktyvūs klientai/ }));
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

  it('shows separate private notes, contact date and tutor comment in the add-student dialog', () => {
    render(
      <MemoryRouter initialEntries={['/company/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));

    expect(screen.getByText('Pridėti naują mokinį')).toBeTruthy();
    expect(screen.getByLabelText('Administracijos komentarai')).toBeTruthy();
    expect(screen.getByLabelText('Paskutinį kartą kontaktuota')).toBeTruthy();
    expect(screen.getByLabelText('Komentaras korepetitoriui')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Rodyti komentarą korepetitoriui/i })).toBeNull();
    expect(screen.getByPlaceholderText('Parašykite komentarą apie šį mokinį...')).toBeTruthy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows separate student and parent phone numbers for every company organization', () => {
    render(
      <MemoryRouter initialEntries={['/company/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));

    expect(screen.getByText('Telefonas')).toBeTruthy();
    expect(screen.getByText('Tėvų / globėjų kontaktai · Telefonas')).toBeTruthy();
  });

  it('offers managed parent and child accounts, including siblings on one parent email', () => {
    render(
      <MemoryRouter initialEntries={['/company/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));

    expect(screen.getByRole('button', { name: /Sukurti paskyras iš karto/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    expect(screen.getByText('Vaikas Nr. 1')).toBeTruthy();
    expect(screen.getByText('Vaikas Nr. 2')).toBeTruthy();
  });

  it('keeps a second child and their details when switching who receives invitations', () => {
    render(
      <MemoryRouter initialEntries={['/company/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    const secondChildName = screen.getAllByPlaceholderText('Jonas Jonaitis')[1] as HTMLInputElement;
    fireEvent.change(secondChildName, { target: { value: 'Antras Vaikas' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tik mokinį' }));
    expect(screen.getByText('Vaikas Nr. 2')).toBeTruthy();
    expect((screen.getAllByPlaceholderText('Jonas Jonaitis')[1] as HTMLInputElement).value).toBe('Antras Vaikas');
    expect(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mokinį ir tėvą' }));
    expect(screen.getByText('Vaikas Nr. 2')).toBeTruthy();
    expect((screen.getAllByPlaceholderText('Jonas Jonaitis')[1] as HTMLInputElement).value).toBe('Antras Vaikas');
  });

  it('keeps Pro Klasė availability search accessible for a family with multiple children', () => {
    render(
      <MemoryRouter initialEntries={['/company/students']}>
        <CompanyStudents />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tik mokinį' }));

    const secondChild = screen.getByTestId('additional-child-2');
    expect(within(secondChild).getByText('Vaikas Nr. 2')).toBeTruthy();
    fireEvent.click(within(secondChild).getByRole('button', { name: 'Ieškoti pagal laisvą laiką' }));
    const search = screen.getByTestId('proklase-availability-search');
    expect(search.getAttribute('data-frequency')).toBe('true');
    expect(search.getAttribute('data-confirm-selection')).toBe('true');
    fireEvent.click(within(search).getByText('Pasirinkti laisvą laiką'));

    expect(screen.getByText('Vaikas Nr. 1')).toBeTruthy();
    expect(within(secondChild).getByTestId('picked-availability-lesson').textContent)
      .toBe('Antras Mokytojas · Matematika');
    expect(screen.getAllByTestId('picked-availability-lesson')).toHaveLength(1);
  });

  it('saves two children, sends one student invite to each, and books the second child\'s picked lesson', async () => {
    mockStudentSaveQueries();

    render(<MemoryRouter initialEntries={['/company/students']}><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    const names = screen.getAllByPlaceholderText('Jonas Jonaitis');
    fireEvent.change(names[0], { target: { value: 'Pirmas Vaikas' } });
    fireEvent.change(names[1], { target: { value: 'Antras Vaikas' } });
    const emails = screen.getAllByPlaceholderText('jonas@example.com');
    fireEvent.change(emails[0], { target: { value: 'pirmas@example.test' } });
    fireEvent.change(emails[1], { target: { value: 'antras@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tik mokinį' }));

    const secondChild = screen.getByTestId('additional-child-2');
    fireEvent.click(within(secondChild).getByRole('button', { name: 'Ieškoti pagal laisvą laiką' }));
    fireEvent.click(within(screen.getByTestId('proklase-availability-search')).getByText('Pasirinkti laisvą laiką'));
    const notifyStudent = screen.getByRole('checkbox', { name: 'Informuoti mokinį el. paštu' }) as HTMLInputElement;
    expect(notifyStudent.checked).toBe(true);
    fireEvent.click(notifyStudent);
    expect(notifyStudent.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti', exact: true }));

    await waitFor(() => expect(testState.sendEmailDetailed).toHaveBeenCalledTimes(2));
    expect(testState.studentInserts).toHaveLength(2);
    expect(testState.studentInserts.map((row) => row.full_name)).toEqual(['Pirmas Vaikas', 'Antras Vaikas']);
    expect(testState.studentInserts.map((row) => row.email)).toEqual(['pirmas@example.test', 'antras@example.test']);
    expect(testState.sendEmailDetailed.mock.calls.map(([payload]) => payload)).toEqual([
      expect.objectContaining({
        type: 'invite_email',
        to: 'pirmas@example.test',
        data: expect.objectContaining({ studentName: 'Pirmas Vaikas' }),
      }),
      expect.objectContaining({
        type: 'invite_email',
        to: 'antras@example.test',
        data: expect.objectContaining({ studentName: 'Antras Vaikas' }),
      }),
    ]);
    expect(testState.createSession).toHaveBeenCalledOnce();
    expect(testState.createSession).toHaveBeenCalledWith(expect.objectContaining({
      createStudentId: 'created-child-2',
      createTutorId: 'tutor-second-child',
      createSubjectId: 'math-second-child',
      suppressClientBookingEmails: true,
    }));
  });

  it('invites both students and creates a parent invite for each child', async () => {
    mockStudentSaveQueries();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ sent: 1 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter initialEntries={['/company/students']}><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    const names = screen.getAllByPlaceholderText('Jonas Jonaitis');
    fireEvent.change(names[0], { target: { value: 'Pirmas Vaikas' } });
    fireEvent.change(names[1], { target: { value: 'Antras Vaikas' } });
    const emails = screen.getAllByPlaceholderText('jonas@example.com');
    fireEvent.change(emails[0], { target: { value: 'pirmas@example.test' } });
    fireEvent.change(emails[1], { target: { value: 'antras@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('Vardenis Pavardenis'), {
      target: { value: 'Vaikų Tėvas' },
    });
    fireEvent.change(screen.getByPlaceholderText('tevas@example.com'), {
      target: { value: 'tevas@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mokinį ir tėvą' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti', exact: true }));

    const parentCalls = () => fetchMock.mock.calls.filter(([url]) =>
      url === '/api/parent-create-invites-for-student');
    await waitFor(() => expect(parentCalls()).toHaveLength(2));
    expect(testState.studentInserts).toHaveLength(2);
    expect(parentCalls().map(([, init]) => JSON.parse(String(init?.body)).studentId))
      .toEqual(['created-child-1', 'created-child-2']);
    expect(testState.sendEmailDetailed).toHaveBeenCalledTimes(2);
    expect(testState.sendEmailDetailed.mock.calls.map(([payload]) => payload.to))
      .toEqual(['pirmas@example.test', 'antras@example.test']);
    expect(testState.sendEmailDetailed.mock.calls.every(([payload]) => payload.type === 'invite_email'))
      .toBe(true);
  });

  it('does not mark a failed meeting-link write as saved and requests the persisted value', async () => {
    const updates = vi.fn();
    const selections = vi.fn();
    testState.from.mockImplementation(() => {
      let writing = false;
      const query: any = new Proxy({}, {
        get: (_target, prop) => {
          if (prop === 'then') {
            return (resolve: (value: unknown) => void) => resolve(writing
              ? { data: null, error: { message: 'denied' } }
              : { data: [], error: null, count: 0 });
          }
          return (...args: unknown[]) => {
            if (prop === 'update') {
              writing = true;
              updates(...args);
            }
            if (prop === 'select' && writing) selections(...args);
            return query;
          };
        },
      });
      return query;
    });

    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);
    const input = screen.getByPlaceholderText('https://meet.google.com/...');
    fireEvent.change(input, { target: { value: 'https://meet.google.com/test-link' } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText('Klaida.')).toBeTruthy());
    expect(selections).toHaveBeenCalledWith('personal_meeting_link');
    expect((input as HTMLInputElement).value).toBe('');
    fireEvent.blur(input);
    await waitFor(() => expect(updates).toHaveBeenCalledOnce());
  });

  it('adds a second child from an existing card and creates an account for the same parent', async () => {
    const existing = testState.cache.students[0] as Record<string, unknown>;
    existing.payer_name = 'Renata';
    existing.payer_email = 'renata@example.test';
    existing.payer_phone = '+37060000000';
    mockStudentSaveQueries();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        parent: { email: 'renata@example.test', userId: 'parent-1', created: false, reused: true, emailSent: false },
        student: { email: 'toma@example.test', userId: 'student-toma', created: true, emailSent: true, password: 'temp' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    fireEvent.change(screen.getByTestId('sibling-child-name'), { target: { value: 'Toma' } });
    fireEvent.change(screen.getByPlaceholderText('jonas@example.com'), { target: { value: 'toma@example.test' } });
    fireEvent.click(screen.getByTestId('save-existing-sibling'));

    await waitFor(() => expect(testState.studentInserts).toHaveLength(1));
    expect(testState.studentInserts[0]).toMatchObject({
      full_name: 'Toma',
      email: 'toma@example.test',
      payer_name: 'Renata',
      payer_email: 'renata@example.test',
      payment_payer: 'parent',
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const provisionCall = fetchMock.mock.calls.find(([url]) => url === '/api/mv-provision-family-accounts');
    expect(provisionCall).toBeTruthy();
    expect(JSON.parse(String(provisionCall?.[1]?.body))).toMatchObject({
      parentName: 'Renata',
      parentEmail: 'renata@example.test',
      studentFullName: 'Toma',
      studentEmail: 'toma@example.test',
      scope: 'student',
    });
  });

  it('adds a sibling with only a student email when the card has no parent inbox', async () => {
    const existing = testState.cache.students[0] as Record<string, unknown>;
    existing.payer_name = '';
    existing.payer_email = '';
    existing.parent_user_id = 'parent-1';
    mockStudentSaveQueries();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        student: { email: 'test@test.lt', userId: 'student-test1', created: true, emailSent: true, password: 'temp' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    fireEvent.change(screen.getByTestId('sibling-child-name'), { target: { value: 'test1' } });
    fireEvent.change(screen.getByPlaceholderText('jonas@example.com'), { target: { value: 'test@test.lt' } });
    fireEvent.click(screen.getByTestId('save-existing-sibling'));

    await waitFor(() => expect(testState.studentInserts).toHaveLength(1));
    expect(testState.studentInserts[0]).toMatchObject({
      full_name: 'test1',
      email: 'test@test.lt',
      payer_email: null,
      parent_user_id: 'parent-1',
      payment_payer: 'self',
    });
    const provisionCall = fetchMock.mock.calls.find(([url]) => url === '/api/mv-provision-family-accounts');
    expect(JSON.parse(String(provisionCall?.[1]?.body))).toMatchObject({
      studentFullName: 'test1',
      studentEmail: 'test@test.lt',
      scope: 'student',
    });
  });

  it('shows create parent account action when only the parent account is missing', async () => {
    const existing = testState.cache.students[0] as Record<string, unknown>;
    existing.linked_user_id = 'student-existing';
    existing.parent_user_id = null;
    existing.payer_name = 'Renata';
    existing.payer_email = 'renata@example.test';

    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);

    expect(screen.getByRole('button', { name: 'Sukurti tėvų paskyrą' })).toBeTruthy();
  });

  it('does not show a separate student account button on the card', async () => {
    const existing = testState.cache.students[0] as Record<string, unknown>;
    existing.linked_user_id = null;
    existing.parent_user_id = 'parent-1';
    existing.payer_name = 'Renata';
    existing.payer_email = 'renata@example.test';

    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);

    expect(screen.queryByRole('button', { name: 'Sukurti mokinio paskyrą' })).toBeNull();
  });

  it('saves private notes through the RPC for every assigned tutor row and inserts only the shared comment', async () => {
    mockStudentSaveQueries();
    testState.selectedSlots = ['first', 'second'].map((suffix) => ({
      tutorId: `tutor-${suffix}`, tutorName: `Mokytojas ${suffix}`,
      subjectId: 'math-second-child', subjectName: 'Matematika',
      start: new Date('2026-10-01T15:00:00.000Z'), end: new Date('2026-10-01T16:00:00.000Z'), durationMinutes: 60,
    }));
    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));
    fireEvent.change(screen.getByPlaceholderText('Jonas Jonaitis'), { target: { value: 'Ieva' } });
    fireEvent.change(screen.getByPlaceholderText('jonas@example.com'), { target: { value: 'ieva@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tik mokinį' }));
    fireEvent.change(screen.getByLabelText('Administracijos komentarai'), { target: { value: '  Privati administracijos informacija  ' } });
    fireEvent.change(screen.getByLabelText('Paskutinį kartą kontaktuota'), { target: { value: '2026-09-29' } });
    fireEvent.change(screen.getByLabelText('Komentaras korepetitoriui'), { target: { value: '  Sutelkti dėmesį į trupmenas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ieškoti pagal laisvą laiką' }));
    fireEvent.click(screen.getByText('Pasirinkti laisvą laiką'));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti', exact: true }));

    await waitFor(() => expect(testState.rpc).toHaveBeenCalledWith('save_student_notes', {
      p_student_ids: ['created-child-1', 'created-child-2'],
      p_admin_comment: 'Privati administracijos informacija', p_last_contacted_at: '2026-09-29',
      p_tutor_comment: 'Sutelkti dėmesį į trupmenas',
    }));
    expect(testState.studentInserts).toHaveLength(2);
    expect(testState.studentInserts.map((row) => row.tutor_id)).toEqual(['tutor-first', 'tutor-second']);
    for (const row of testState.studentInserts) {
      expect(row).toMatchObject({ admin_comment: 'Sutelkti dėmesį į trupmenas', admin_comment_visible_to_tutor: true });
      expect(row).not.toHaveProperty('last_contacted_at');
      expect(JSON.stringify(row)).not.toContain('Privati administracijos informacija');
    }
  });

  it('keeps notes and last-contact dates separate for children created together', async () => {
    mockStudentSaveQueries();
    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    const names = screen.getAllByPlaceholderText('Jonas Jonaitis');
    const emails = screen.getAllByPlaceholderText('jonas@example.com');
    for (const [index, name] of ['Pirmas', 'Antras'].entries()) {
      fireEvent.change(names[index], { target: { value: name } });
      fireEvent.change(emails[index], { target: { value: `${name.toLowerCase()}@example.test` } });
      fireEvent.change(screen.getAllByLabelText('Administracijos komentarai')[index], { target: { value: `${name} privatus` } });
      fireEvent.change(screen.getAllByLabelText('Paskutinį kartą kontaktuota')[index], { target: { value: `2026-09-${28 + index}` } });
      fireEvent.change(screen.getAllByLabelText('Komentaras korepetitoriui')[index], { target: { value: `${name} mokytojui` } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Tik mokinį' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti', exact: true }));

    await waitFor(() => expect(testState.rpc).toHaveBeenCalledTimes(2));
    expect(testState.rpc.mock.calls).toEqual([
      ['save_student_notes', { p_student_ids: ['created-child-1'], p_admin_comment: 'Pirmas privatus', p_last_contacted_at: '2026-09-28', p_tutor_comment: 'Pirmas mokytojui' }],
      ['save_student_notes', { p_student_ids: ['created-child-2'], p_admin_comment: 'Antras privatus', p_last_contacted_at: '2026-09-29', p_tutor_comment: 'Antras mokytojui' }],
    ]);
    expect(testState.studentInserts.map((row) => row.admin_comment)).toEqual(['Pirmas mokytojui', 'Antras mokytojui']);
    expect(testState.studentInserts.every((row) => !JSON.stringify(row).includes('privatus'))).toBe(true);
  });

  it('saves a sibling’s private notes separately when adding them from an existing student card', async () => {
    const existing = testState.cache.students[0] as Record<string, unknown>;
    Object.assign(existing, { payer_name: 'Renata', payer_email: 'renata@example.test', parent_user_id: 'parent-1' });
    mockStudentSaveQueries();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) })));
    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getAllByText(/Pro Klasė Mokinys/)[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti dar vieną vaiką' }));
    fireEvent.change(screen.getByTestId('sibling-child-name'), { target: { value: 'Toma' } });
    fireEvent.change(screen.getByPlaceholderText('jonas@example.com'), { target: { value: 'toma@example.test' } });
    const sibling = screen.getByTestId('sibling-child-name').closest('[role="dialog"]') as HTMLElement;
    fireEvent.change(within(sibling).getByLabelText('Administracijos komentarai'), { target: { value: 'Tik Tomos administracijai' } });
    fireEvent.change(within(sibling).getByLabelText('Paskutinį kartą kontaktuota'), { target: { value: '2026-09-27' } });
    fireEvent.change(within(sibling).getByLabelText('Komentaras korepetitoriui'), { target: { value: 'Tomai reikia kartojimo' } });
    fireEvent.click(screen.getByTestId('save-existing-sibling'));

    await waitFor(() => expect(testState.rpc).toHaveBeenCalledWith('save_student_notes', {
      p_student_ids: ['created-child-1'], p_admin_comment: 'Tik Tomos administracijai',
      p_last_contacted_at: '2026-09-27', p_tutor_comment: 'Tomai reikia kartojimo',
    }));
    expect(testState.studentInserts[0]).toMatchObject({ admin_comment: 'Tomai reikia kartojimo', admin_comment_visible_to_tutor: true });
    expect(JSON.stringify(testState.studentInserts[0])).not.toContain('Tik Tomos administracijai');
    expect(testState.rpc.mock.calls.every(([, payload]) => !payload.p_student_ids?.includes('pk-1'))).toBe(true);
  });

  it('preserves the failed notes draft for retry without creating another student or sending duplicate invitations', async () => {
    mockStudentSaveQueries();
    testState.rpc.mockResolvedValueOnce({ data: null, error: { message: 'notes unavailable' } });
    render(<MemoryRouter><CompanyStudents /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Pridėti klientą/i }));
    fireEvent.change(screen.getByPlaceholderText('Jonas Jonaitis'), { target: { value: 'Ieva' } });
    fireEvent.change(screen.getByPlaceholderText('jonas@example.com'), { target: { value: 'ieva@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tik mokinį' }));
    fireEvent.change(screen.getByLabelText('Administracijos komentarai'), { target: { value: 'Išsaugoti šį privatų juodraštį' } });
    fireEvent.change(screen.getByLabelText('Paskutinį kartą kontaktuota'), { target: { value: '2026-09-29' } });
    fireEvent.change(screen.getByLabelText('Komentaras korepetitoriui'), { target: { value: 'Kartoti prieš testą' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pridėti', exact: true }));

    const retry = await screen.findByRole('button', { name: 'Bandyti dar kartą' });
    await waitFor(() => expect(testState.sendEmailDetailed).toHaveBeenCalledOnce());
    expect(testState.studentInserts).toHaveLength(1);
    fireEvent.click(retry);
    await waitFor(() => expect(testState.rpc).toHaveBeenCalledTimes(2));
    expect(testState.rpc.mock.calls[1]).toEqual(testState.rpc.mock.calls[0]);
    expect(testState.rpc.mock.calls[1][1]).toMatchObject({
      p_student_ids: ['created-child-1'], p_admin_comment: 'Išsaugoti šį privatų juodraštį',
      p_last_contacted_at: '2026-09-29', p_tutor_comment: 'Kartoti prieš testą',
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bandyti dar kartą' })).toBeNull());
    expect(testState.studentInserts).toHaveLength(1);
    expect(testState.sendEmailDetailed).toHaveBeenCalledOnce();
  });
});
