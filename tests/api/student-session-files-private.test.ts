// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolMaterialDatabase } from '../fixtures/schoolMaterialDatabase';
const state = vi.hoisted(() => ({ client: null as any, userId: 'student-user' as string | null }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId, isInternal: false } : null }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => state.client }));
import handler from '../../api/student-session-files';
let db: ReturnType<typeof schoolMaterialDatabase>;
beforeEach(() => { db = schoolMaterialDatabase(); state.client = db.client; state.userId = 'student-user'; });
async function list(sessionId = 'child-session', values: Record<string, unknown> = {}) {
  const res: any = { statusCode: 0, payload: undefined, headers: {},
    setHeader(name: string, value: unknown) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.payload = value; return this; } };
  await handler({ method: 'POST', headers: {}, query: {}, body: { action: 'list', sessionId, ...values } } as any, res); return res;
}
describe('family session file lists', () => {
  it('returns authenticated proxy links for own submissions and scoped peer teacher materials without any reusable Storage URLs', async () => {
    const res = await list();
    expect(res.statusCode).toBe(200); expect(res.headers['Cache-Control']).toBe('private, no-store');
    const files = res.payload.files;
    expect(files.map((file: any) => file.name)).toEqual(expect.arrayContaining(['teacher.pdf', 'nd-test-child-answer.pdf']));
    expect(files.map((file: any) => file.name)).not.toContain('nd-test-peer-answer.pdf');
    expect(files.map((file: any) => file.name)).not.toContain('secret.pdf');
    expect(files.every((file: any) => file.signedUrl === null && file.downloadUrl.startsWith('/api/school-material-file?'))).toBe(true);
    expect(db.requests.some((row) => row.path.includes('/object/sign/'))).toBe(false);
  });
  it('requires the recorded guardian relationship and rejects a revoked relationship before returning a list', async () => {
    state.userId = 'parent-user'; expect((await list()).statusCode).toBe(200);
    db.tables.school_contracts[0].terminated_at = new Date().toISOString();
    expect((await list()).statusCode).toBe(403);
  });
  it('checks again after list-time revocation and denies another child session even with a stale legacy parent link', async () => {
    db.hooks.list = () => { db.tables.students[0].linked_user_id = null; };
    expect((await list()).statusCode).toBe(403);
    db.tables.parent_profiles.push({ id: 'legacy-parent', user_id: 'student-user' });
    db.tables.parent_students.push({ parent_id: 'legacy-parent', student_id: 'peer' });
    expect((await list('peer-session')).statusCode).toBe(403);
  });
  it('preserves signed download URLs for schools that have not opted in', async () => {
    db.tables.organizations[0].features.school_family_portal = false;
    const res = await list(); expect(res.statusCode).toBe(200);
    expect(res.payload.files.every((file: any) => file.signedUrl.includes('/object/sign/') && file.downloadUrl === null)).toBe(true);
  });

  it('isolates same-name classmates in the authenticated SessionFiles list, upload and deletion route', async () => {
    db.tables.students[0].full_name = 'Same Name'; db.tables.students[1].full_name = 'Same Name';
    const name = 'nd-same-name-answer.pdf';
    db.files[`child-session/${name}`] = { body: 'Own answer', type: 'application/pdf' };
    db.files[`peer-session/${name}`] = { body: 'Peer answer', type: 'application/pdf' };
    expect((await list()).payload.files.filter((file: any) => file.name === name)).toEqual([
      expect.objectContaining({ folderId: 'child-session', own: true }),
    ]);
    const upload = { action: 'upload-url', fileName: 'answer.pdf', size: 40 };
    expect((await list('child-session', upload)).payload.path).toBe(`child-session/${name}`);
    state.userId = 'peer-user'; expect((await list('peer-session', upload)).payload.path).toBe(`peer-session/${name}`);
    state.userId = 'student-user';
    const writesBefore = db.requests.filter((row) => row.path.startsWith('/storage/v1/')).length;
    expect((await list('peer-session', upload)).statusCode).toBe(403);
    expect((await list('peer-session', { action: 'delete', fileName: name })).statusCode).toBe(403);
    expect(db.requests.filter((row) => row.path.startsWith('/storage/v1/'))).toHaveLength(writesBefore);
  });
});
