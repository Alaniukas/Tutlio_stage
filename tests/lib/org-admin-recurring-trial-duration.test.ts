import { format } from 'date-fns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRO_KLASE_QA_ORG_ID } from '@/lib/marketMoney';
import { runOrgAdminCreateSession } from '@/pages/company/orgAdminSessionCreate';

vi.mock('@/lib/orgStudentPairing', () => ({
  ensureStudentPairedWithTutor: vi.fn(async (_client, studentId: string) => studentId),
}));
vi.mock('@/lib/consumeSessionAvailability', () => ({
  consumeAvailabilityForCreatedSessions: vi.fn(async () => undefined),
}));
vi.mock('@/lib/apiHelpers', () => ({
  authHeaders: vi.fn(async () => ({})),
}));

type InsertedRow = Record<string, unknown>;

function mockSupabaseForRecurringTrial(options: { breakMinutes?: number; busyRows?: InsertedRow[] } = {}) {
  const templates: InsertedRow[] = [];
  const sessions: InsertedRow[] = [];

  const from = vi.fn((table: string) => {
    let action: 'select' | 'insert' | 'update' = 'select';
    let selectedColumns = '';
    let payload: InsertedRow | InsertedRow[] | null = null;

    const result = () => {
      if (table === 'students') {
        return { data: [{ id: 'student-1', payment_model: null, full_name: 'Student' }], error: null };
      }
      if (table === 'profiles') {
        if (selectedColumns === 'organization_id') {
          return { data: { organization_id: PRO_KLASE_QA_ORG_ID }, error: null };
        }
        if (selectedColumns === 'break_between_lessons') {
          return { data: { break_between_lessons: options.breakMinutes ?? 0 }, error: null };
        }
        return { data: { full_name: 'Tutor', email: null, organization_id: PRO_KLASE_QA_ORG_ID }, error: null };
      }
      if (table === 'organizations') {
        return {
          data: {
            features: {
              trial_lesson_topic: 'Bandomoji pamoka',
              trial_lesson_duration_minutes: 45,
              trial_lesson_price_eur: 10,
            },
          },
          error: null,
        };
      }
      if (table === 'subjects') {
        if (action === 'update') return { data: null, error: null };
        return {
          data: [{
            id: 'trial-subject',
            name: 'Bandomoji pamoka',
            price: 10,
            duration_minutes: 45,
            is_group: false,
            is_trial: true,
          }],
          error: null,
        };
      }
      if (table === 'recurring_individual_sessions') {
        if (action !== 'insert' || !payload || Array.isArray(payload)) {
          throw new Error(`Unexpected recurring template operation: ${action}`);
        }
        templates.push(payload);
        return { data: { id: 'series-1', student_id: 'student-1' }, error: null };
      }
      if (table === 'sessions') {
        if (action === 'update') return { data: null, error: null };
        if (action === 'insert') {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (rows.some((row) => !row)) throw new Error('Session insert has no rows');
          sessions.push(...(rows as InsertedRow[]));
          return {
            data: rows.map((row, index) => ({ ...row, id: `session-${sessions.length - rows.length + index + 1}` })),
            error: null,
          };
        }
        return { data: options.busyRows ?? [], error: null };
      }
      throw new Error(`Unexpected table: ${table}`);
    };

    const query = {
      select(columns: string) { selectedColumns = columns; return query; },
      eq() { return query; },
      lt() { return query; },
      gt() { return query; },
      in() { return query; },
      insert(value: InsertedRow | InsertedRow[]) { action = 'insert' as const; payload = value; return query; },
      update(value: InsertedRow) { action = 'update' as const; payload = value; return query; },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  });

  return {
    supabase: { from, rpc: vi.fn(async () => ({ data: null, error: null })) } as unknown as SupabaseClient,
    templates,
    sessions,
  };
}

describe('Pro Klasė recurring series beginning with a trial lesson', () => {
  it('writes a 45-minute trial, 60-minute regular lesson, and 60-minute recurring template', async () => {
    const { supabase, templates, sessions } = mockSupabaseForRecurringTrial();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    try {
      const result = await runOrgAdminCreateSession({
        supabase,
        createTutorId: 'tutor-1',
        createSubjectId: 'math-subject',
        createStudentId: 'student-1',
        createStudentIds: [],
        createStartTime: '2026-10-08T14:00:00',
        createEndTime: '2026-10-08T14:45:00',
        createTopic: 'Bandomoji pamoka',
        createMeetingLink: '',
        createIsRecurring: true,
        createRecurringEndDate: '2026-10-16',
        createRecurringFrequency: 'weekly',
        createRecurringWeekdays: [4],
        createIsPaid: true,
        createPrice: 40,
        createFirstLessonIsTrial: true,
        createTutorComment: '',
        createShowCommentToStudent: false,
        subjects: [{ id: 'math-subject', name: 'Matematika', price: 40, duration_minutes: 60 }],
        individualPricing: [],
        suppressSuccessAlert: true,
        suppressClientBookingEmails: true,
      });

      expect(templates).toHaveLength(1);
      expect(templates[0]).toMatchObject({
        subject_id: 'math-subject',
        start_time: '14:00:00',
        end_time: '15:00:00',
      });
      expect(sessions).toHaveLength(2);
      expect(sessions.map((row) => ({
        start: format(new Date(String(row.start_time)), 'yyyy-MM-dd HH:mm'),
        end: format(new Date(String(row.end_time)), 'yyyy-MM-dd HH:mm'),
        subject: row.subject_id,
        series: row.recurring_session_id,
      }))).toEqual([
        { start: '2026-10-08 14:00', end: '2026-10-08 14:45', subject: 'trial-subject', series: 'series-1' },
        { start: '2026-10-15 14:00', end: '2026-10-15 15:00', subject: 'math-subject', series: 'series-1' },
      ]);
      expect(result.createdSessionIds).toEqual(['session-1', 'session-2']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('org admin booking without the tutor break', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup(existingStart = '2026-10-08T19:00:00') {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    const context = mockSupabaseForRecurringTrial({
      breakMinutes: 10,
      busyRows: [{
        id: 'next-lesson', start_time: new Date(existingStart).toISOString(),
        end_time: new Date('2026-10-08T20:00:00').toISOString(),
      }],
    });
    const params = {
      supabase: context.supabase,
      createTutorId: 'tutor-1', createSubjectId: 'math-subject', createStudentId: 'student-1', createStudentIds: [],
      createStartTime: '2026-10-08T18:00:00', createEndTime: '2026-10-08T19:00:00',
      createTopic: 'Matematika', createMeetingLink: '', createIsRecurring: false, createRecurringEndDate: '',
      createIsPaid: true, createPrice: 40, createTutorComment: '', createShowCommentToStudent: false,
      subjects: [{ id: 'math-subject', name: 'Matematika', price: 40, duration_minutes: 60 }],
      individualPricing: [], suppressSuccessAlert: true, suppressClientBookingEmails: true,
    };
    return { ...context, params };
  }

  it('does not create a back-to-back lesson when the admin declines the break warning', async () => {
    const { params, sessions } = setup();
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await expect(runOrgAdminCreateSession(params)).rejects.toThrow('pertrauka');
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(confirmation.mock.calls[0][0]).toContain('10');
    expect(sessions).toEqual([]);
  });

  it('creates the back-to-back lesson after the admin confirms the break warning', async () => {
    const { params, sessions } = setup();
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await runOrgAdminCreateSession(params);
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].start_time).toBe(new Date('2026-10-08T18:00:00').toISOString());
    expect(sessions[0].end_time).toBe(new Date('2026-10-08T19:00:00').toISOString());
  });

  it('blocks an actual overlap even when a break override was already accepted', async () => {
    const { params, sessions } = setup('2026-10-08T18:50:00');
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await expect(runOrgAdminCreateSession({ ...params, allowBreakConflict: true })).rejects.toThrow();
    expect(sessions).toEqual([]);
    expect(confirmation).not.toHaveBeenCalled();
  });

  it('allows a recurring series after the admin accepts the break warning', async () => {
    const { params, sessions, templates } = setup();
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await runOrgAdminCreateSession({
      ...params, createIsRecurring: true, createRecurringEndDate: '2026-10-16',
      createRecurringFrequency: 'weekly', createRecurringWeekdays: [4],
    });
    expect(confirmation).toHaveBeenCalledTimes(1);
    expect(templates).toHaveLength(1);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((row) => format(new Date(String(row.start_time)), 'yyyy-MM-dd HH:mm'))).toEqual([
      '2026-10-08 18:00', '2026-10-15 18:00',
    ]);
  });
});
