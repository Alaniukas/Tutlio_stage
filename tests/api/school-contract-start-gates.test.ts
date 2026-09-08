import { describe, expect, it, vi } from 'vitest';
import { loadExtraLessonsStartGates } from '../../api/_lib/schoolClassGroupMaterialize';
function db(pages: any[]) {
  let page = 0;
  const q: any = { select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => q, gt: () => q,
    then: (resolve: any) => Promise.resolve(pages[page++] || { data: [], error: null }).then(resolve) };
  return { from: vi.fn(() => q) } as any;
}
const row = { id: 'a', student_id: 's', class_group_id: 'g', accepted_at: '2026-09-01T00:00:00Z', start_within_14_status: 'yes',
  order_snapshot: { service_type: 'group', start_date: '2026-09-08' } };
describe('contract materialization gates', () => {
  it('fails closed when a later page cannot load', async () => {
    await expect(loadExtraLessonsStartGates(db([{ data: [row], error: null }, { error: { message: 'database unavailable' } }]), 'org')).rejects.toThrow('database unavailable');
  });
  it('does not recreate future lessons after termination', async () => {
    const result = await loadExtraLessonsStartGates(db([{ data: [{ ...row, withdrawal_requested_at: '2026-09-09' }] }]), 'org');
    expect(result.get('s:g')).toBe('9999-12-31');
  });
  it('reads a replacement active agreement on a later page', async () => {
    const result = await loadExtraLessonsStartGates(db([{ data: [{ ...row, withdrawal_requested_at: '2026-09-09' }] },
      { data: [{ ...row, id: 'b' }] }]), 'org');
    expect(result.get('s:g')).toBe('2026-09-08');
  });
});
