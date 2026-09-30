import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, any>>>,
  cancelBeforeCompletionIds: [] as string[],
  operations: [] as Array<{ table: string; operation: string; ids: string[] }>,
  queryErrors: {} as Record<string, string>,
  sync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      let operation = 'select';
      let patch: Record<string, any> | undefined;
      let returning = false;
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      const query: any = {
        select: () => { returning = true; return query; },
        eq: (key: string, value: any) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, values: any[]) => { filters.push(row => values.includes(row[key])); return query; },
        is: (key: string, value: any) => { filters.push(row => (row[key] ?? null) === value); return query; },
        lt: (key: string, value: any) => { filters.push(row => row[key] < value); return query; },
        gte: (key: string, value: any) => { filters.push(row => row[key] >= value); return query; },
        limit: () => query,
        update: (value: Record<string, any>) => { operation = 'update'; patch = value; returning = false; return query; },
        delete: () => { operation = 'delete'; returning = false; return query; },
        then(resolve: (result: any) => any, reject: (error: unknown) => any) {
          try {
            const rows = state.tables[table] || [];
            if (operation === 'select' && state.queryErrors[table]) {
              return Promise.resolve(resolve({ data: null, error: { message: state.queryErrors[table] } }));
            }
            if (table === 'sessions' && patch?.status === 'completed') {
              for (const row of rows) {
                if (state.cancelBeforeCompletionIds.includes(row.id)) row.status = 'cancelled';
              }
              state.cancelBeforeCompletionIds = [];
            }
            const selected = rows.filter(row => filters.every(filter => filter(row)));
            state.operations.push({ table, operation, ids: selected.map(row => row.id) });
            if (operation === 'update') selected.forEach(row => Object.assign(row, patch));
            if (operation === 'delete') state.tables[table] = rows.filter(row => !selected.includes(row));
            return Promise.resolve(resolve({
              data: returning ? selected.map(row => ({ ...row })) : null,
              error: null,
              count: selected.length,
            }));
          } catch (error) {
            return Promise.resolve(reject(error));
          }
        },
      };
      return query;
    },
  }),
}));
vi.mock('../../api/_lib/google-calendar.js', () => ({ syncSessionToGoogle: state.sync }));
vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));

import handler from '../../api/auto-complete-sessions';
import { LAISVI_VAIKIAI_ORG_ID, PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

const now = new Date('2026-09-30T12:00:00Z');
const session = (id: string) => ({
  id, tutor_id: 'teacher', status: 'active', start_time: '2026-09-30T10:00:00Z',
  end_time: '2026-09-30T11:00:00Z', student_joined_at: null, tutor_joined_at: null,
  meeting_link: 'https://meet.google.com/test', lesson_package_id: 'package', subject_id: 'math',
});

async function run(expectedStatus = 200) {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: 'GET', headers: {} } as any, response);
  expect(response.status).toHaveBeenCalledWith(expectedStatus);
  return response.json.mock.calls[0][0];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  state.tables = {
    sessions: [session('lesson')],
    profiles: [{ id: 'teacher', organization_id: 'company' }],
    organizations: [{ id: 'company', features: {} }],
    lesson_packages: [{ id: 'package', reserved_lessons: 2, completed_lessons: 0 }],
    lesson_package_items: [{ id: 'item', package_id: 'package', subject_id: 'math', reserved_lessons: 2, completed_lessons: 0 }],
    waitlists: [{ id: 'waitlist', session_id: 'lesson', created_at: now.toISOString() }],
  };
  state.cancelBeforeCompletionIds = [];
  state.operations = [];
  state.queryErrors = {};
  state.sync.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('manual lesson completion and cron ownership', () => {
  it.each([LAISVI_VAIKIAI_ORG_ID, PRO_KLASE_ORG_ID])('leaves %s lessons pending without a database feature flag', async organizationId => {
    state.tables.profiles[0].organization_id = organizationId;
    state.tables.organizations = [{ id: organizationId, features: {} }];
    expect(await run()).toMatchObject({ updated: 0, awaitingTutorConfirmation: 1 });
    expect(state.tables.sessions[0].status).toBe('active');
    expect(state.tables.lesson_packages[0]).toMatchObject({ reserved_lessons: 2, completed_lessons: 0 });
    expect(state.sync).not.toHaveBeenCalled();
    expect(state.operations.some(op => op.operation !== 'select')).toBe(false);
  });

  it('keeps Laisvi vaikai pending even when its organization feature lookup returns no row', async () => {
    state.tables.profiles[0].organization_id = LAISVI_VAIKIAI_ORG_ID;
    state.tables.organizations = [];
    expect(await run()).toMatchObject({ updated: 0, awaitingTutorConfirmation: 1 });
    expect(state.tables.sessions[0].status).toBe('active');
  });

  it.each(['profiles', 'organizations'])('stops before any writes if the %s policy lookup fails', async table => {
    state.tables.profiles[0].organization_id = LAISVI_VAIKIAI_ORG_ID;
    state.tables.organizations = [{ id: LAISVI_VAIKIAI_ORG_ID, features: {} }];
    state.queryErrors[table] = 'Database unavailable';
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await run(500)).toMatchObject({ error: 'Internal server error' });
    } finally {
      errorLog.mockRestore();
    }
    expect(state.tables.sessions[0].status).toBe('active');
    expect(state.tables.lesson_packages[0]).toMatchObject({ reserved_lessons: 2, completed_lessons: 0 });
    expect(state.tables.waitlists).toHaveLength(1);
    expect(state.operations.some(op => op.operation !== 'select')).toBe(false);
    expect(state.sync).not.toHaveBeenCalled();
  });

  it('waits for confirmation when the tutor profile is missing rather than assuming a solo tutor', async () => {
    state.tables.profiles = [];
    expect(await run()).toMatchObject({ updated: 0, awaitingTutorConfirmation: 1 });
    expect(state.tables.sessions[0].status).toBe('active');
    expect(state.operations.some(op => op.operation !== 'select')).toBe(false);
    expect(state.sync).not.toHaveBeenCalled();
  });

  it('preserves auto-completion for a known solo tutor with no organization', async () => {
    state.tables.profiles[0].organization_id = null;
    state.tables.organizations = [];
    expect(await run()).toMatchObject({ updated: 1, awaitingTutorConfirmation: 0 });
    expect(state.tables.sessions[0].status).toBe('completed');
    expect(state.tables.lesson_packages[0]).toMatchObject({ reserved_lessons: 1, completed_lessons: 1 });
  });

  it('preserves an ordinary company auto-completion and package settlement', async () => {
    expect(await run()).toMatchObject({ updated: 1, awaitingTutorConfirmation: 0, packagesUpdated: 1 });
    expect(state.tables.sessions[0].status).toBe('completed');
    expect(state.tables.lesson_packages[0]).toMatchObject({ reserved_lessons: 1, completed_lessons: 1 });
    expect(state.tables.lesson_package_items[0]).toMatchObject({ reserved_lessons: 1, completed_lessons: 1 });
    expect(state.sync).toHaveBeenCalledWith('lesson', 'teacher');
    expect(state.tables.waitlists).toHaveLength(0);
  });

  it('preserves the explicit confirmation feature for other organizations', async () => {
    state.tables.organizations[0].features = { tutor_lesson_status_confirmation: true };
    expect(await run()).toMatchObject({ updated: 0, awaitingTutorConfirmation: 1 });
    expect(state.tables.sessions[0].status).toBe('active');
  });

  it('does not overwrite a concurrent cancellation or settle its package and waitlist', async () => {
    state.tables.sessions.push(session('cancelled-in-between'));
    state.tables.waitlists.push({ id: 'other-waitlist', session_id: 'cancelled-in-between', created_at: now.toISOString() });
    state.cancelBeforeCompletionIds = ['cancelled-in-between'];
    expect(await run()).toMatchObject({ updated: 1, packagesUpdated: 1, waitlistEntriesRemoved: 1 });
    expect(state.tables.sessions.map(row => row.status)).toEqual(['completed', 'cancelled']);
    expect(state.tables.lesson_packages[0]).toMatchObject({ reserved_lessons: 1, completed_lessons: 1 });
    expect(state.tables.lesson_package_items[0]).toMatchObject({ reserved_lessons: 1, completed_lessons: 1 });
    expect(state.tables.waitlists.map(row => row.session_id)).toEqual(['cancelled-in-between']);
    expect(state.sync.mock.calls).toEqual([['lesson', 'teacher']]);
  });

  it('performs no downstream effects when every candidate was cancelled before the update', async () => {
    state.cancelBeforeCompletionIds = ['lesson'];
    expect(await run()).toMatchObject({ updated: 0 });
    expect(state.tables.sessions[0].status).toBe('cancelled');
    expect(state.tables.lesson_packages[0]).toMatchObject({ reserved_lessons: 2, completed_lessons: 0 });
    expect(state.tables.waitlists).toHaveLength(1);
    expect(state.sync).not.toHaveBeenCalled();
    expect(state.operations.filter(op => op.operation !== 'select')).toEqual([{ table: 'sessions', operation: 'update', ids: [] }]);
  });
});
