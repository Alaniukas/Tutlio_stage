// @vitest-environment node
import { Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolMaterialDatabase } from '../fixtures/schoolMaterialDatabase';
import { buildPublicLinkToken } from '../../api/_lib/publicLinkToken';

const state = vi.hoisted(() => ({ client: null as any, verify: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: state.verify }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => state.client }));
import listHandler from '../../api/school-group-materials';
import fileHandler from '../../api/school-group-material-file';

const objectName = '11111111-1111-4111-8111-111111111111_planas.pdf';
let db: ReturnType<typeof schoolMaterialDatabase>;

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  db = schoolMaterialDatabase(); state.client = db.client;
  db.tables.school_group_material_files.push({ id: 'material-1', group_id: 'group', object_name: objectName,
    file_name: 'Mokytojo planas.pdf', size_bytes: 9, uploaded_by: 'teacher-user',
    created_at: '2026-09-29T10:00:00Z', published_at: '2026-09-29T10:01:00Z' });
  db.groupFiles[`group/${objectName}`] = { body: 'Group plan', type: 'application/pdf' };
  state.verify.mockReset().mockImplementation(async (req) => {
    const match = /^Bearer (teacher-user|new-teacher|student-user|parent-user|peer-user)$/.exec(String(req.headers.authorization));
    return match ? { userId: match[1], isInternal: false } : null;
  });
});

function jsonResponse() {
  const res: any = { statusCode: 0, payload: undefined, headers: {},
    setHeader(name: string, value: unknown) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.payload = value; return this; } };
  return res;
}

async function list(query: Record<string, unknown>, authorization: string | null = 'Bearer student-user') {
  const res = jsonResponse();
  await listHandler({ method: 'GET', query,
    headers: authorization ? { authorization } : {} } as any, res);
  return res;
}

async function post(body: Record<string, unknown>, authorization = 'Bearer teacher-user') {
  const res = jsonResponse();
  await listHandler({ method: 'POST', query: {}, body,
    headers: { authorization } } as any, res);
  return res;
}

async function file(query: Record<string, unknown>, authorization: string | null = 'Bearer student-user', method = 'GET') {
  const chunks: Buffer[] = [];
  const res: any = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.headers = {}; res.statusCode = 0; res.payload = undefined;
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; return res; };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (value: unknown) => { res.payload = value; res.end(); return res; };
  const done = new Promise<void>((resolve, reject) => { res.once('finish', resolve); res.once('error', reject); });
  await fileHandler({ method, query: { group: 'group', file: objectName, ...query },
    headers: authorization ? { authorization } : {} } as any, res);
  await done;
  return { status: res.statusCode, payload: res.payload, headers: res.headers, body: Buffer.concat(chunks).toString() };
}

describe('durable school group materials', () => {
  it('lists for the assigned teacher, linked student and verified parent, with live revocation', async () => {
    expect((await list({ group: 'group' }, 'Bearer teacher-user')).payload.groups[0].files[0].name).toBe('Mokytojo planas.pdf');
    expect((await list({ student: 'child' })).payload.groups[0].files).toHaveLength(1);
    expect((await list({ student: 'child' }, 'Bearer parent-user')).statusCode).toBe(200);
    db.tables.school_contracts[0].terminated_at = new Date().toISOString();
    expect((await list({ student: 'child' }, 'Bearer parent-user')).statusCode).toBe(403);
    db.tables.school_class_group_members = db.tables.school_class_group_members.filter((row) => row.student_id !== 'child');
    expect((await list({ student: 'child' })).payload.groups).toEqual([]);
    db.tables.school_class_groups[0].tutor_id = 'new-teacher';
    expect((await list({ group: 'group' }, 'Bearer teacher-user')).statusCode).toBe(403);
    expect((await list({ group: 'group' }, 'Bearer new-teacher')).statusCode).toBe(200);
  });

  it('rejects a group in another organization and never falls back from invalid Bearer to an HMAC', async () => {
    db.tables.school_class_groups[0].organization_id = 'other-school';
    expect((await list({ student: 'child' })).payload.groups).toEqual([]);
    db.tables.school_class_groups[0].organization_id = 'school';
    db.tables.organizations[0].features.school_family_portal = false;
    const token = buildPublicLinkToken('homework', 'child');
    expect((await list({ student: 'child', t: token }, null)).statusCode).toBe(200);
    expect((await list({ student: 'child', t: 'wrong' }, null)).statusCode).toBe(403);
    expect((await list({ student: 'child', t: token }, 'Bearer invalid')).statusCode).toBe(401);
    db.tables.organizations[0].features.school_family_portal = true;
    expect((await list({ student: 'child', t: token }, null)).statusCode).toBe(403);
  });

  it('proxies only published files and rechecks membership after Storage downloads', async () => {
    expect(await file({ student: 'child' })).toMatchObject({ status: 200, body: 'Group plan', headers: {
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': "attachment; filename*=UTF-8''Mokytojo%20planas.pdf",
    } });
    db.tables.school_group_material_files.length = 0;
    const downloadsBefore = db.requests.filter((row) => row.path.includes('/object/school-group-materials/')).length;
    expect((await file({ student: 'child' })).status).toBe(403);
    expect(db.requests.filter((row) => row.path.includes('/object/school-group-materials/'))).toHaveLength(downloadsBefore);
    db.tables.school_group_material_files.push({ id: 'material-1', group_id: 'group', object_name: objectName,
      file_name: 'Mokytojo planas.pdf', size_bytes: 9, uploaded_by: 'teacher-user',
      created_at: '2026-09-29T10:00:00Z', published_at: '2026-09-29T10:01:00Z' });
    db.hooks.download = () => { db.tables.school_class_group_members = db.tables.school_class_group_members.filter((row) => row.student_id !== 'child'); };
    expect((await file({ student: 'child' })).status).toBe(403);
  });

  it('serves the legacy parent link only with its valid HMAC and current membership', async () => {
    db.tables.organizations[0].features.school_family_portal = false;
    const token = buildPublicLinkToken('homework', 'child');
    expect((await file({ student: 'child', t: token }, null)).body).toBe('Group plan');
    expect((await file({ student: 'child', t: 'invalid' }, null)).status).toBe(403);
    db.tables.school_class_group_members = db.tables.school_class_group_members.filter((row) => row.student_id !== 'child');
    expect((await file({ student: 'child', t: token }, null)).status).toBe(403);
  });

  it('keeps a signed upload hidden until its original teacher publishes it', async () => {
    const prepared = await post({ action: 'upload-url', group: 'group', fileName: 'Užduotis.pdf', size: 20 });
    expect(prepared.statusCode).toBe(200);
    const name = String(prepared.payload.path).split('/').at(-1)!;
    expect((await list({ student: 'child' })).payload.groups[0].files).toHaveLength(1);
    db.groupFiles[prepared.payload.path] = { body: 'New material', type: 'application/pdf' };
    db.tables.school_class_groups[0].tutor_id = 'new-teacher';
    expect((await post({ action: 'publish', group: 'group', file: name })).statusCode).toBe(403);
    expect((await file({ student: 'child', file: name })).status).toBe(403);
    db.tables.school_class_groups[0].tutor_id = 'teacher-user';
    expect((await post({ action: 'publish', group: 'group', file: name })).statusCode).toBe(200);
    expect((await file({ student: 'child', file: name })).body).toBe('New material');
    expect((await post({ action: 'remove', group: 'group', file: name })).statusCode).toBe(200);
    expect((await file({ student: 'child', file: name })).status).toBe(403);
  });

  it('refuses removal when the teacher is reassigned during the request', async () => {
    let reads = 0;
    db.hooks.afterGroupRead = () => {
      if (++reads === 1) db.tables.school_class_groups[0].tutor_id = 'new-teacher';
    };
    const removed = await post({ action: 'remove', group: 'group', file: objectName });
    expect(removed.statusCode).toBe(403);
    expect(db.tables.school_group_material_files).toHaveLength(1);
    expect(db.groupFiles[`group/${objectName}`]).toBeDefined();
  });
});
