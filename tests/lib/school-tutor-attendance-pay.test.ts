import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSchoolTutorAttendancePayRows } from '@/lib/schoolTutorAttendancePay';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer teacher-token' }) }));

const scope = { tutorId: 'teacher', periodStart: '2026-09-01', periodEnd: '2026-09-30' };
afterEach(() => vi.unstubAllGlobals());

describe('authorized standalone attendance pay loader', () => {
  it('requests the teacher and calendar period with auth and preserves separate attendance source identity', async () => {
    const rows = [{ id: 'fact', source_kind: 'attendance', tutor_id: 'teacher', class_group_id: 'group' }];
    const request = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, rows }) }));
    vi.stubGlobal('fetch', request);
    expect(await fetchSchoolTutorAttendancePayRows(scope)).toEqual(rows);
    expect(request).toHaveBeenCalledWith('/api/school-tutor-attendance-pay?tutorId=teacher&periodStart=2026-09-01&periodEnd=2026-09-30', {
      headers: { Authorization: 'Bearer teacher-token' },
    });
  });

  it.each([
    { ok: false, body: { ok: false, rows: [] } },
    { ok: true, body: { rows: [] } },
    { ok: true, body: { ok: true, rows: [{ id: 'fact' }] } },
  ])('fails closed for an unauthorized or malformed source (%j)', async ({ ok, body }) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })));
    await expect(fetchSchoolTutorAttendancePayRows(scope)).rejects.toThrow('Could not load school attendance pay.');
  });
});
