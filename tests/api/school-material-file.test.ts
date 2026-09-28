// @vitest-environment node
import { Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolMaterialDatabase } from '../fixtures/schoolMaterialDatabase';
const state = vi.hoisted(() => ({ client: null as any, verify: vi.fn(), recordings: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: state.verify }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => state.client }));
vi.mock('../../api/_lib/schoolHomeworkRecordings.js', () => ({
  schoolRecordingsFeatureOn: () => false, listHomeworkGroupRecordings: state.recordings,
}));
import handler from '../../api/school-material-file';
import { buildPublicLinkToken } from '../../api/_lib/publicLinkToken';

function response() {
  const bytes: Buffer[] = [];
  const res: any = new Writable({ write(chunk, _encoding, done) { bytes.push(Buffer.from(chunk)); done(); } });
  res.headers = {}; res.statusCode = 0; res.payload = undefined;
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; return res; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (value: unknown) => { res.payload = value; res.end(); return res; };
  return { res, result: () => ({ status: res.statusCode, payload: res.payload, headers: res.headers,
    body: Buffer.concat(bytes).toString('utf8') }) };
}

let db: ReturnType<typeof schoolMaterialDatabase>;
beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  db = schoolMaterialDatabase(); state.client = db.client;
  state.verify.mockReset().mockImplementation(async (req) => {
    const match = /^Bearer (student-user|parent-user|peer-user|foreign-user)$/.exec(String(req.headers.authorization));
    return match ? { userId: match[1], isInternal: false } : null;
  });
  state.recordings.mockReset().mockResolvedValue({ retentionDays: 30, groups: [] });
});

async function request(query: Record<string, unknown> = {}, authorization: unknown = 'Bearer student-user', method = 'GET') {
  const output = response();
  const done = new Promise<void>((resolve, reject) => { output.res.once('finish', resolve); output.res.once('error', reject); });
  await handler({ method, query: { student: 'child', session: 'child-session', folder: 'child-session', file: 'teacher.pdf', ...query },
    headers: authorization === null ? {} : { authorization } } as any, output.res);
  await done; return output.result();
}
const downloads = () => db.requests.filter((row) => row.path.startsWith('/storage/v1/object/session-files/'));
const legacy = (path = 'child-session/teacher.pdf') => db.tables.school_material_publications.push({
  organization_id: 'school', source: 'session_file', target_id: path.split('/')[0], file_id: path,
  source_version: 'old', first_published_at: '2026-09-01T12:00:00Z', legacy_access: true,
});

describe('live school material download authorization', () => {
  it('downloads own and parallel teacher materials through the proxy without escaping a Storage URL', async () => {
    expect(await request()).toMatchObject({ status: 200, body: 'Own teacher material', headers: {
      'Cache-Control': 'private, no-store', 'Content-Type': 'application/pdf',
    } });
    expect(await request({ folder: 'peer-session' })).toMatchObject({ status: 200, body: 'Peer teacher material' });
    expect(db.requests.some((row) => row.path.includes('/object/sign/'))).toBe(false);
  });

  it('keeps own submissions accessible and rejects peer answers, other schools and unrelated lesson rows before fetching bytes', async () => {
    expect(await request({ file: 'nd-test-child-answer.pdf' })).toMatchObject({ status: 200, body: 'Own answer' });
    db.requests.length = 0;
    expect((await request({ folder: 'peer-session', file: 'nd-test-peer-answer.pdf' })).status).toBe(403);
    expect((await request({ folder: 'foreign-session', file: 'secret.pdf' })).status).toBe(403);
    db.tables.sessions.find((row) => row.id === 'peer-session')!.end_time = new Date().toISOString();
    expect((await request({ folder: 'peer-session' })).status).toBe(403);
    expect((await request({ session: 'peer-session', folder: 'peer-session' })).status).toBe(403);
    expect(downloads()).toEqual([]);
  });

  it('supports teacher material from the same group-subject lesson without exposing a peer submission or individual folder', async () => {
    db.tables.sessions.forEach((row) => { row.class_group_id = null; });
    expect(await request({ folder: 'peer-session' })).toMatchObject({ status: 200, body: 'Peer teacher material' });
    expect((await request({ folder: 'peer-session', file: 'nd-test-peer-answer.pdf' })).status).toBe(403);
    db.tables.sessions.find((row) => row.id === 'child-session')!.subjects = { is_group: false };
    expect((await request({ folder: 'peer-session' })).status).toBe(403);
  });

  it('cannot read a same-name classmate submission by reusing its filename, session or child selection', async () => {
    db.tables.students[0].full_name = 'Same Name'; db.tables.students[1].full_name = 'Same Name';
    const file = 'nd-same-name-answer.pdf';
    db.files[`child-session/${file}`] = { body: 'Own same-name answer', type: 'application/pdf' };
    db.files[`peer-session/${file}`] = { body: 'Peer same-name answer', type: 'application/pdf' };
    expect(await request({ file })).toMatchObject({ status: 200, body: 'Own same-name answer' });
    db.requests.length = 0;
    expect((await request({ file, folder: 'peer-session' })).status).toBe(403);
    expect((await request({ file, session: 'peer-session', folder: 'peer-session' })).status).toBe(403);
    expect((await request({ file, student: 'peer', session: 'peer-session', folder: 'peer-session' })).status).toBe(403);
    expect(downloads()).toEqual([]);
    expect(await request({ file, student: 'peer', session: 'peer-session', folder: 'peer-session' }, 'Bearer peer-user'))
      .toMatchObject({ status: 200, body: 'Peer same-name answer' });
  });

  it('uses current signed annual guardian evidence and rejects revocation before or during download', async () => {
    expect((await request({}, 'Bearer parent-user')).status).toBe(200);
    db.tables.school_contracts[0].terminated_at = new Date().toISOString(); db.requests.length = 0;
    expect((await request({}, 'Bearer parent-user')).status).toBe(403);
    expect(downloads()).toEqual([]);
    db.tables.school_contracts[0].terminated_at = null;
    db.hooks.download = () => { db.tables.school_contracts[0].terminated_at = new Date().toISOString(); };
    expect(await request({}, 'Bearer parent-user')).toMatchObject({ status: 403, body: '', payload: { error: 'Forbidden' } });
  });

  it.each(['GET', 'HEAD'])('rechecks live membership after receiving bytes for %s', async (method) => {
    db.hooks.download = () => { db.tables.school_class_group_members = db.tables.school_class_group_members.filter((row) => row.student_id !== 'child'); };
    expect(await request({}, 'Bearer student-user', method)).toMatchObject({ status: 403, body: '' });
    expect(downloads()).toHaveLength(1);
    expect((await request({}, 'Bearer student-user', method)).status).toBe(403);
    expect(downloads()).toHaveLength(1);
  });

  it('rechecks the linked account and opt-in after downloading instead of retaining a stale authorization snapshot', async () => {
    db.hooks.download = () => { db.tables.students[0].linked_user_id = null; };
    expect(await request()).toMatchObject({ status: 403, body: '' });
    db.tables.students[0].linked_user_id = 'student-user';
    db.hooks.download = () => { db.tables.organizations[0].features.school_family_portal = false; };
    expect(await request()).toMatchObject({ status: 403, body: '' });
  });

  it('preserves an anonymous old allowed file but requires login for new, unknown and overwritten material', async () => {
    legacy(); const t = buildPublicLinkToken('homework', 'child');
    expect(await request({ t }, null)).toMatchObject({ status: 200, body: 'Own teacher material' });
    expect((await request({ t, folder: 'peer-session' }, null)).status).toBe(403);
    db.hooks.download = () => {
      db.files['child-session/teacher.pdf'].body = 'New private material after overwrite';
      db.tables.school_material_publications.push({ ...db.tables.school_material_publications[0],
        source_version: 'new', first_published_at: '2026-09-28T12:00:00Z', legacy_access: false });
    };
    expect(await request({ t }, null)).toMatchObject({ status: 403, body: '' });
    expect((await request({ t }, null, 'HEAD')).status).toBe(403);
  });

  it.each(['Bearer invalid', 'Bearer', 'bearer invalid', 'Basic invalid', ['Bearer invalid']])('never falls back to a valid old HMAC when Authorization is supplied: %s', async (authorization) => {
    legacy();
    expect((await request({ t: buildPublicLinkToken('homework', 'child') }, authorization)).status).toBe(401);
    expect(downloads()).toEqual([]);
  });

  it('returns only headers for HEAD and rejects invalid paths or unavailable access metadata without emitting bytes', async () => {
    expect(await request({}, 'Bearer student-user', 'HEAD')).toMatchObject({ status: 200, body: '', headers: { 'Content-Length': '20' } });
    expect((await request({ file: '../teacher.pdf' })).status).toBe(400);
    db.hooks.failedTable = 'school_class_groups';
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await request()).toMatchObject({ status: 503, body: '', payload: { error: 'school_material_access_unavailable' } });
    log.mockRestore();
  });
});
