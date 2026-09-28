// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolMaterialDatabase } from '../fixtures/schoolMaterialDatabase';
const state = vi.hoisted(() => ({ verify: vi.fn(), recordings: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: state.verify }));
vi.mock('../../api/_lib/schoolHomeworkRecordings.js', () => ({
  schoolRecordingsFeatureOn: () => false, listHomeworkGroupRecordings: state.recordings,
}));
import handler from '../../api/school-homework';
import { buildPublicLinkToken } from '../../api/_lib/publicLinkToken';

let db: ReturnType<typeof schoolMaterialDatabase>;
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://school-material-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.APP_URL = 'https://school.test';
  db = schoolMaterialDatabase(); vi.stubGlobal('fetch', db.transport);
  state.verify.mockReset().mockImplementation(async (req) => {
    const match = /^Bearer (student-user|parent-user|peer-user)$/.exec(String(req.headers.authorization));
    return match ? { userId: match[1], isInternal: false } : null;
  });
  state.recordings.mockReset().mockResolvedValue({ retentionDays: 30, groups: [] });
});
afterEach(() => vi.unstubAllGlobals());

async function request(authorization: unknown = 'Bearer student-user', method = 'GET', values: Record<string, unknown> = {}) {
  const res: any = { statusCode: 0, payload: undefined, headers: {},
    setHeader(name: string, value: unknown) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.payload = value; return this; } };
  const data = { student: 'child', t: buildPublicLinkToken('homework', 'child'), ...values };
  await handler({ method, headers: authorization === null ? {} : { authorization },
    query: method === 'GET' ? data : {}, body: method === 'POST' ? data : undefined } as any, res);
  return res;
}
describe('private and legacy homework boundaries', () => {
  it('keeps old permitted files in an anonymous link while hiding new material, private notes and classmates submissions', async () => {
    db.tables.school_material_publications.push({ organization_id: 'school', source: 'session_file',
      file_id: 'peer-session/teacher.pdf', source_version: 'old', first_published_at: '2026-09-01T12:00:00Z', legacy_access: true });
    const res = await request(null);
    expect(res.statusCode).toBe(200); expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.payload.loginRequiredForNewMaterials).toBe(true);
    expect(res.payload.sessions).toHaveLength(1);
    expect(res.payload.sessions[0]).toMatchObject({ tutorComment: '', files: [expect.objectContaining({
      name: 'teacher.pdf', folderId: 'peer-session', url: expect.stringContaining('/api/school-material-file?'),
    })] });
    expect(res.payload.sessions[0].files[0].url).toContain('&t=');
    expect(db.requests.some((row) => row.path.includes('/object/sign/'))).toBe(false);
  });

  it('gives the linked student current teacher material and own submissions, with no parent-only notes or foreign school filenames', async () => {
    const res = await request('Bearer student-user', 'GET', { t: 'invalid-but-authenticated' });
    expect(res.statusCode).toBe(200); expect(res.payload.loginRequiredForNewMaterials).toBe(false);
    const lesson = res.payload.sessions[0];
    expect(lesson.tutorComment).toBe('');
    expect(lesson.files.map((file: any) => file.name)).toEqual(expect.arrayContaining(['teacher.pdf', 'nd-test-child-answer.pdf']));
    expect(lesson.files.map((file: any) => file.name)).not.toContain('nd-test-peer-answer.pdf');
    expect(lesson.files.map((file: any) => file.name)).not.toContain('secret.pdf');
    expect(lesson.files.every((file: any) => file.url.startsWith('/api/school-material-file?') && !file.url.includes('&t='))).toBe(true);
    expect(db.requests.some((row) => row.path.includes('/object/sign/'))).toBe(false);
  });

  it('shows only the guardian child note and removes access immediately when annual evidence stops being current', async () => {
    const res = await request('Bearer parent-user');
    expect(res.statusCode).toBe(200);
    expect(res.payload.sessions.map((lesson: any) => lesson.tutorComment)).toEqual(['child private note']);
    db.tables.school_contracts[0].signing_status = 'sent';
    expect((await request('Bearer parent-user')).statusCode).toBe(403);
    db.tables.parent_profiles.push({ id: 'parent-profile', user_id: 'parent-user' });
    db.tables.parent_students.push({ parent_id: 'parent-profile', student_id: 'peer' });
    expect((await request('Bearer parent-user', 'GET', { student: 'peer' })).statusCode).toBe(403);
  });

  it('does not promote a shared child account to the guardian role or expose peer notes', async () => {
    db.tables.school_family_guardians[0].guardian_user_id = 'student-user';
    expect((await request()).payload.sessions[0].tutorComment).toBe('');
    expect((await request('Bearer student-user', 'GET', { student: 'peer' })).statusCode).toBe(403);
  });

  it('keeps identically named classmates submissions isolated by the authenticated child session folder', async () => {
    db.tables.students[0].full_name = 'Same Name'; db.tables.students[1].full_name = 'Same Name';
    const name = 'nd-same-name-answer.pdf';
    db.files[`child-session/${name}`] = { body: 'Own answer', type: 'application/pdf' };
    db.files[`peer-session/${name}`] = { body: 'Peer answer', type: 'application/pdf' };
    const list = await request();
    expect(list.statusCode).toBe(200);
    expect(list.payload.sessions[0].files.filter((file: any) => file.name === name)).toEqual([
      expect.objectContaining({ folderId: 'child-session', own: true }),
    ]);
    const upload = { action: 'upload-url', sessionId: 'child-session', fileName: 'answer.pdf', size: 40 };
    expect((await request('Bearer student-user', 'POST', upload)).payload.path).toBe(`child-session/${name}`);
    expect((await request('Bearer peer-user', 'POST', { ...upload, student: 'peer', sessionId: 'peer-session' })).payload.path).toBe(`peer-session/${name}`);
    const writesBefore = db.requests.filter((row) => row.path.startsWith('/storage/v1/')).length;
    expect((await request('Bearer student-user', 'POST', { ...upload, sessionId: 'peer-session' })).statusCode).toBe(404);
    expect((await request('Bearer student-user', 'POST', { action: 'delete', sessionId: 'peer-session', fileName: name })).statusCode).toBe(404);
    expect((await request('Bearer student-user', 'POST', { action: 'delete', student: 'peer', sessionId: 'peer-session', fileName: name })).statusCode).toBe(403);
    expect(db.requests.filter((row) => row.path.startsWith('/storage/v1/'))).toHaveLength(writesBefore);
  });

  it.each(['Bearer invalid', 'Bearer', 'bearer invalid', 'Basic invalid', ['Bearer invalid']])('does not fall back to HMAC for supplied invalid Authorization: %s', async (authorization) => {
    expect((await request(authorization)).statusCode).toBe(401);
    expect(db.requests).toEqual([]);
  });

  it('blocks anonymous writes after opt-in while allowing the authenticated child own submission', async () => {
    const values = { action: 'upload-url', sessionId: 'child-session', fileName: 'answer.pdf', size: 40 };
    expect((await request(null, 'POST', values)).statusCode).toBe(403);
    expect(db.requests.some((row) => row.path.includes('/object/upload/sign/'))).toBe(false);
    const own = await request('Bearer student-user', 'POST', values);
    expect(own.statusCode).toBe(200); expect(own.payload.path).toBe('child-session/nd-test-child-answer.pdf');
    expect((await request('Bearer student-user', 'POST', { ...values, sessionId: 'peer-session' })).statusCode).toBe(404);
    expect((await request('Bearer student-user', 'POST', { action: 'delete', sessionId: 'child-session', fileName: 'teacher.pdf' })).statusCode).toBe(403);
  });

  it('rechecks authorization before returning material names and private notes after a list-time revocation', async () => {
    db.hooks.list = () => { db.tables.school_contracts[0].terminated_at = new Date().toISOString(); };
    const res = await request('Bearer parent-user');
    expect(res.statusCode).toBe(403);
    expect(res.payload).toEqual({ error: 'Forbidden' });
  });

  it('preserves the existing non-opted public link and signed download behavior', async () => {
    db.tables.organizations[0].features.school_family_portal = false;
    const res = await request(null);
    expect(res.statusCode).toBe(200); expect(res.payload.loginRequiredForNewMaterials).toBe(false);
    expect(res.payload.sessions[0].files.some((file: any) => file.url.includes('/object/sign/'))).toBe(true);
    expect(res.payload.sessions[0].tutorComment).toBe('');
  });
});
