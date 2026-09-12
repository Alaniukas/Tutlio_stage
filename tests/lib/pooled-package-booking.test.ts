import { describe, expect, it, vi } from 'vitest';
import { findActivePackageForBooking, applyPackageBookingUsage } from '../../src/lib/lessonPackageBooking';

function database(pools: Record<string, unknown>[]) {
  const query: any = { then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
  for (const name of ['select','eq','is','gt','order','limit']) query[name] = vi.fn(() => query);
  return { from: vi.fn(() => query), rpc: vi.fn(async () => ({ data: pools, error: null })) };
}
const pool = { id: 'pool', tutor_id: 'tutor1', student_id: 'row1', pool_organization_id: 'org',
  total_lessons: 9, available_lessons: 9, reserved_lessons: 0, completed_lessons: 0,
  billing_period_start: '2026-09-01', billing_period_end: '2026-09-30', expires_at: '2026-09-30T21:00:00Z' };

describe('pooled booking integration', () => {
  it('offers the entire fungible balance for a new subject and another identity row', async () => {
    const db = database([pool]);
    const result = await findActivePackageForBooking(db as any, { studentId: 'row2', subjectId: 'physics', startIso: '2026-09-10T12:00:00Z' });
    expect(db.rpc).toHaveBeenCalledWith('get_pooled_packages_for_student', { p_student_id: 'row2' });
    expect(result?.item).toMatchObject({ subject_id: 'physics', available_lessons: 9 });
    expect(result?.pkg.pool_organization_id).toBe('org');
    db.from.mockClear();
    expect(await applyPackageBookingUsage(db as any, { pkg: result!.pkg, usageBySubject: new Map([['physics', 1]]) })).toEqual({ ok: true });
    expect(db.from).not.toHaveBeenCalled(); // SQL session allocation owns all counters.
  });
  it('does not offer a September credit for an October lesson, including Vilnius midnight', async () => {
    const db = database([pool]);
    expect(await findActivePackageForBooking(db as any, { studentId: 'row2', subjectId: 'physics', startIso: '2026-09-30T21:00:00Z' })).toBeNull();
  });
  it('chooses the matching month when multiple paid pools exist', async () => {
    const db = database([pool, { ...pool, id: 'oct', billing_period_start: '2026-10-01', billing_period_end: '2026-10-31' }]);
    expect((await findActivePackageForBooking(db as any, { studentId: 'row2', subjectId: 'physics', startIso: '2026-10-15T12:00:00Z' }))?.pkg.id).toBe('oct');
  });
  it('returns no pool when RLS lookup returns nothing', async () => {
    expect(await findActivePackageForBooking(database([]) as any, { studentId: 'unrelated', subjectId: 'physics' })).toBeNull();
  });
});
