// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: null as any }));
vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@supabase/supabase-js')>();
  return { ...original, createClient: (...args: Parameters<typeof original.createClient>) => args[1] === 'cron-test-key' ? mocks.db : original.createClient(...args) };
});
vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));
import { groupSeed, schoolGroupDatabase } from '../fixtures/schoolGroupDatabase';
import { buildExtraLessonsOrderSnapshot } from '../../src/lib/extraLessonsContract';
import handler from '../../api/materialize-recurring-sessions';

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it('restores an expired individual pause and restarts the whole group once its configured minimum is met', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'cron-test-key');
  const seed = groupSeed();
  seed.recurring_individual_sessions = [];
  seed.organizations[0].features = { school_class_groups: true };
  Object.assign(seed.school_class_groups[0], { tutor_id: 'teacher', school_year_start: '2026-09-01', school_year_end: '2027-06-15', suspension_started_at: '2026-09-02' });
  seed.school_class_group_slots = [{ group_id: 'group', weekday: 1, start_time: '18:00', end_time: '18:45' }];
  const order = buildExtraLessonsOrderSnapshot({
    service_name: 'STEAM', service_type: 'group', platform: 'Google Meet', duration_minutes: 45,
    start_date: '2026-09-01', end_date: '2027-06-15', unit_price_eur: 12, base_lessons_per_month: 4,
    schedule_slots: [{ weekday: 1, start_time: '18:00' }], group_id: 'group',
  });
  seed.school_contracts.forEach(row => { row.order_snapshot = order; row.start_within_14_status = 'yes'; row.suspension_started_at = '2026-09-02'; row.suspension_scope = 'group_under_minimum'; });
  Object.assign(seed.school_contracts[0], { suspension_scope: 'individual', suspension_until: '2026-09-27', suspended_group_membership: seed.school_class_group_members.shift() });
  seed.sessions = [];
  const db = schoolGroupDatabase(seed);
  mocks.db = db.client;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: 'GET', headers: {} } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(db.tables.school_class_group_members).toHaveLength(3);
  expect(db.tables.school_class_groups[0].suspension_resumed_at).toBe('2026-09-28T10:00:00.000Z');
  expect(db.tables.school_contracts.slice(1).every(row => row.suspension_resumed_at)).toBe(true);
  expect(new Set(db.tables.sessions.map(row => row.student_id))).toEqual(new Set(['s1', 's2', 's3']));
  expect(db.tables.sessions.length).toBeGreaterThan(0);
  expect(db.requests.filter(request => request.table === 'sessions' && request.method === 'POST')).toHaveLength(1);
});
