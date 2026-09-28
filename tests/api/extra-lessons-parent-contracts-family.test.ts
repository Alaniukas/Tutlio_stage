// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolMaterialDatabase } from '../fixtures/schoolMaterialDatabase';
import { schoolFamilyPersonalCodeHash } from '../../api/_lib/schoolFamilyGuardianAccess';
const state = vi.hoisted(() => ({ client: null as any, userId: 'parent-user' as string | null }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId } : null }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => state.client }));
import handler from '../../api/extra-lessons-parent-contracts';

let db: ReturnType<typeof schoolMaterialDatabase>;
let signedPaths: string[];
let afterContractQuery: (() => void) | undefined;
let afterSigning: (() => void) | undefined;
beforeEach(() => {
  db = schoolMaterialDatabase(); state.userId = 'parent-user'; signedPaths = [];
  afterContractQuery = undefined; afterSigning = undefined;
  db.tables.students[0].parent_user_id = 'parent-user';
  db.tables.parent_profiles = [{ id: 'secondary-profile', user_id: 'secondary-user' }];
  db.tables.parent_students = [{ parent_id: 'secondary-profile', student_id: 'child' }];
  Object.assign(db.tables.school_contracts[0], { contract_number: 'A-1', signed_contract_url: 'school/contracts/annual/annual.pdf', party_kind: 'student' });
  db.tables.school_contracts.push({ id: 'extra', organization_id: 'school', student_id: 'child', kind: 'extra_lessons',
    contract_number: 'E-1', signing_status: 'signed', accepted_at: '2026-09-01T12:00:00Z', archived_at: null,
    pdf_url: 'school/contracts/extra/extra.pdf', party_kind: 'student' });
  state.client = createClient('https://school-contract-test.invalid', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith('/storage/v1/object/sign/school-contracts/')) {
        signedPaths.push(url.pathname); afterSigning?.();
        return new Response(JSON.stringify({ signedURL: `/object/sign/school-contracts/owned.pdf?token=test` }), { headers: { 'Content-Type': 'application/json' } });
      }
      const result = await db.transport(input, init);
      if (url.pathname.endsWith('/school_contracts') && url.searchParams.has('order')) afterContractQuery?.();
      return result;
    } },
  });
});
async function request(query: Record<string, string> = {}) {
  const res: any = { statusCode: 0, payload: undefined, headers: {},
    setHeader(name: string, value: unknown) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.payload = value; return this; } };
  await handler({ method: 'GET', headers: {}, query } as any, res); return res;
}
const file = { file: 'pdf', contract_id: 'annual' };
describe('family parent contract privacy through the service route', () => {
  it.each(['student-user', 'secondary-user'])('denies child or stale secondary identity %s before private contract queries or PDF signing', async (userId) => {
    state.userId = userId;
    expect((await request()).payload).toEqual({ ok: true, contracts: [] });
    expect((await request(file)).statusCode).toBe(404);
    expect(signedPaths).toEqual([]);
    // Guardian evidence checks may inspect an annual contract, but no contract-list query may run.
    expect(db.requests.filter((call) => call.table === 'school_contracts' && call.method === 'GET').length).toBe(0);
  });

  it('returns annual and extra contracts and signs a PDF for the current distinct primary guardian', async () => {
    const list = await request();
    expect(list.statusCode).toBe(200); expect(list.headers['Cache-Control']).toBe('private, no-store');
    expect(list.payload.contracts.map((contract: any) => contract.id).sort()).toEqual(['annual', 'extra']);
    expect((await request(file)).payload.url).toContain('/object/sign/school-contracts/');
    expect(signedPaths).toHaveLength(1);
  });

  it('rejects a shared child identity even when it retains the primary binding and legacy parent link', async () => {
    state.userId = 'parent-user'; db.tables.students[0].linked_user_id = 'parent-user';
    db.tables.parent_profiles.push({ id: 'shared-profile', user_id: 'parent-user' });
    db.tables.parent_students.push({ parent_id: 'shared-profile', student_id: 'child' });
    expect((await request()).payload.contracts).toEqual([]);
    expect((await request(file)).statusCode).toBe(404); expect(signedPaths).toEqual([]);
  });

  it('requires the current signed primary identity even when the old parent user link still matches', async () => {
    Object.assign(db.tables.school_family_guardians[0], { evidence_source: 'signed_primary', signature_id: 'primary-signature',
      signature_personal_code_hash: schoolFamilyPersonalCodeHash('verified-parent') });
    db.tables.school_contract_signatures.push({ id: 'primary-signature', contract_id: 'annual', role: 'parent_primary',
      status: 'signed', signer_name: 'Test Parent', signer_email: 'parent@example.test', signer_personal_code: 'verified-parent' });
    expect((await request(file)).statusCode).toBe(200);
    db.tables.school_contract_signatures[0].signer_personal_code = 'other-parent';
    expect((await request(file)).statusCode).toBe(404); expect(signedPaths).toHaveLength(1);
  });

  it('rechecks a revoked annual binding after reading a contract and after signing instead of disclosing the grant', async () => {
    afterContractQuery = () => { db.tables.school_contracts[0].terminated_at = '2026-09-28T12:00:00Z'; };
    expect((await request(file)).statusCode).toBe(404); expect(signedPaths).toEqual([]);
    db.tables.school_contracts[0].terminated_at = null; afterContractQuery = undefined;
    afterSigning = () => { db.tables.school_family_guardians = []; };
    expect((await request(file)).statusCode).toBe(404); expect(signedPaths).toHaveLength(1);
  });

  it('does not fall back to a stale parent link when strict evidence or organization metadata is unavailable', async () => {
    db.hooks.failedTable = 'school_family_guardians';
    expect((await request(file)).statusCode).toBe(503); expect(signedPaths).toEqual([]);
    db.hooks.failedTable = 'organizations';
    expect((await request()).statusCode).toBe(503);
  });

  it('preserves a non-opted school secondary link and child access without requiring the new guardian table', async () => {
    db.tables.organizations[0].features = { school_family_accounts_setup: true };
    db.hooks.failedTable = 'school_family_guardians';
    state.userId = 'secondary-user'; expect((await request(file)).statusCode).toBe(200);
    state.userId = 'student-user'; expect((await request()).payload.contracts).toHaveLength(2);
    expect(db.requests.some((call) => call.table === 'school_family_guardians')).toBe(false);
  });
});
