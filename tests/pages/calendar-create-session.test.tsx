import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarPage from '@/pages/Calendar';
import { invalidateCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  templates: [] as Array<Record<string, any>>,
  failTemplateAt: 0,
  templateAttempts: 0,
  sessionError: false,
  conflictError: false,
  cleanupError: false,
  availabilityError: false,
  expired: false,
  authThrows: false,
  emptySessionResponse: false,
}));
vi.mock('@/lib/i18n', async () => {
  const { lt } = await import('date-fns/locale');
  const { lt: dictionary } = await import('@/lib/i18n/lt');
  const t = (key: string) => (dictionary as Record<string, string>)[key] || key;
  return { useTranslation: () => ({ t, locale: 'lt', dateFnsLocale: lt }) };
});
vi.mock('@/contexts/UserContext', () => {
  const user = { id: 'tutor', email: 'tutor@example.com' };
  const profile = { id: user.id, organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1' };
  return { useUser: () => ({ user, profile }) };
});
vi.mock('@/hooks/useOrgTutorPolicy', () => ({ useOrgTutorPolicy: () => ({
  loading: false, isOrgTutor: true, canCreateSessions: true, hideMoney: true,
  orgUsesLicenses: false, hasActiveLicense: true,
}) }));
vi.mock('@/hooks/useOrgFeatures', () => {
  const hasFeature = () => false;
  return { useOrgFeatures: () => ({ loading: false, entityType: 'company',
    organizationId: '3422031d-6e21-424d-980b-35a9c6d7b8f1', hasFeature, contactVisibility: {},
  }) };
});
vi.mock('@/hooks/useStudentRegistrationStatus', () => ({
  useStudentRegistrationStatus: () => ({ enabled: false, byStudentId: new Map() }),
}));
vi.mock('@/lib/preload', () => {
  const profile = { id: 'tutor', full_name: 'Tutor', organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1' };
  const empty = async () => ({ data: [], error: null });
  return {
    dedupeAuthGetUser: async () => ({ id: 'tutor' }),
    tutorSidebarProfileDeduped: async () => ({ data: profile, error: null }),
    tutorCalendarFallbackProfileDeduped: async () => ({ data: profile, error: null }),
    orgSuspensionRowDeduped: async () => ({ data: { features: {} }, error: null }),
    organizationSubjectTemplatesDeduped: async () => ({ data: { org_subject_templates: [] }, error: null }),
    tutorStudentsRowsDeduped: async () => ({ data: [{ id: 'student', full_name: 'Ada', email: 'ada@example.com' }], error: null }),
    tutorSubjectsCalendarDeduped: async () => ({ data: [{ id: 'math', name: 'Math', is_group: false, price: 25, duration_minutes: 60 }], error: null }),
    tutorStudentPricingAllDeduped: empty, tutorSubjectPricesRowsAllDeduped: empty,
    tutorAvailabilityAllRowsDeduped: empty,
  };
});
vi.mock('@/components/Layout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/AvailabilityManager', () => ({ default: () => null }));
vi.mock('@/components/TimeSpinner', () => ({
  default: () => null, CompactTimeSelect: () => null,
  DateTimeSpinner: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
    <input aria-label="Lesson time" type="datetime-local" value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('react-big-calendar', () => ({
  dateFnsLocalizer: () => ({}), Views: { WEEK: 'week', DAY: 'day', MONTH: 'month', AGENDA: 'agenda' },
  Calendar: ({ events }: { events: Array<{ id: string }> }) =>
    <div>{events.map(event => <output key={event.id} data-testid={`lesson-${event.id}`}>{event.id}</output>)}</div>,
}));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => {
    if (state.authThrows) throw new Error('auth connection failed');
    return { data: { user: state.expired ? null : { id: 'tutor' } }, error: null };
  } },
  rpc: async () => ({ data: [], error: null }),
  from: (table: string) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let inserted: Array<Record<string, any>> | null = null;
    let deleted = false;
    let selection = '';
    const rows = () => {
      if (table === 'profiles') return [{ id: 'tutor', full_name: 'Tutor', organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1' }];
      if (table === 'organizations') return [{ id: '3422031d-6e21-424d-980b-35a9c6d7b8f1', features: {} }];
      if (table === 'students') return [{ id: 'student', full_name: 'Ada', email: 'ada@example.com' }];
      if (table === 'sessions') return state.rows;
      if (table === 'recurring_individual_sessions') return state.templates;
      return [];
    };
    const execute = async () => {
      const failed = () => ({ data: null, error: { code: '42501', message: 'diagnostic database error' } });
      if (table === 'availability' && state.availabilityError) throw new Error('availability connection failed');
      if (table === 'sessions' && !inserted && selection === 'id, start_time, end_time' && state.conflictError) return failed();
      if (deleted) {
        if (state.cleanupError) return failed();
        state.templates = state.templates.filter(row => !filters.every(filter => filter(row)));
        return { data: null, error: null };
      }
      if (inserted) {
        if (table === 'recurring_individual_sessions' && ++state.templateAttempts === state.failTemplateAt) return failed();
        if (table === 'sessions' && state.sessionError) return failed();
        if (table === 'sessions' && state.emptySessionResponse) return { data: [], error: null };
        const saved = inserted.map((row, index) => ({ ...row, id: `${table}-${rows().length + index}` }));
        rows().push(...saved);
        return { data: structuredClone(saved), error: null };
      }
      return { data: structuredClone(rows().filter(row => filters.every(filter => filter(row)))), error: null };
    };
    const query = {
      select: (value: string) => { selection = value; return query; }, order: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      is: () => query, not: () => query, gt: () => query, lt: () => query,
      gte: () => query, lte: () => query, limit: () => query, range: () => query,
      insert: (value: Record<string, any> | Array<Record<string, any>>) => { inserted = Array.isArray(value) ? value : [value]; return query; },
      delete: () => { deleted = true; return query; },
      single: async () => { const result = await execute(); return { ...result, data: result.data?.[0] ?? null }; },
      maybeSingle: async () => { const result = await execute(); return { ...result, data: result.data?.[0] ?? null }; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
    };
    return query;
  },
} }));

beforeEach(() => {
  invalidateCache(); localStorage.clear();
  Object.assign(state, { rows: [], templates: [], failTemplateAt: 0, templateAttempts: 0,
    sessionError: false, availabilityError: false, expired: false, conflictError: false,
    cleanupError: false, emptySessionResponse: false, authThrows: false });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openCreate(recurring = false) {
  render(<MemoryRouter><CalendarPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Sukurti pamoką'));
  const dialog = await screen.findByRole('dialog');
  fireEvent.keyDown(within(dialog).getAllByRole('combobox')[0], { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: 'Ada' }));
  fireEvent.keyDown(within(dialog).getAllByRole('combobox')[1], { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: /Math/ }));
  await waitFor(() => expect(document.activeElement).toBe(within(dialog).getAllByRole('combobox')[1]));
  if (recurring) fireEvent.click(within(dialog).getByText('Pasikartojanti pamoka'));
  return dialog;
}
async function save(dialog: HTMLElement, recurring = false) {
  const button = within(dialog).getByRole('button', { name: recurring ? 'Sukurti pasikartojančias' : 'Sukurti pamoką', exact: true });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
}

describe('SUP-84B2ECB2 calendar lesson save feedback', () => {
  it('shows an inline database error and permits a successful retry without losing the form', async () => {
    state.sessionError = true;
    const dialog = await openCreate();
    await save(dialog);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Klaida kuriant pamoką');
    expect(window.alert).not.toHaveBeenCalled();
    expect(state.rows).toHaveLength(0);
    state.sessionError = false;
    await save(dialog);
    await within(dialog).findByRole('button', { name: 'Baigti' });
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(state.rows).toHaveLength(1);
    await screen.findByTestId('lesson-sessions-0');
  });

  it('reports an expired session without silently returning', async () => {
    state.expired = true;
    const dialog = await openCreate();
    await save(dialog);
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Prisijunkite iš naujo');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Sukurti pamoką' }).hasAttribute('disabled')).toBe(false));
    expect(state.rows).toHaveLength(0);
  });

  it('catches a rejected request before insert and resets the save button', async () => {
    state.authThrows = true;
    const dialog = await openCreate();
    await save(dialog);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Klaida kuriant pamoką');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('alert')));
    expect(within(dialog).getByRole('button', { name: 'Sukurti pamoką' }).hasAttribute('disabled')).toBe(false);
    expect(state.rows).toHaveLength(0);
  });

  it('reports recurring-template errors instead of closing the form with no lesson', async () => {
    state.failTemplateAt = 1;
    const dialog = await openCreate(true);
    await save(dialog, true);
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Klaida kuriant pamoką');
    expect(state.rows).toHaveLength(0);
    expect(state.templates).toHaveLength(0);
    state.failTemplateAt = 0;
    await save(dialog, true);
    await within(dialog).findByRole('button', { name: 'Baigti' });
    expect(state.templates).toHaveLength(1);
    expect(state.rows.length).toBeGreaterThan(1);
  });

  it('rolls back earlier templates when another weekday fails', async () => {
    state.failTemplateAt = 2;
    const dialog = await openCreate(true);
    const extraDay = within(dialog).getAllByRole('button').find(button => button.getAttribute('aria-pressed') === 'false')!;
    fireEvent.click(extraDay);
    await save(dialog, true);
    await within(dialog).findByRole('alert');
    expect(state.templateAttempts).toBe(2);
    await waitFor(() => expect(state.templates).toHaveLength(0));
    expect(state.rows).toHaveLength(0);
  });

  it.each(['sessionError', 'conflictError', 'emptySessionResponse'] as const)('cleans up recurring templates on %s', async failure => {
    state[failure] = true;
    const dialog = await openCreate(true);
    await save(dialog, true);
    await within(dialog).findByRole('alert');
    await waitFor(() => expect(state.templates).toHaveLength(0));
    expect(state.rows).toHaveLength(0);
  });

  it('reports a cleanup failure explicitly', async () => {
    state.sessionError = true; state.cleanupError = true;
    const dialog = await openCreate(true);
    await save(dialog, true);
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('pašalinti pasikartojimo nustatymų'));
  });

  it.each([false, true])('keeps saved lessons visible after a thrown follow-up error (recurring: %s)', async recurring => {
    state.availabilityError = true;
    const dialog = await openCreate(recurring);
    await save(dialog, recurring);
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Pamoka išsaugota');
    expect(within(dialog).queryByRole('button', { name: /Sukurti pamok/ })).toBeNull();
    await within(dialog).findByRole('button', { name: 'Baigti' });
    await screen.findByTestId('lesson-sessions-0');
    expect(state.rows.length).toBeGreaterThan(0);
    if (recurring) expect(state.templates).toHaveLength(1);
  });
});
