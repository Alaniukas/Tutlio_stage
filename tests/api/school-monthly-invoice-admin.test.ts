import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, writes: [] as any[], canEdit: true, adminOrg: 'org1' }));
vi.mock('../../api/_lib/schoolConsultationsAccess.js', () => ({
  requireConsultationsAuth: async () => ({ userId: 'admin1' }),
  assertOrgConsultationsEnabled: async () => ({ ok: true }),
  serviceSupabase: () => ({ from: query }),
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: async () => ({ ok: true, access: { userId: 'admin1', organizationId: state.adminOrg,
    role: 'custom', permissions: { 'finance.view': true, 'finance.edit': state.canEdit, 'sessions.edit': true } } }),
}));
vi.mock('../../api/_lib/invoiceNumber.js', () => ({ allocateInvoiceNumber: vi.fn() }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => ({}) }));
vi.mock('../../api/_lib/schoolMonthlyInvoicePdf.js', () => ({ generateSchoolMonthlyInvoicePdf: async () => new Uint8Array([1, 2, 3]) }));
vi.mock('../../api/_lib/schoolMonthlyInvoiceEmail.js', () => ({ sendSchoolMonthlyInvoiceEmail: vi.fn() }));

function query(table: string) {
  let rows = [...(state.tables[table] || [])];
  const builder: any = {
    select: () => builder,
    eq: (key: string, value: any) => { rows = rows.filter((row) => key.split('.').reduce((item, part) => item?.[part], row) === value); return builder; },
    in: (key: string, values: any[]) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
    gte: (key: string, value: any) => { rows = rows.filter((row) => row[key] >= value); return builder; },
    lte: (key: string, value: any) => { rows = rows.filter((row) => row[key] <= value); return builder; },
    or: () => builder,
    order: (key: string, options: any) => { rows.sort((a, b) => options.ascending ? (a[key] > b[key] ? 1 : -1) : (a[key] > b[key] ? -1 : 1)); return builder; },
    is: () => builder,
    maybeSingle: async () => ({ data: rows[0] || null, error: null }),
    insert: (row: any) => { state.writes.push({ table, row }); (state.tables[table] ||= []).push({ ...row, id: state.writes.length, created_at: new Date().toISOString() }); return builder; },
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return builder;
}

import handler from '../../api/school-monthly-invoice-admin';
import { allocateInvoiceNumber } from '../../api/_lib/invoiceNumber.js';

async function request(extra: Record<string, unknown> = {}) {
  const result = { status: 0, body: null as any };
  const response: any = { status(code: number) { result.status = code; return this; }, json(body: any) { result.body = body; return this; } };
  await handler({ method: 'POST', headers: {}, body: { action: 'review', organizationId: 'org1', studentId: 'child1',
    periodStart: '2026-09-01', periodEnd: '2026-09-30', ...extra } } as any, response);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  state.writes = []; state.canEdit = true; state.adminOrg = 'org1';
  state.tables = {
    students: [{ id: 'child1', organization_id: 'org1', full_name: 'Child One', payer_email: 'parent@example.com' }],
    organizations: [{ id: 'org1', name: 'Target School', features: {} }],
    invoice_profiles: [{ id: 'profile1', organization_id: 'org1', business_name: 'Target School' }],
    sessions: [{ id: 'lesson1', student_id: 'child1', tutor_id: 'teacher1', subject_id: 'math', class_group_id: 'group1',
      start_time: '2026-09-14T13:00:00Z', end_time: '2026-09-14T14:00:00Z', status: 'completed', price: 12,
      status_confirmed_at: '2026-09-14T14:05:00Z', tutor: { full_name: 'Teacher One', organization_id: 'org1' }, subject: { name: 'Math' } }],
    student_lesson_discounts: [], school_contracts: [], school_session_billing_decisions: [], school_monthly_invoices: [],
  };
});

describe('school monthly invoice review API', () => {
  it('previews the target school, payer and per-session amounts without changing records', async () => {
    const result = await request({ action: 'preview' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ organizationName: 'Target School', payerEmail: 'parent@example.com', totalEur: 12,
      sessions: [{ id: 'lesson1', included: true, reason: 'payable' }] });
    expect(state.writes).toEqual([]);
  });
  it('records an exclusion reason separately and restores through another audit entry', async () => {
    expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: 'Earlier agreement end' })).status).toBe(200);
    const preview = await request();
    expect(preview.body.sessions[0]).toMatchObject({ status: 'completed', included: false, exclusionReason: 'Earlier agreement end' });
    expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: false, reason: 'Verified correction' })).status).toBe(200);
    expect(state.tables.school_session_billing_decisions).toHaveLength(2);
    expect(state.tables.sessions[0].status).toBe('completed');
    expect((await request({ action: 'preview' })).body.totalEur).toBe(12);
  });
  it('rejects a missing reason, foreign session, foreign organization, and read-only finance seat', async () => {
    expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: '' })).status).toBe(400);
    expect((await request({ action: 'billing-decision', sessionId: 'foreign', excluded: true, reason: 'Earlier end' })).status).toBe(404);
    state.adminOrg = 'other';
    expect((await request()).status).toBe(403);
    state.adminOrg = 'org1'; state.canEdit = false;
    expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: 'Earlier end' })).status).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it('prevents modification and duplicate billing of already issued sessions', async () => {
    state.tables.school_monthly_invoices.push({ id: 'invoice1', organization_id: 'org1', student_id: 'child1', billed_session_ids: ['lesson1'] });
    expect((await request()).body.sessions[0]).toMatchObject({ alreadyInvoiced: true, included: false });
    expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: 'Earlier end' })).status).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it('blocks issuance before allocating an invoice number when payer email is missing, even if child email exists', async () => {
    state.tables.students[0].payer_email = null; state.tables.students[0].email = 'child@example.com';
    const result = await request({ action: 'send', previewToken: 'irrelevant' });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('Mokėtojo el. paštas');
    expect(allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });
  it('holds issuance until every ambiguous session is reviewed and invalidates previews after an audit decision', async () => {
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'unconfirmed', class_group_id: null,
      start_time: '2026-09-15T13:00:00Z', end_time: '2026-09-15T14:00:00Z', status: 'active', status_confirmed_at: null });
    const preview = await request({ action: 'preview' });
    expect(preview.body.reviewSessionIds).toEqual(['unconfirmed']);
    expect((await request({ action: 'send', previewToken: preview.body.previewToken })).status).toBe(409);
    await request({ action: 'billing-decision', sessionId: 'unconfirmed', excluded: true, reason: 'No service was supplied' });
    expect((await request({ action: 'send', previewToken: preview.body.previewToken })).status).toBe(409);
    expect(allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(state.writes.every((write) => write.table === 'school_session_billing_decisions')).toBe(true);
  });
  it('uses other group attendees as occurrence evidence while keeping the absent child status', async () => {
    state.tables.sessions[0].status = 'no_show'; state.tables.sessions[0].status_confirmed_at = null;
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'sibling', student_id: 'child2', status: 'completed',
      status_confirmed_at: '2026-09-14T14:05:00Z' });
    const result = await request();
    expect(result.body.sessions).toHaveLength(1);
    expect(result.body.sessions[0]).toMatchObject({ status: 'no_show', included: true, reason: 'payable' });
    expect(state.writes).toEqual([]);
  });
  it('locks historical fixed-contract coverage even when an older invoice has no billed session ids', async () => {
    state.tables.school_contracts.push({ id: 'contract1', organization_id: 'org1', student_id: 'child1', kind: 'extra_lessons',
      signing_status: 'signed', accepted_at: '2026-09-01T00:00:00Z', start_within_14_status: 'yes', class_group_id: 'group1',
      order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-01', end_date: '2027-06-01' } });
    state.tables.school_monthly_invoices.push({ id: 'fixed-invoice', organization_id: 'org1', student_id: 'child1',
      contract_id: 'contract1', period_start: '2026-09-01', period_end: '2026-09-30', billing_model: 'fixed', billed_session_ids: [] });
    expect((await request()).body.sessions[0]).toMatchObject({ alreadyInvoiced: true, included: false, reason: 'already_invoiced' });
    expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: 'Earlier end' })).status).toBe(409);
    expect(state.writes).toEqual([]);
  });
  it('applies service end windows and rejects audit changes for missing or future end times', async () => {
    state.tables.school_contracts.push({ id: 'contract1', organization_id: 'org1', student_id: 'child1', kind: 'extra_lessons',
      signing_status: 'signed', accepted_at: '2026-09-01T00:00:00Z', start_within_14_status: 'yes', class_group_id: 'group1',
      withdrawal_requested_at: '2026-09-13T10:00:00Z',
      order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-01', end_date: '2027-06-01' } });
    expect((await request()).body.sessions[0]).toMatchObject({ included: false, reason: 'outside_contract' });
    for (const endTime of [null, '2099-09-15T14:00:00Z']) {
      state.tables.sessions[0].end_time = endTime;
      expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: 'Earlier end' })).status).toBe(409);
    }
    expect(state.writes).toEqual([]);
  });
});
