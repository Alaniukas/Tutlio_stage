// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExtraLessonsOrderSnapshot } from '../../src/lib/extraLessonsContract';

const state = vi.hoisted(() => ({
  client: null as any,
  featureEnabled: true,
  authorizedOrg: 'school',
  emails: [] as any[],
  pdf: vi.fn(),
}));
const access = vi.hoisted(() => vi.fn());

vi.mock('../../api/_lib/schoolConsultationsAccess.js', () => ({
  serviceSupabase: () => state.client,
  assertOrgExtraLessonsDiscountEnabled: async () => state.featureEnabled
    ? { ok: true } : { ok: false, status: 404, error: 'Feature disabled' },
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: access }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
vi.mock('../../api/_lib/schoolDiscountAgreementPdf.js', () => ({ generateSchoolDiscountAgreementPdf: state.pdf }));
vi.mock('../../api/_lib/schoolContractPdf.js', () => ({ fillPlaceholders: (value: string) => value }));

import offerHandler from '../../api/school-discount-offer';
import acceptHandler from '../../api/school-discount-accept';
import { schoolDiscountTokenHash } from '../../api/_lib/schoolDiscountAgreementShared';

function database(seed: Record<string, any[]>) {
  const tables = structuredClone(seed);
  const requests: Array<{ table: string; method: string; payload?: any }> = [];
  const uploads: string[] = [];
  const missingFiles = new Set<string>();
  const failedDownloads = new Set<string>();
  let cancelOnAcceptance = false;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || 'GET';
    const headers = new Headers(init?.headers);
    if (url.pathname.startsWith('/storage/')) {
      const path = decodeURIComponent(url.pathname.split('/school-contracts/')[1] || '');
      if (url.pathname.includes('/object/sign/')) {
        if (missingFiles.has(path)) return new Response(JSON.stringify({ message: 'Missing document' }), { status: 404 });
        return new Response(JSON.stringify({ signedURL: `/object/sign/school-contracts/${path}?token=test` }), { status: 200 });
      }
      if (method === 'GET') {
        if (failedDownloads.has(path)) return new Response(JSON.stringify({ message: 'Download unavailable' }), { status: 503 });
        return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
      }
      uploads.push(path);
      return new Response(JSON.stringify({ Key: `school-contracts/${path}` }), { status: 200 });
    }
    const table = url.pathname.split('/').at(-1)!;
    if (!tables[table]) throw new Error(`Unexpected table ${table}`);
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ table, method, payload });
    if (cancelOnAcceptance && table === 'school_discount_agreements' && payload?.status === 'accepted') {
      tables[table][0].status = 'cancelled';
      cancelOnAcceptance = false;
    }
    const matches = (row: any) => [...url.searchParams].every(([field, expression]) => {
      if (['select', 'columns', 'on_conflict', 'order', 'offset', 'limit'].includes(field)) return true;
      if (expression.startsWith('eq.')) return String(row[field]) === expression.slice(3);
      if (expression.startsWith('neq.')) return String(row[field]) !== expression.slice(4);
      if (expression === 'is.null') return row[field] == null;
      if (expression === 'not.is.null') return row[field] != null;
      throw new Error(`Unexpected filter ${field}=${expression}`);
    });
    let rows = tables[table].filter(matches);
    if (method === 'GET') {
      const order = url.searchParams.get('order');
      if (order) {
        const [field, direction] = order.split('.');
        rows.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
      }
      const limit = Number(url.searchParams.get('limit') || rows.length);
      rows = rows.slice(0, limit).map(row => ({ ...row }));
    } else if (method === 'PATCH') {
      rows.forEach(row => Object.assign(row, payload));
    } else if (method === 'POST') {
      rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({
        id: `${table}-${tables[table].length + 1}`, created_at: new Date().toISOString(),
        ...(table === 'school_discount_agreements' ? { status: 'pending' } : {}), ...row,
      }));
      tables[table].push(...rows);
    } else throw new Error(`Unexpected method ${method}`);
    const json = headers.get('Accept')?.includes('vnd.pgrst.object') ? rows[0] : rows;
    return method === 'GET' || headers.get('Prefer')?.includes('return=representation')
      ? new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status: 204 });
  };
  const client = createClient('https://discount-test.invalid', 'fake-service-key', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport },
  });
  state.client = client;
  return { tables, requests, uploads, missingFiles, failedDownloads, cancelOnAcceptance: () => { cancelOnAcceptance = true; } };
}

function seed() {
  return {
    organizations: [{ id: 'school', name: 'Demo school', email: 'school@example.invalid' }],
    students: [{ id: 'student', organization_id: 'school', full_name: 'Student', payer_name: 'Parent', payer_email: 'parent@example.invalid' }],
    school_contracts: [{ id: 'contract', organization_id: 'school', student_id: 'student', kind: 'extra_lessons',
      contract_number: 'PP-1', signing_status: 'sent', accepted_at: null, archived_at: null, terminated_at: null,
      withdrawal_requested_at: null, pdf_url: 'school/contracts/contract/main.pdf', class_group_id: 'group',
      order_snapshot: buildExtraLessonsOrderSnapshot({ service_name: 'Group class', service_type: 'group',
        duration_minutes: 60, start_date: '2026-09-01', end_date: '2027-06-30', unit_price_eur: 12,
        base_lessons_per_month: 4, group_id: 'group' }) }],
    school_class_groups: [{ id: 'group', organization_id: 'school', tutor_id: 'teacher', subject_id: null, name: 'Group class' }],
    school_discount_agreements: [] as any[],
    school_contract_completion_tokens: [{ id: 'parent-token-row', contract_id: 'contract', token: 'parent-token',
      expires_at: new Date(Date.now() + 86400000).toISOString() }],
    invoice_profiles: [], sessions: [], recurring_individual_sessions: [], subjects: [] as any[], profiles: [] as any[],
  };
}

function pendingAgreement() {
  return { id: 'agreement', organization_id: 'school', student_id: 'student', contract_id: 'contract',
    agreement_number: 'NPR-1', status: 'pending', activity_label: 'Group class', discount_type: 'percent',
    discount_value: 25, valid_from: '2026-09-01', valid_until: '2027-06-30', recipient_name: 'Parent',
    recipient_email: 'parent@example.invalid', created_at: '2026-09-28T08:00:00Z',
    acceptance_token_hash: schoolDiscountTokenHash('annex-token'), token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    accepted_at: null, pdf_path: null };
}

const req = (method: string, data: any) => ({ method, headers: { host: 'localhost:3000' },
  ...(method === 'GET' ? { query: data } : { body: data }) }) as any;
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as any;
const bodyOf = (res: any) => res.json.mock.calls.at(-1)?.[0];

beforeEach(() => {
  state.emails = [];
  state.featureEnabled = true;
  state.authorizedOrg = 'school';
  access.mockReset().mockImplementation(async () => ({ ok: true, access: { organizationId: state.authorizedOrg, userId: 'admin' } }));
  state.pdf.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    state.emails.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 200 });
  }));
});

describe('discount annex alongside an unsigned extra-lessons contract', () => {
  it('prepares the proposal and sends one message containing both document links', async () => {
    const db = database(seed());
    const res = response();
    await offerHandler(req('POST', { action: 'create', studentId: 'student', contractId: 'contract',
      subjectId: null, tutorId: 'teacher', discountType: 'percent', discountValue: 25,
      validFrom: '2026-09-01', validUntil: '2027-06-30' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(access).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'finance.edit');
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({ acceptedAt: null, acceptanceStatement: null, contractAccepted: false }));
    expect(db.tables.school_discount_agreements[0]).toMatchObject({ status: 'pending', subject_id: null });
    expect(db.tables.school_discount_agreements[0].pdf_path).toContain('-pasiulymas.pdf');
    expect(db.tables.school_discount_agreements[0].document_sha256).toBeUndefined();
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]).toMatchObject({ type: 'school_discount_offer', data: { contractAccepted: false, documentsAttached: true,
      contractAcceptUrl: 'http://localhost:3000/school-extra-lessons-accept?token=parent-token' } });
    expect(state.emails[0].data.pdfUrl).toBeNull();
    expect(state.emails[0].data.contractPdfUrl).toBeNull();
    expect(state.emails[0].attachments).toEqual([
      { filename: 'Sutartis-PP-1.pdf', content: 'JVBERg==' },
      { filename: expect.stringMatching(/^Nuolaidos-priedas-NPR-.*\.pdf$/), content: 'JVBERg==' },
    ]);
    expect(bodyOf(res).pdfUrl).toContain('-pasiulymas.pdf');
  });

  it('finds an individual activity from its own school subject before lessons exist', async () => {
    const data = seed();
    Object.assign(data.school_contracts[0], { class_group_id: null, order_snapshot: {
      ...data.school_contracts[0].order_snapshot, service_type: 'individual', subject_id: 'math', group_id: null } });
    data.subjects.push({ id: 'math', name: 'Math', tutor_id: 'teacher' });
    data.profiles.push({ id: 'teacher', organization_id: 'school', full_name: 'Teacher' });
    const db = database(data);
    const res = response();
    await offerHandler(req('POST', { action: 'options', studentId: 'student', contractId: 'contract' }), res);
    expect(bodyOf(res).activities).toEqual([{ subjectId: 'math', tutorId: 'teacher', label: 'Group class' }]);
    db.tables.profiles[0].organization_id = 'foreign-school';
    const forbidden = response();
    await offerHandler(req('POST', { action: 'options', studentId: 'student', contractId: 'contract' }), forbidden);
    expect(bodyOf(forbidden).activities).toEqual([]);
  });

  it('offers a contract-scoped individual addendum when its frozen subject was deleted', async () => {
    const data = seed();
    Object.assign(data.school_contracts[0], { class_group_id: null, signing_status: 'signed',
      accepted_at: '2026-09-07T08:00:00Z', order_snapshot: {
        ...data.school_contracts[0].order_snapshot, service_type: 'individual', group_id: null,
        subject_id: 'deleted-subject', service_name: 'Rusų kalba Testinis mokinys',
      } });
    // The live series now uses a different subject. It must not redefine the signed addendum.
    (data.recurring_individual_sessions as any[]).push({ student_id: 'student', active: true,
      subject_id: 'replacement-subject', tutor_id: 'teacher', subject: { name: 'Rusų kalba' },
      tutor: { full_name: 'Teacher', organization_id: 'school' } });
    data.subjects.push({ id: 'replacement-subject', name: 'Rusų kalba', tutor_id: 'teacher' });
    const db = database(data);
    const options = response();
    await offerHandler(req('POST', { action: 'options', studentId: 'student', contractId: 'contract' }), options);
    expect(bodyOf(options).activities).toEqual([
      { subjectId: null, tutorId: null, label: 'Rusų kalba Testinis mokinys' },
    ]);
    expect(bodyOf(options).contractAccepted).toBe(true);

    const res = response();
    await offerHandler(req('POST', { action: 'create', studentId: 'student', contractId: 'contract',
      subjectId: null, tutorId: null, discountType: 'percent', discountValue: 25,
      validFrom: '2026-10-01', validUntil: '2027-06-30' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.tables.school_discount_agreements[0]).toMatchObject({ contract_id: 'contract',
      subject_id: null, tutor_id: null, activity_label: 'Rusų kalba Testinis mokinys' });
    expect(db.tables.school_contracts[0].order_snapshot.subject_id).toBe('deleted-subject');
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0].attachments).toHaveLength(1);
  });

  it('allows an individual contract without subject metadata but rejects unrelated activity IDs', async () => {
    const data = seed();
    Object.assign(data.school_contracts[0], { class_group_id: null, order_snapshot: {
      ...data.school_contracts[0].order_snapshot, service_type: 'individual', group_id: null,
      subject_id: null, service_name: 'Individualus užsiėmimas',
    } });
    const db = database(data);
    const options = response();
    await offerHandler(req('POST', { action: 'options', studentId: 'student', contractId: 'contract' }), options);
    expect(bodyOf(options).activities).toEqual([
      { subjectId: null, tutorId: null, label: 'Individualus užsiėmimas' },
    ]);

    const res = response();
    await offerHandler(req('POST', { action: 'create', studentId: 'student', contractId: 'contract',
      subjectId: 'other-subject', tutorId: 'other-teacher', discountType: 'percent', discountValue: 25,
      validFrom: '2026-10-01', validUntil: '2027-06-30' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(bodyOf(res).error).toContain('nepriskirtas šiam mokiniui');
    expect(db.tables.school_discount_agreements).toEqual([]);
    expect(state.emails).toEqual([]);
  });

  it('renews an expired main-contract link before the combined offer is sent', async () => {
    const data = seed(); data.school_contract_completion_tokens[0].expires_at = '2020-01-01T00:00:00Z';
    const db = database(data);
    const res = response();
    await offerHandler(req('POST', { action: 'create', studentId: 'student', contractId: 'contract',
      subjectId: null, tutorId: 'teacher', discountType: 'percent', discountValue: 25,
      validFrom: '2026-09-01', validUntil: '2027-06-30' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(db.tables.school_contract_completion_tokens).toHaveLength(2);
    const renewed = db.tables.school_contract_completion_tokens[1];
    expect(renewed.token).toMatch(/^[a-f0-9]{64}$/);
    expect(state.emails[0].data.contractAcceptUrl).toContain(`token=${renewed.token}`);
  });

  it('does not send a message when either document cannot be prepared', async () => {
    for (const unavailable of ['main', 'annex']) {
      const db = database(seed());
      if (unavailable === 'main') db.missingFiles.add('school/contracts/contract/main.pdf');
      else state.pdf.mockRejectedValueOnce(new Error('Renderer unavailable'));
      const res = response();
      await offerHandler(req('POST', { action: 'create', studentId: 'student', contractId: 'contract',
        subjectId: null, tutorId: 'teacher', discountType: 'percent', discountValue: 25,
        validFrom: '2026-09-01', validUntil: '2027-06-30' }), res);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(bodyOf(res).emailSent).toBe(false);
      expect(state.emails).toEqual([]);
    }
  });

  it('keeps a previous pending proposal usable when the replacement PDF fails', async () => {
    const data = seed(); data.school_discount_agreements.push({ ...pendingAgreement(), subject_id: null, tutor_id: 'teacher' });
    const db = database(data);
    state.pdf.mockRejectedValueOnce(new Error('Renderer unavailable'));
    const res = response();
    await offerHandler(req('POST', { action: 'create', studentId: 'student', contractId: 'contract',
      subjectId: null, tutorId: 'teacher', discountType: 'percent', discountValue: 50,
      validFrom: '2026-09-01', validUntil: '2027-06-30' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(db.tables.school_discount_agreements[0].status).toBe('pending');
    expect(db.tables.school_discount_agreements[1].status).toBe('cancelled');
    expect(state.emails).toEqual([]);
  });

  it('preserves the earlier offer when a document attachment cannot be downloaded', async () => {
    const data = seed(); data.school_discount_agreements.push({ ...pendingAgreement(), subject_id: null, tutor_id: 'teacher' });
    const db = database(data);
    db.failedDownloads.add('school/contracts/contract/main.pdf');
    const res = response();
    await offerHandler(req('POST', { action: 'create', studentId: 'student', contractId: 'contract',
      subjectId: null, tutorId: 'teacher', discountType: 'percent', discountValue: 50,
      validFrom: '2026-09-01', validUntil: '2027-06-30' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(db.tables.school_discount_agreements[0].status).toBe('pending');
    expect(db.tables.school_discount_agreements[1].status).toBe('cancelled');
    expect(state.emails).toEqual([]);
  });

  it('rejects foreign and ended contracts before any proposal is created', async () => {
    for (const patch of [{ organization_id: 'foreign' }, { kind: 'annual' }, { signing_status: 'draft' },
      { terminated_at: '2026-09-28' }, { archived_at: '2026-09-28' }, { withdrawal_requested_at: '2026-09-28' }]) {
      const data = seed();
      Object.assign(data.school_contracts[0], patch);
      const db = database(data);
      const res = response();
      await offerHandler(req('POST', { action: 'options', studentId: 'student', contractId: 'contract' }), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(db.tables.school_discount_agreements).toEqual([]);
    }
  });

  it('renders a pending proposal through the main token without recording acceptance', async () => {
    const data = seed(); data.school_discount_agreements.push(pendingAgreement());
    const db = database(data);
    const res = response();
    await acceptHandler(req('GET', { contractToken: 'parent-token', agreementId: 'agreement' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toMatchObject({ status: 'pending', contractAccepted: false, acceptedAt: null });
    expect(bodyOf(res).pdfUrl).toContain('-pasiulymas.pdf');
    expect(JSON.stringify(bodyOf(res))).not.toContain('acceptance_token_hash');
    expect(db.tables.school_discount_agreements[0].status).toBe('pending');
    expect(state.emails).toEqual([]);
  });

  it('records annex consent before the main signature, with distinct final evidence', async () => {
    const data = seed(); data.school_discount_agreements.push(pendingAgreement());
    const db = database(data);
    const res = response();
    await acceptHandler(req('POST', { contractToken: 'parent-token', agreementId: 'agreement' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toMatchObject({ status: 'accepted', contractAccepted: false });
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({ contractAccepted: false, acceptedAt: expect.any(String) }));
    expect(db.tables.school_contracts[0].accepted_at).toBeNull();
    expect(db.tables.school_discount_agreements[0].document_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(db.tables.school_discount_agreements[0].pdf_path).not.toContain('-pasiulymas.pdf');
    expect(db.tables.school_discount_agreements[0].acceptance_evidence.contract_accepted).toBe(false);
  });

  it('keeps the original annex token working after the main contract was accepted', async () => {
    const data = seed(); data.school_discount_agreements.push(pendingAgreement());
    Object.assign(data.school_contracts[0], { signing_status: 'signed', accepted_at: '2026-09-28T08:00:00Z',
      signed_contract_url: 'school/contracts/contract/signed.pdf' });
    const db = database(data);
    const res = response();
    await acceptHandler(req('POST', { token: 'annex-token' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res)).toMatchObject({ status: 'accepted', contractAccepted: true, contractAcceptUrl: null });
    expect(bodyOf(res).contractPdfUrl).toContain('signed.pdf');
    expect(db.tables.school_discount_agreements[0].acceptance_evidence.contract_accepted).toBe(true);
  });

  it('does not reuse an unrelated main token supplied with a valid annex token', async () => {
    const data = seed(); data.school_discount_agreements.push(pendingAgreement());
    database(data);
    const res = response();
    await acceptHandler(req('GET', { token: 'annex-token', contractToken: 'foreign-parent-token', agreementId: 'foreign-annex' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bodyOf(res).contractAcceptUrl).toBe('http://localhost:3000/school-extra-lessons-accept?token=parent-token');
  });

  it('freezes one winning PDF when two requests accept the same proposal concurrently', async () => {
    const data = seed(); data.school_discount_agreements.push(pendingAgreement());
    const db = database(data);
    const responses = [response(), response()];
    await Promise.all(responses.map(res => acceptHandler(req('POST', { token: 'annex-token' }), res)));
    const agreement = db.tables.school_discount_agreements[0];
    expect(agreement.status).toBe('accepted');
    expect(new Set(db.uploads).size).toBe(2);
    for (const res of responses) {
      expect(res.status).toHaveBeenCalledWith(200);
      expect(bodyOf(res).acceptedAt).toBe(agreement.accepted_at);
      expect(bodyOf(res).pdfUrl).toContain(agreement.pdf_path);
    }
    const again = response();
    state.featureEnabled = false;
    await acceptHandler(req('GET', { token: 'annex-token' }), again);
    expect(again.status).toHaveBeenCalledWith(200);
    expect(bodyOf(again).pdfUrl).toContain(agreement.pdf_path);
    expect(state.pdf).toHaveBeenCalledTimes(2);
  });

  it('scopes main-token capabilities to the exact contract, student, and school', async () => {
    for (const patch of [{ contract_id: 'foreign-contract' }, { student_id: 'foreign-student' }, { organization_id: 'foreign-school' }]) {
      const data = seed(); data.school_discount_agreements.push({ ...pendingAgreement(), ...patch });
      database(data);
      const res = response();
      await acceptHandler(req('POST', { contractToken: 'parent-token', agreementId: 'agreement' }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    }
    const data = seed(); data.students[0].organization_id = 'foreign-school';
    data.school_discount_agreements.push(pendingAgreement());
    database(data);
    const res = response();
    await acceptHandler(req('POST', { contractToken: 'parent-token', agreementId: 'agreement' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rejects cancelled, expired, and ended offers without a false acceptance', async () => {
    for (const condition of ['cancelled', 'expired', 'ended']) {
      const data = seed(); const agreement = pendingAgreement();
      if (condition === 'cancelled') agreement.status = 'cancelled';
      if (condition === 'expired') agreement.token_expires_at = '2020-01-01T00:00:00Z';
      if (condition === 'ended') data.school_contracts[0].terminated_at = '2026-09-28';
      data.school_discount_agreements.push(agreement);
      const db = database(data);
      const res = response();
      await acceptHandler(req('POST', { token: 'annex-token' }), res);
      expect(res.status).toHaveBeenCalledWith(condition === 'ended' ? 409 : 410);
      expect(db.tables.school_discount_agreements[0].accepted_at).toBeNull();
    }
  });

  it('does not report success if the pending agreement was replaced while accepting', async () => {
    const data = seed(); data.school_discount_agreements.push(pendingAgreement());
    const db = database(data); db.cancelOnAcceptance();
    const res = response();
    await acceptHandler(req('POST', { token: 'annex-token' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.tables.school_discount_agreements[0]).toMatchObject({ status: 'cancelled', accepted_at: null, pdf_path: null });
  });
});
