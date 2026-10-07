// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

import { runSchoolGroupMinimumWarnings } from '../../api/_lib/schoolGroupMinimumWarnings';

function makeSupabase(tables: Record<string, any[]>) {
  const state = { tables };
  const from = (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    const builder: any = {
      select: () => builder,
      eq: (_col: string, value: unknown) => {
        filters.push((row) => row[_col] === value);
        return builder;
      },
      is: (_col: string, value: unknown) => {
        filters.push((row) => row[_col] === value);
        return builder;
      },
      in: () => builder,
      order: () => builder,
      range: () => builder,
      maybeSingle: () => Promise.resolve({ data: state.tables[table][0] ?? null, error: null }),
      update: (patch: Record<string, unknown>) => {
        const updateFilters: Array<(row: any) => boolean> = [];
        const updateBuilder = {
          eq: (_col: string, value: unknown) => {
            updateFilters.push((row) => row[_col] === value);
            return updateBuilder;
          },
          then(onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
            const rows = state.tables[table].filter((row) => updateFilters.every((fn) => fn(row)));
            rows.forEach((row) => Object.assign(row, patch));
            return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
          },
        };
        return updateBuilder;
      },
      then(onFulfilled: (value: { data: any[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        const data = state.tables[table].filter((row) => filters.every((fn) => fn(row)));
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };
  return { from, state } as any;
}

describe('school group minimum warnings cron', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });

  it('emails tutor and admin once per upcoming occurrence', async () => {
    const supabase = makeSupabase({
      organizations: [{
        id: 'school',
        name: 'Demo Mokykla',
        email: 'admin@school.lt',
        entity_type: 'school',
        features: { school_class_groups: true },
      }],
      school_class_groups: [{
        id: 'group',
        organization_id: 'school',
        name: 'STEAM',
        tutor_id: 'tutor-1',
        duration_minutes: 45,
        minimum_active_students: 2,
        minimum_risk_warning_occurrence_at: null,
        suspension_resumed_at: null,
        tutor: { full_name: 'Mokytoja', email: 'tutor@school.lt' },
        slots: [{ weekday: 3, start_time: '16:00', end_time: '16:45' }],
        members: [{ student_id: 's1' }, { student_id: 's2' }],
      }],
      school_contracts: [{
        id: 'c1',
        organization_id: 'school',
        class_group_id: 'group',
        kind: 'extra_lessons',
        student_id: 's1',
        signing_status: 'signed',
        accepted_at: '2026-09-01T09:00:00.000Z',
        order_snapshot: { end_date: '2027-06-30' },
        student: { organization_id: 'school', detached_at: null, enrollment_status: 'active' },
      }],
      organization_admins: [{
        user_id: 'admin-1',
        organization_id: 'school',
        role: 'owner',
        status: 'active',
        permissions: {},
        accepted_at: '2026-01-01T00:00:00.000Z',
      }],
      profiles: [
        { id: 'admin-1', email: 'owner@school.lt' },
      ],
    });

    const now = new Date('2026-10-06T10:00:00.000Z');
    const first = await runSchoolGroupMinimumWarnings(supabase, 'https://tutlio.lt', now);
    expect(first.atRisk).toBe(1);
    expect(first.emailed).toBeGreaterThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalled();
    expect(supabase.state.tables.school_class_groups[0].minimum_risk_warning_occurrence_at).toBeTruthy();

    fetchMock.mockClear();
    const second = await runSchoolGroupMinimumWarnings(supabase, 'https://tutlio.lt', now);
    expect(second.skippedAlreadySent).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
