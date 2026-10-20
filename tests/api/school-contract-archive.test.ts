import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({
  auth: { userId: 'accountant' } as any,
  access: { organizationId: 'org', role: 'accountant', permissions: {} } as any,
  rows: [] as any[],
  logs: [] as RowQueryLog[],
  writes: [] as any[],
  sign: vi.fn(),
  download: vi.fn(),
  regenerate: vi.fn(),
  fail: false,
}));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.auth }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.access }));
vi.mock('../../api/_lib/ensureSchoolContractPdfPath.js', () => ({ resolveSchoolContractPdfStoragePath: state.regenerate }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: (table: string) => {
    const q = rowQuery(table, () => state.rows, state.logs, state.writes);
    q.or = (clause: string) => {
      expect(clause).toBe('party_kind.eq.student,party_kind.is.null');
      return q.in('party_kind', ['student', null]);
    };
    const range = q.range;
    q.range = (from: number, to: number) => range(from, Math.min(to, from + 1));
    if (state.fail) q.then = (resolve: any) => Promise.resolve({ data: null, error: { message: 'Unavailable' } }).then(resolve);
    return q;
  },
  storage: { from: (bucket: string) => {
    expect(bucket).toBe('school-contracts');
    return { createSignedUrl: state.sign, download: state.download };
  } },
}) }));
import handler from '../../api/school-contract-archive';
import exportZip from '../../api/school-contracts-export-zip';

function response(): any {
  return { statusCode: 0, body: null, headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    end(body: any) { this.body = this.headers['Content-Type'].includes('application/json') ? JSON.parse(body) : body; },
  };
}
const request = (method = 'GET', body?: object) => ({ method, body, query: {} }) as any;

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  state.auth = { userId: 'accountant' };
  state.access = { organizationId: 'org', role: 'accountant', permissions: {} };
  state.logs = []; state.writes = []; state.fail = false;
  state.sign.mockReset().mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed-original' }, error: null });
  state.download.mockReset().mockResolvedValue({ data: { arrayBuffer: async () => new TextEncoder().encode('%PDF-original').buffer }, error: null });
  state.regenerate.mockReset();
  const base = { organization_id: 'org', archived_at: '2026-10-01', party_kind: 'student', staff_document_type: null,
    pdf_url: 'org/contracts/original.pdf', student: { full_name: 'Student', payer_name: 'Parent', payer_email: 'parent@example.test' } };
  state.rows = [
    { ...base, id: 'archived', contract_number: 'SUT-1', signatures: [{ role: 'parent_secondary', status: 'signed', signed_pdf_path: 'org/signed/original.pdf' }] },
    { ...base, id: 'legacy', contract_number: 'SUT-2', party_kind: null },
    { ...base, id: 'no-file', pdf_url: null },
    { ...base, id: 'active', archived_at: null },
    { ...base, id: 'foreign', organization_id: 'other' },
    { ...base, id: 'teacher', party_kind: 'teacher' },
    { ...base, id: 'staff', staff_document_type: 'consent' },
    { ...base, id: 'wrong-file', pdf_url: 'other/private.pdf' },
  ];
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('archived family contract access', () => {
  it('lets an accountant list every archived family contract without extra permissions or storage paths', async () => {
    const res = response(); await handler(request('GET', { organizationId: 'other' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.body.contracts.map((row: any) => row.id)).toEqual(['archived', 'legacy', 'no-file', 'wrong-file']);
    expect(res.body.contracts[0]).toMatchObject({ studentName: 'Student', payerName: 'Parent', hasFile: true });
    expect(res.body.contracts[2].hasFile).toBe(false);
    expect(res.body.contracts[3].hasFile).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('org/signed/');
    expect(state.writes).toEqual([]);
  });

  it('serves the preserved final signed copy to a finance reader without generating a new document', async () => {
    state.access = { organizationId: 'org', role: 'custom', permissions: { 'finance.view': true } };
    const res = response(); await handler(request('POST', { contractId: 'archived', path: 'other/private.pdf' }), res);
    expect(res.statusCode).toBe(200);
    expect(state.sign).toHaveBeenCalledWith('org/signed/original.pdf', 900, { download: true });
    expect(state.regenerate).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });

  it('also lets a contracts reader view the archive', async () => {
    state.access = { organizationId: 'org', role: 'custom', permissions: { 'contracts.view': true } };
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(200);
  });

  it.each(['active', 'foreign', 'teacher', 'staff', 'no-file', 'wrong-file', 'unknown'])('does not sign the inaccessible contract %s', async id => {
    const res = response(); await handler(request('POST', { contractId: id }), res);
    expect(res.statusCode).toBe(404);
    expect(state.sign).not.toHaveBeenCalled();
  });

  it.each([null, { organizationId: 'org', role: 'custom', permissions: { 'students.view': true } }])('rejects missing archive permissions before reading contracts', async access => {
    state.access = access;
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(403);
    expect(state.logs).toEqual([]);
  });

  it.each([null, { userId: 'internal', isInternal: true }])('requires a user session', async auth => {
    state.auth = auth;
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(401);
    expect(state.logs).toEqual([]);
  });

  it('reports a database error instead of an empty archive', async () => {
    state.fail = true; vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    const res = response(); await handler(request(), res);
    expect(res.statusCode).toBe(500);
  });
});

describe('accountant archive ZIP downloads', () => {
  it('exports archived contracts without regenerating files and reports inaccessible requested ids', async () => {
    const res = response(); await exportZip(request('POST', { studentContractIds: ['archived', 'foreign', 'active'], archivedOnly: true }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/zip');
    expect(res.headers['X-Contract-Zip-Downloaded']).toBe('1');
    expect(res.headers['X-Contract-Zip-Failed']).toBe('foreign,active');
    expect(state.download).toHaveBeenCalledExactlyOnceWith('org/signed/original.pdf');
    expect(state.regenerate).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });

  it.each([
    { teacherContractIds: ['teacher'], archivedOnly: true },
    { staffDocumentIds: ['staff'], archivedOnly: true },
    { studentContractIds: ['active'] },
  ])('does not expand accountant permissions to staff or active contracts: %s', async body => {
    const res = response(); await exportZip(request('POST', body), res);
    expect(res.statusCode).toBe(403);
    expect(state.logs).toEqual([]);
    expect(state.download).not.toHaveBeenCalled();
  });
});
