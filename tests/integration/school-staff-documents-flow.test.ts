// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeSupabase } from '../helpers/fakeSupabase';
import { schoolContractPdfStoragePath } from '../../src/lib/schoolContractPdfPath';
import { advanceAfterRoleSigned } from '../../api/_lib/schoolContractSigning';
import { PDFDocument } from 'pdf-lib';

const state = vi.hoisted(() => ({
  client: null as any,
  render: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.client }));
vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: async () => ({ userId: 'admin-1', isInternal: false }),
}));
vi.mock('../../api/_lib/orgAdminAccess', () => ({
  getOrgAdminAccessByUserId: async () => ({ organizationId: ORG_ID, role: 'owner', permissions: {} }),
}));
vi.mock('../../src/lib/orgAdminPermissions', () => ({ hasOrgAdminPermission: () => true }));
vi.mock('../../api/_lib/public-origin', () => ({ publicOriginFromRequest: () => 'https://example.test' }));
vi.mock('../../api/_lib/cronAuth', () => ({ requireCronAuth: () => true }));
vi.mock('../../api/_lib/schoolStaffDocuments', async (importOriginal) => ({
  ...(await importOriginal() as object),
  renderStaffDocumentPdf: state.render,
}));

import documentsHandler from '../../api/school-staff-documents';
import consentHandler from '../../api/school-staff-consent';
import retentionHandler from '../../api/school-staff-document-retention';

const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const CONSENT_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';

function response() {
  let body: any;
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end(value: string) { body = JSON.parse(value); return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  return { res, get body() { return body; } };
}

function setup() {
  const db = new FakeSupabase();
  db.db.organizations = [{
    id: ORG_ID,
    name: 'VšĮ Laisvi vaikai',
    entity_type: 'school',
    features: { school_staff_documents: true, school_contract_esign: true },
  }];
  const files = new Map<string, Buffer>();
  (db as any).storage = {
    from: () => ({
      async download(path: string) {
        const bytes = files.get(path);
        return bytes
          ? { data: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), error: null }
          : { data: null, error: { message: 'not found' } };
      },
      async upload(path: string, body: Buffer) {
        files.set(path, Buffer.from(body));
        return { data: { path }, error: null };
      },
      async list(folder: string, opts?: { search?: string }) {
        const names = new Map<string, { name: string; id: string | null }>();
        for (const path of files.keys()) {
          if (!path.startsWith(`${folder}/`)) continue;
          const rest = path.slice(folder.length + 1);
          const [name, ...tail] = rest.split('/');
          if (opts?.search && name !== opts.search) continue;
          names.set(name, { name, id: tail.length ? null : 'file-id' });
        }
        return { data: [...names.values()], error: null };
      },
      async remove(paths: string[]) {
        paths.forEach((path) => files.delete(path));
        return { error: null };
      },
      async createSignedUrl(path: string) {
        return { data: { signedUrl: `https://storage.test/${path}` }, error: null };
      },
    }),
  };
  state.client = db;
  return { db, files };
}

describe('prepared staff PDFs, consent and retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.SUPABASE_URL = 'https://supabase.test';
    state.render.mockResolvedValue(Buffer.from('%PDF-generated'));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
  });

  it('accepts the prepared agreement-and-annex PDF without regenerating it', async () => {
    const { db, files } = setup();
    const number = `DAR-${new Date().getFullYear()}-${EMPLOYEE_ID.slice(0, 8).toUpperCase()}`;
    const path = schoolContractPdfStoragePath({ organizationId: ORG_ID, contractId: EMPLOYEE_ID, contractNumber: number });
    const prepared = await PDFDocument.create();
    prepared.addPage([595, 842]);
    prepared.addPage([595, 842]);
    const preparedBytes = Buffer.from(await prepared.save());
    files.set(path, preparedBytes);
    const body = {
      action: 'create-bundle', confidentialityId: EMPLOYEE_ID, consentId: CONSENT_ID, groupId: GROUP_ID,
      preparedPdfPath: path, name: 'Vardas Pavardė', email: 'employee@example.com',
    };
    const reply = response();

    await documentsHandler({ method: 'POST', body } as any, reply.res as any);

    expect(reply.res.statusCode, JSON.stringify(reply.body)).toBe(201);
    expect(db.db.school_contracts).toHaveLength(2);
    expect(db.db.school_contracts).toContainEqual(expect.objectContaining({
      id: EMPLOYEE_ID,
      organization_id: ORG_ID,
      student_id: null,
      staff_document_type: 'confidentiality',
      staff_document_group_id: GROUP_ID,
      pdf_url: path,
      signing_status: 'awaiting_school_signature',
      staff_employment_contract_number: null,
      staff_employment_contract_date: null,
    }));
    expect(db.db.school_contracts).toContainEqual(expect.objectContaining({
      id: CONSENT_ID, staff_document_type: 'consent', staff_document_group_id: GROUP_ID,
      pdf_url: null, signing_status: 'draft',
    }));
    expect(files.get(path)).toEqual(preparedBytes);
    expect(state.render).not.toHaveBeenCalled();

    const retried = response();
    await documentsHandler({ method: 'POST', body } as any, retried.res as any);
    expect(retried.res.statusCode).toBe(200);
    expect(db.db.school_contracts).toHaveLength(2);
  });

  it('rejects a mismatched upload path and incomplete data for template generation', async () => {
    const { db } = setup();
    const base = {
      action: 'create-bundle', confidentialityId: EMPLOYEE_ID, consentId: CONSENT_ID,
      groupId: GROUP_ID, name: 'Vardas Pavardė', email: 'employee@example.com',
    };
    const missing = response();
    await documentsHandler({ method: 'POST', body: base } as any, missing.res as any);
    expect(missing.res.statusCode).toBe(400);
    const wrongPath = response();
    await documentsHandler({ method: 'POST', body: { ...base, preparedPdfPath: `${ORG_ID}/contracts/other.pdf` } } as any, wrongPath.res as any);
    expect(wrongPath.res.statusCode).toBe(400);
    expect(db.db.school_contracts || []).toHaveLength(0);
  });

  it('rejects malformed prepared PDFs and removes the unused upload', async () => {
    const { db, files } = setup();
    const number = `DAR-${new Date().getFullYear()}-${EMPLOYEE_ID.slice(0, 8).toUpperCase()}`;
    const path = schoolContractPdfStoragePath({ organizationId: ORG_ID, contractId: EMPLOYEE_ID, contractNumber: number });
    files.set(path, Buffer.from('%PDF-not-a-real-document'));
    const reply = response();
    await documentsHandler({ method: 'POST', body: {
      action: 'create-bundle', confidentialityId: EMPLOYEE_ID, consentId: CONSENT_ID,
      groupId: GROUP_ID, preparedPdfPath: path,
      name: 'Vardas Pavardė', email: 'employee@example.com',
    } } as any, reply.res as any);
    expect(reply.res.statusCode).toBe(400);
    expect(files.has(path)).toBe(false);
    expect(db.db.school_contracts || []).toHaveLength(0);
  });

  it('records ten independent choices without treating them as a signature', async () => {
    const { db, files } = setup();
    db.db.school_contracts = [{
      id: EMPLOYEE_ID, organization_id: ORG_ID, contract_number: 'DAR-2026-1',
      counterparty_name: 'Vardas Pavardė', counterparty_email: 'employee@example.com',
      signing_status: 'draft', staff_document_type: 'consent', staff_revoked_at: null,
      staff_consent_answers: null, staff_employment_contract_number: null,
      staff_employment_contract_date: null, organizations: db.db.organizations[0],
    }];
    db.db.school_contract_signatures = [{
      id: 'sig-1', contract_id: EMPLOYEE_ID, role: 'teacher', status: 'pending',
      token: 'safe-token', token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    }];
    const preview = response();
    await consentHandler({ method: 'GET', query: { token: 'safe-token' } } as any, preview.res as any);
    expect(preview.res.statusCode).toBe(200);
    expect(preview.body.previewUrl).toContain('consent-preview.pdf');
    expect(db.db.school_contracts[0].staff_viewed_at).toBeTruthy();

    const incomplete = response();
    await consentHandler({ method: 'POST', body: { token: 'safe-token', answers: Array(9).fill('yes') } } as any, incomplete.res as any);
    expect(incomplete.res.statusCode).toBe(400);

    const answers = Array.from({ length: 10 }, (_, index) => index % 2 ? 'no' : 'yes');
    const submitted = response();
    await consentHandler({ method: 'POST', body: { token: 'safe-token', answers } } as any, submitted.res as any);
    expect(submitted.res.statusCode).toBe(200);
    expect(db.db.school_contracts[0]).toMatchObject({
      staff_consent_answers: answers,
      signing_status: 'awaiting_school_signature',
    });
    expect(db.db.school_contracts[0].signed_at).toBeUndefined();
    expect(db.db.school_contract_signatures[0].status).toBe('pending');
    expect(files.get(db.db.school_contracts[0].pdf_url)?.toString()).toBe('%PDF-generated');
  });

  it('advances the combined agreement and separate consent through their own signatures', async () => {
    const { db } = setup();
    const ids = [EMPLOYEE_ID, '44444444-4444-4444-8444-444444444444'];
    const types = ['confidentiality', 'consent'];
    db.db.school_contracts = ids.map((id, index) => ({
      id, organization_id: ORG_ID, party_kind: 'teacher',
      staff_document_type: types[index], staff_document_group_id: GROUP_ID,
      counterparty_name: 'Vardas Pavardė', counterparty_email: 'employee@example.com',
      signing_status: 'awaiting_school_signature',
      staff_consent_answers: index === 1 ? Array(10).fill('no') : null,
      contract_number: `DAR-2026-${index + 1}`,
      organizations: { name: 'VšĮ Laisvi vaikai' },
    }));
    db.db.school_contract_signatures = ids.flatMap((id, index) => [
      { id: `school-${index}`, contract_id: id, role: 'school', order_index: 0,
        status: 'signed', signed_pdf_path: `${ORG_ID}/contracts/${id}/signed/school.pdf` },
      { id: `employee-${index}`, contract_id: id, role: 'teacher', order_index: 1,
        status: 'pending', token: `employee-token-${index}`,
        token_expires_at: new Date(Date.now() + 86400000).toISOString() },
    ]);
    const emails: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      emails.push(JSON.parse(String(init?.body || '{}')));
      return { ok: true, status: 200, text: async () => '' } as Response;
    }));

    for (const contract of db.db.school_contracts) {
      const schoolPath = `${ORG_ID}/contracts/${contract.id}/signed/school.pdf`;
      const result = await advanceAfterRoleSigned(db as any, contract, 'school', schoolPath, 'https://example.test');
      expect(result).toEqual({ contractStatus: 'signed_by_school', done: false });
    }
    expect(emails.filter((email) => email.type === 'school_teacher_contract_sign_request'))
      .toEqual(types.map((type, index) => expect.objectContaining({
        data: expect.objectContaining({
          staffDocumentType: type,
          signUrl: expect.stringContaining(`employee-token-${index}`),
        }),
      })));

    for (const contract of db.db.school_contracts) {
      const employeePath = `${ORG_ID}/contracts/${contract.id}/signed/teacher.pdf`;
      const employeeRow = db.db.school_contract_signatures.find((row) => row.contract_id === contract.id && row.role === 'teacher')!;
      employeeRow.status = 'signed';
      employeeRow.signed_pdf_path = employeePath;
      employeeRow.signed_at = new Date().toISOString();
      const result = await advanceAfterRoleSigned(db as any, contract, 'teacher', employeePath, 'https://example.test');
      expect(result).toEqual({ contractStatus: 'signed', done: true });
      expect(contract.signed_contract_url).toBe(employeePath);
      expect(contract.signed_at).toBeTruthy();
    }
    expect(emails.filter((email) => email.type === 'school_teacher_contract_fully_signed')).toHaveLength(2);
    expect(emails.some((email) => email.type === 'school_installment_request')).toBe(false);
    expect(db.db.school_contract_signatures.filter((row) => row.role.startsWith('parent'))).toHaveLength(0);
    expect(db.db.school_contract_signatures.filter((row) => row.role === 'teacher' && row.status === 'signed')).toHaveLength(2);
  });

  it('deletes only PDFs after 30 days and retains the minimal signing record', async () => {
    const { db, files } = setup();
    const folder = `${ORG_ID}/contracts/${EMPLOYEE_ID}`;
    files.set(`${folder}/agreement.pdf`, Buffer.from('%PDF-agreement'));
    files.set(`${folder}/signed/teacher.pdf`, Buffer.from('%PDF-signed'));
    files.set(`${folder}/audit.json`, Buffer.from('{}'));
    db.db.school_contracts = [{
      id: EMPLOYEE_ID, organization_id: ORG_ID, staff_document_type: 'confidentiality',
      signing_status: 'signed', signed_at: '2026-01-01T00:00:00.000Z',
      staff_files_deleted_at: null, pdf_url: `${folder}/agreement.pdf`,
      signed_contract_url: `${folder}/signed/teacher.pdf`,
      staff_consent_answers: Array(10).fill('yes'), counterparty_name: 'Vardas Pavardė',
    }];
    db.db.school_contract_signatures = [{
      id: 'sig-1', contract_id: EMPLOYEE_ID, role: 'teacher', status: 'signed',
      signed_at: '2026-01-01T00:00:00.000Z', signed_pdf_path: `${folder}/signed/teacher.pdf`,
      token: 'expired-token', signer_name: 'Vardas Pavardė',
    }];
    const reply = response();
    await retentionHandler({ method: 'GET' } as any, reply.res as any);

    expect(reply.res.statusCode).toBe(200);
    expect(files.has(`${folder}/agreement.pdf`)).toBe(false);
    expect(files.has(`${folder}/signed/teacher.pdf`)).toBe(false);
    expect(files.has(`${folder}/audit.json`)).toBe(true);
    expect(db.db.school_contracts[0]).toMatchObject({
      signing_status: 'signed', signed_at: '2026-01-01T00:00:00.000Z',
      counterparty_name: 'Vardas Pavardė', pdf_url: null, signed_contract_url: null,
      staff_consent_answers: null,
    });
    expect(db.db.school_contracts[0].staff_files_deleted_at).toBeTruthy();
    expect(db.db.school_contract_signatures[0]).toMatchObject({
      role: 'teacher', status: 'signed', signed_at: '2026-01-01T00:00:00.000Z',
      signer_name: 'Vardas Pavardė', signed_pdf_path: null, token: null,
    });
  });
});
