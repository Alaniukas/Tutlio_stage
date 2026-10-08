import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer mock' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'lt' }) }));
vi.mock('../../src/components/ui/month-filter-input', () => ({
  MonthFilterInput: ({ value, onChange, disabled }: any) => createElement('input', {
    'aria-label': 'Invoice month', type: 'month', value, disabled, onChange: (event: any) => onChange(event.target.value),
  }),
}));
vi.mock('../../src/components/ui/date-input', () => ({
  DateInput: (props: any) => createElement('input', { ...props, 'aria-label': 'Invoice due date', type: 'date' }),
}));

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, writes: [] as any[], canEdit: true, adminOrg: 'org1', rowLimit: Infinity,
  replacements: [] as any[] }));
vi.mock('../../api/_lib/schoolConsultationsAccess.js', () => ({
  requireConsultationsAuth: async () => ({ userId: 'admin1' }),
  assertOrgConsultationsEnabled: async () => ({ ok: true }),
  assertSchoolMonthlyInvoiceEnabled: async () => ({ ok: true }),
  serviceSupabase: () => ({
    from: query,
    rpc: async (_name: string, args: any) => {
      state.replacements.push(args);
      return { data: { id: 'replacement', ...args.p_invoice }, error: null };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: async () => ({ ok: true, access: { userId: 'admin1', organizationId: state.adminOrg,
    role: 'custom', permissions: { 'finance.view': true, 'finance.edit': state.canEdit, 'sessions.edit': true } } }),
}));
vi.mock('../../api/_lib/invoiceNumber.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/invoiceNumber.js')>();
  return { ...actual, allocateInvoiceNumber: vi.fn() };
});
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => ({}) }));
vi.mock('../../api/_lib/schoolMonthlyInvoicePdf.js', () => ({ generateSchoolMonthlyInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3])) }));
vi.mock('../../api/_lib/schoolMonthlyInvoiceEmail.js', () => ({ sendSchoolMonthlyInvoiceEmail: vi.fn() }));

function query(table: string) {
  let rows = [...(state.tables[table] || [])];
  let sessionColumns: string[] | null = null;
  const builder: any = {
    select: (columns?: string) => {
      // Honor session projections so the mock cannot hide a missing attendance field in SELECT.
      if (table === 'sessions' && columns && columns !== '*') {
        sessionColumns = columns.split(/,(?![^(]*\))/).map((column) => column.trim().split(/[:(]/)[0]);
      }
      return builder;
    },
    eq: (key: string, value: any) => { rows = rows.filter((row) => key.split('.').reduce((item, part) => item?.[part], row) === value); return builder; },
    neq: (key: string, value: any) => { rows = rows.filter((row) => row[key] !== value); return builder; },
    in: (key: string, values: any[]) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
    gte: (key: string, value: any) => { rows = rows.filter((row) => row[key] >= value); return builder; },
    lte: (key: string, value: any) => { rows = rows.filter((row) => row[key] <= value); return builder; },
    or: () => builder,
    order: (key: string, options: any = {}) => { rows.sort((a, b) => options.ascending ? (a[key] > b[key] ? 1 : -1) : (a[key] > b[key] ? -1 : 1)); return builder; },
    is: (key: string, value: any) => { rows = rows.filter((row) => (row[key] ?? null) === value); return builder; },
    maybeSingle: async () => ({ data: rows[0] || null, error: null }),
    insert: (row: any) => {
      const items = (Array.isArray(row) ? row : [row]).map((item, index) => ({
        ...item,
        ...(table === 'school_monthly_invoices' ? { credit_applied_eur:item.credit_preview_eur || 0 } : {}),
        id: item.id || `id-${state.writes.length + index + 1}`,
        created_at: item.created_at || new Date().toISOString(),
      }));
      state.writes.push({ table, row: Array.isArray(row) ? items : items[0] });
      (state.tables[table] ||= []).push(...items);
      rows = items;
      return builder;
    },
    update: (row: any) => { rows = rows.map((item) => ({ ...item, ...row })); return builder; },
    range: (from: number, to: number) => { rows = rows.slice(from, to + 1); return builder; },
    single: async () => ({ data: rows[0] || null, error: null }),
    then: (resolve: any) => resolve({ data: rows.slice(0, state.rowLimit).map((row) => sessionColumns
      ? Object.fromEntries(Object.entries(row).filter(([key]) => sessionColumns!.includes(key))) : row), error: null }),
  };
  return builder;
}

import handler from '../../api/school-monthly-invoice-admin';
import { allocateInvoiceNumber } from '../../api/_lib/invoiceNumber.js';
import { sendSchoolMonthlyInvoiceEmail } from '../../api/_lib/schoolMonthlyInvoiceEmail.js';
import { generateSchoolMonthlyInvoicePdf } from '../../api/_lib/schoolMonthlyInvoicePdf.js';
import SchoolMonthlyInvoiceDialog from '../../src/components/school/SchoolMonthlyInvoiceDialog';

async function request(extra: Record<string, unknown> = {}) {
  const result = { status: 0, body: null as any };
  const response: any = { status(code: number) { result.status = code; return this; }, json(body: any) { result.body = body; return this; } };
  await handler({ method: 'POST', headers: {}, body: { action: 'review', organizationId: 'org1', studentId: 'child1',
    periodStart: '2026-09-01', periodEnd: '2026-09-30', ...extra } } as any, response);
  return result;
}

function batchTokens(preview: { body: any }) {
  const previewTokens = Object.fromEntries(preview.body.payers.flatMap((group: any) =>
    group.students.map((child: any) => [child.studentId, child.previewToken])));
  const payerPreviewTokens = Object.fromEntries(preview.body.payers.flatMap((group: any) =>
    (group.payerPreviewToken ? [[group.payerKey, group.payerPreviewToken]] : [])));
  return { previewTokens, payerPreviewTokens };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  state.writes = []; state.canEdit = true; state.adminOrg = 'org1'; state.rowLimit = Infinity;
  state.replacements = [];
  vi.mocked(allocateInvoiceNumber).mockResolvedValue('SF-NEW');
  vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
  state.tables = {
    students: [{ id: 'child1', organization_id: 'org1', full_name: 'Child One', payer_email: 'parent@example.com' }],
    organizations: [{ id: 'org1', name: 'Target School', features: {} }],
    invoice_profiles: [{ id: 'profile1', organization_id: 'org1', business_name: 'Target School' }],
    sessions: [{ id: 'lesson1', student_id: 'child1', tutor_id: 'teacher1', subject_id: 'math', class_group_id: 'group1',
      start_time: '2026-09-14T13:00:00Z', end_time: '2026-09-14T14:00:00Z', status: 'completed', price: 12,
      tutor_joined_at: '2026-09-14T13:00:00Z', status_confirmed_at: '2026-09-14T14:05:00Z',
      tutor: { full_name: 'Teacher One', organization_id: 'org1' }, subject: { name: 'Math' } }],
    subjects: [], student_lesson_discounts: [], school_discount_agreements: [], school_contracts: [], school_session_billing_decisions: [], school_monthly_invoices: [],
  };
});

afterEach(() => vi.unstubAllGlobals());

describe('school monthly invoice review API', () => {
  const existingInvoice = () => ({ id: 'earlier', organization_id: 'org1', student_id: 'child1', invoice_number: 'OLD',
    period_start: '2026-09-01', period_end: '2026-09-30', payment_status: 'pending', billing_model: 'actual', total_eur: 12,
    billed_session_ids: ['lesson1'], payer_student_ids: ['child1'] });
  it('rebuilds the full payer invoice after confirmation, including a late in-person lesson', async () => {
    state.tables.school_monthly_invoices = [existingInvoice()];
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'late', start_time: '2026-09-21T13:00:00Z', end_time: '2026-09-21T14:00:00Z',
      tutor_joined_at: null, status_confirmed_at: '2026-09-21T14:05:00Z', status_confirmed_by: 'teacher1' });
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ totalEur: 24, regeneration: { invoiceIds: ['earlier'], invoiceNumbers: ['OLD'] } });
    const denied = await request({ action: 'send', previewToken: preview.body.previewToken });
    expect(denied.status).toBe(409);
    expect(state.writes).toHaveLength(0); expect(state.replacements).toHaveLength(0);
    const sent = await request({ action: 'send', previewToken: preview.body.previewToken, regenerateInvoiceIds: ['earlier'] });
    expect(sent.status).toBeLessThan(300);
    expect(state.replacements[0]).toMatchObject({ p_kind: 'payer', p_invoice: { total_eur: 24, billed_session_ids: ['lesson1', 'late'] } });
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledOnce();
  });
  it('requires payer confirmation during batch sending too', async () => {
    state.tables.school_monthly_invoices = [existingInvoice()];
    const preview = await request({ action: 'batch-preview' });
    expect(preview.body.payers[0].students[0].regeneration.invoiceIds).toEqual(['earlier']);
    expect((await request({ action: 'send-batch', ...batchTokens(preview) })).body.sentCount).toBe(0);
    expect(state.replacements).toHaveLength(0);
    const sent = await request({ action: 'send-batch', ...batchTokens(preview), regenerateInvoiceIds: ['earlier'] });
    expect(sent.body.sentCount).toBe(1);
    expect(state.replacements).toHaveLength(1);
  });
  it('does not reset a payment or an active checkout after payer preview', async () => {
    state.tables.school_monthly_invoices = [existingInvoice()];
    const preview = await request({ action: 'preview' });
    state.tables.school_monthly_invoices[0].payment_status = 'paid';
    expect((await request({ action: 'send', previewToken: preview.body.previewToken, regenerateInvoiceIds: ['earlier'] })).status).toBeGreaterThanOrEqual(400);
    state.tables.school_monthly_invoices[0].payment_status = 'pending';
    state.tables.school_monthly_invoices[0].stripe_checkout_session_id = 'cs_active';
    expect((await request({ action: 'send', previewToken: preview.body.previewToken, regenerateInvoiceIds: ['earlier'] })).status).toBeGreaterThanOrEqual(400);
    expect(state.writes).toHaveLength(0); expect(state.replacements).toHaveLength(0);
  });
  it('keeps both children when regenerating a family invoice from one child preview', async () => {
    state.tables.students.push({ id: 'child2', organization_id: 'org1', full_name: 'Child Two', payer_email: 'parent@example.com' });
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'sibling-lesson', student_id: 'child2' });
    state.tables.school_monthly_invoices = [{ ...existingInvoice(), payer_student_ids: ['child1', 'child2'],
      billed_session_ids: ['lesson1', 'sibling-lesson'], total_eur: 24 }];
    const preview = await request({ action: 'preview' });
    expect(preview.body.totalEur).toBe(24);
    expect(preview.body.lines.map((line: any) => line.studentName)).toEqual(['Child One', 'Child Two']);
    const sent = await request({ action: 'send', previewToken: preview.body.previewToken, regenerateInvoiceIds: ['earlier'] });
    expect(sent.status).toBeLessThan(300);
    expect(state.replacements[0].p_invoice.payer_student_ids.sort()).toEqual(['child1', 'child2']);
    expect(state.replacements[0].p_invoice.billed_session_ids.sort()).toEqual(['lesson1', 'sibling-lesson']);
  });
  it('does not replace a family invoice when a sibling still needs attendance review', async () => {
    state.tables.students.push({ id: 'child2', organization_id: 'org1', full_name: 'Child Two', payer_email: 'parent@example.com' });
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'sibling-lesson', student_id: 'child2',
      class_group_id: 'other-group', status: 'active', tutor_joined_at: null, status_confirmed_at: null });
    state.tables.school_monthly_invoices = [{ ...existingInvoice(), payer_student_ids: ['child1', 'child2'],
      billed_session_ids: ['lesson1', 'sibling-lesson'], total_eur: 24 }];
    const preview = await request({ action: 'batch-preview' });
    expect(preview.body.payers[0].students.find((child: any) => child.studentId === 'child2').reviewSessionIds).toEqual(['sibling-lesson']);
    const sent = await request({ action: 'send-batch', ...batchTokens(preview), regenerateInvoiceIds: ['earlier'] });
    expect(sent.body.sentCount).toBe(0);
    expect(sent.body.skipped.some((item: any) => item.error.includes('visų į ankstesnę sąskaitą įtrauktų vaikų'))).toBe(true);
    expect(allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(state.replacements).toHaveLength(0);
  });
  it('shows an available prior overpayment in the PDF and final invoice without treating it as a discount', async () => {
    state.tables.school_invoice_overpayments = [{ id:'credit',organization_id:'org1',student_id:'child1',payer_email:'parent@example.com',
      source_invoice_id:'paid',amount_eur:5,reason:'Prior adjustment',created_at:'2026-08-31',source:{invoice_number:'PAM-OLD',period_end:'2026-08-31'},uses:[] }];
    const preview = await request({action:'preview'});
    expect(preview.body).toMatchObject({totalEur:12,discountAmountEur:0,creditAppliedEur:5,amountDueEur:7});
    expect(generateSchoolMonthlyInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({
      totalEur:12,creditAppliedEur:5,discountAmountEur:0,
      creditSources:[{monthLabel:'2026 m. rugpjūčio',amountEur:5,sourceInvoiceNumber:'PAM-OLD'}],
    }));
    expect(preview.body.creditSources).toEqual([{monthLabel:'2026 m. rugpjūčio',amountEur:5,sourceInvoiceNumber:'PAM-OLD'}]);
    const batch = await request({action:'batch-preview'});
    expect(batch.body.payers[0]).toMatchObject({totalEur:12,creditAppliedEur:5,amountDueEur:7});
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('SF-CREDIT');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({sent:true});
    expect((await request({action:'send',previewToken:preview.body.previewToken})).status).toBe(200);
    expect(state.tables.school_monthly_invoices[0]).toMatchObject({total_eur:12,credit_preview_eur:5,credit_applied_eur:5,payer_student_ids:['child1']});
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({credit_applied_eur:5}),expect.anything());
  });
  it('requires a new preview if an available overpayment is used elsewhere', async () => {
    state.tables.school_invoice_overpayments = [{ id:'credit',organization_id:'org1',student_id:'child1',payer_email:'parent@example.com',
      amount_eur:5,source:{period_end:'2026-08-31'},uses:[] }];
    const preview = await request({action:'preview'});
    state.tables.school_invoice_overpayments[0].uses = [{invoice_id:'another',amount_eur:5}];
    const sent = await request({action:'send',previewToken:preview.body.previewToken});
    expect(sent.status).toBe(409);
    expect(sent.body.error).toContain('pasikeitė');
    expect(state.writes).toEqual([]);
  });
  it('previews and sends three Tuesdays instead of all five historical group rows', async () => {
    const original = state.tables.sessions[0];
    state.tables.sessions = [15, 21, 22, 28, 29].map((day) => ({ ...original, id: `sep-${day}`, price: 6,
      start_time: `2026-09-${day}T09:30:00Z`, end_time: `2026-09-${day}T10:30:00Z`,
      class_group: { name: 'Intermediate 1' } }));
    state.tables.school_contracts = [{ id: 'contract', organization_id: 'org1', student_id: 'child1',
      kind: 'extra_lessons', signing_status: 'signed', class_group_id: 'group1', unit_price_eur: 6,
      accepted_at: '2026-09-15T09:31:00Z', start_within_14_status: 'yes',
      order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-14', end_date: '2027-06-01',
        schedule_slots: [{ weekday: 2, start_time: '12:30', end_time: '13:30' }] } }];
    const before = structuredClone(state.tables.sessions);
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ totalEur: 18, reviewSessionIds: [], lines: [{ quantity: 3, amountEur: 18 }] });
    expect(preview.body.sessions.filter((row: any) => row.reason === 'outside_schedule').map((row: any) => row.id).sort()).toEqual(['sep-21', 'sep-28']);
    const batch = await request({ action: 'batch-preview' });
    expect(batch.body.payers[0].totalEur).toBe(18);
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('SF-NEW');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    expect((await request({ action: 'send', previewToken: preview.body.previewToken })).status).toBe(200);
    expect(state.tables.school_monthly_invoices[0]).toMatchObject({ total_eur: 18 });
    expect([...state.tables.school_monthly_invoices[0].billed_session_ids].sort()).toEqual(['sep-15', 'sep-22', 'sep-29']);
    expect(state.tables.sessions).toEqual(before);
  });

  it('loads a member\'s selected slot for a group without a frozen agreement', async () => {
    state.tables.school_class_group_members = [{ group_id: 'group1', student_id: 'child1',
      schedule_slots: [{ weekday: 2, start_time: '12:30' }], group: { organization_id: 'org1' } }];
    const original = state.tables.sessions[0];
    state.tables.sessions = [21, 22].map((day) => ({ ...original, id: `sep-${day}`,
      start_time: `2026-09-${day}T09:30:00Z`, end_time: `2026-09-${day}T10:30:00Z` }));
    const preview = await request({ action: 'preview' });
    expect(preview.body).toMatchObject({ totalEur: 12, lines: [{ quantity: 1 }] });
    expect(preview.body.sessions.find((row: any) => row.id === 'sep-21')).toMatchObject({ reason: 'outside_schedule' });
    expect(state.writes).toEqual([]);
  });

  it('loads the original time of a rescheduled selected group occurrence', async () => {
    state.tables.school_contracts = [{ id: 'contract', organization_id: 'org1', student_id: 'child1',
      kind: 'extra_lessons', signing_status: 'signed', class_group_id: 'group1', accepted_at: '2026-09-01T00:00:00Z',
      start_within_14_status: 'yes', order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-01',
        schedule_slots: [{ weekday: 2, start_time: '12:30', end_time: '13:30' }] } }];
    Object.assign(state.tables.sessions[0], { start_time: '2026-09-23T10:00:00Z', end_time: '2026-09-23T11:00:00Z',
      original_start_time: '2026-09-22T09:30:00Z' });
    expect((await request({ action: 'preview' })).body).toMatchObject({ totalEur: 12, lines: [{ quantity: 1 }] });
  });

  it('restores eight group lessons after cancellation, uses the group name in the PDF, and issues only once', async () => {
    const original = state.tables.sessions[0];
    state.tables.sessions = Array.from({ length: 8 }, (_, index) => ({ ...original,
      id: `kajus-${index}`, price: 6,
      subject: { name: 'Anglų kalba individuali Nojus Gibieža' },
      class_group: { name: 'Gintaras Kulbis Intermediate 1 grupė' },
    }));
    state.tables.school_monthly_invoices.push({ id: 'cancelled', organization_id: 'org1', student_id: 'child1',
      contract_id: null, period_start: '2026-09-01', period_end: '2026-09-30', payment_status: 'cancelled',
      billing_model: 'actual', billed_session_ids: state.tables.sessions.map((row) => row.id) });
    const attendanceBefore = structuredClone(state.tables.sessions);
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ totalEur: 48, reviewSessionIds: [],
      lines: [{ quantity: 8, amountEur: 48, subjectName: 'Gintaras Kulbis Intermediate 1 grupė' }] });
    expect(preview.body.sessions.every((row: any) => row.included && !row.alreadyInvoiced)).toBe(true);
    expect(generateSchoolMonthlyInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ totalEur: 48,
      lines: [expect.objectContaining({ activity: 'Gintaras Kulbis Intermediate 1 grupė - mokytojas Teacher One' })] }));
    expect(state.writes).toEqual([]);
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('SF-NEW');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    expect((await request({ action: 'send', previewToken: preview.body.previewToken })).status).toBe(200);
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledTimes(1);
    expect(state.tables.school_monthly_invoices).toHaveLength(2);
    expect(state.tables.school_monthly_invoices[0].payment_status).toBe('cancelled');
    expect((await request({ action: 'send', previewToken: preview.body.previewToken })).status).toBe(409);
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledTimes(1);
    expect(state.tables.sessions).toEqual(attendanceBefore);
  });

  it('keeps distinct groups in separate invoice rows and includes groups with no subject id', async () => {
    const original = state.tables.sessions[0];
    state.tables.sessions = [
      { ...original, id: 'lt', class_group: { name: 'Lietuvių kalba 1 klasė' } },
      { ...original, id: 'math', class_group_id: 'group2', class_group: { name: 'Matematika 1 klasė' } },
      { ...original, id: 'english', class_group_id: 'group3', subject_id: null, subject: null,
        class_group: { name: 'Elementary 2 grupė' }, price: 0 },
    ];
    state.tables.school_contracts.push({ id: 'english-contract', organization_id: 'org1', student_id: 'child1',
      kind: 'extra_lessons', signing_status: 'signed', class_group_id: 'group3', unit_price_eur: 6,
      accepted_at: '2026-09-01T00:00:00Z', start_within_14_status: 'yes',
      order_snapshot: { service_type: 'group', group_id: 'group3', start_date: '2026-09-01', end_date: '2027-06-01' } });
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body.totalEur).toBe(30);
    expect(preview.body.lines).toHaveLength(3);
    expect(preview.body.lines.find((row: any) => row.subjectId === 'group3'))
      .toMatchObject({ subjectName: 'Elementary 2 grupė', quantity: 1, amountEur: 6, sessionIds: ['english'] });
    expect(preview.body.sessions.every((row: any) => row.included)).toBe(true);
    expect(state.writes).toEqual([]);
  });

  it.each(['pending', 'paid'])('keeps a %s invoice blocking its sessions even when a cancelled copy exists', async (paymentStatus) => {
    for (const status of ['cancelled', paymentStatus]) state.tables.school_monthly_invoices.push({
      id: status, organization_id: 'org1', student_id: 'child1', payment_status: status, billed_session_ids: ['lesson1'],
    });
    expect((await request()).body.sessions[0]).toMatchObject({ alreadyInvoiced: true, included: false });
    expect(state.writes).toEqual([]);
  });

  it('does not retain the service-period lock from a cancelled fixed-contract invoice', async () => {
    state.tables.school_contracts.push({ id: 'contract1', organization_id: 'org1', student_id: 'child1', kind: 'extra_lessons',
      signing_status: 'signed', accepted_at: '2026-09-01T00:00:00Z', start_within_14_status: 'yes', class_group_id: 'group1',
      order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-01', end_date: '2027-06-01' } });
    state.tables.school_monthly_invoices.push({ id: 'cancelled-fixed', organization_id: 'org1', student_id: 'child1',
      contract_id: 'contract1', payment_status: 'cancelled', period_start: '2026-09-01', period_end: '2026-09-30',
      billing_model: 'fixed', billed_session_ids: [] });
    expect((await request()).body.sessions[0]).toMatchObject({ alreadyInvoiced: false, included: true, reason: 'payable' });
    expect(state.writes).toEqual([]);
  });

  it('previews a completed individual lesson with student join evidence and no tutor join or manual confirmation', async () => {
    Object.assign(state.tables.sessions[0], { class_group_id: null, status_confirmed_at: null,
      tutor_joined_at: null, student_joined_at: '2026-09-14T13:05:00Z' });
    const result = await request({ action: 'preview' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ totalEur: 12, reviewSessionIds: [],
      sessions: [{ included: true, reason: 'payable', statusConfirmedAt: null }] });
    expect(state.writes).toEqual([]);
  });
  it.each(['teacher1', 'admin1'])('previews and issues an in-person group lesson manually confirmed by %s', async (actor) => {
    Object.assign(state.tables.sessions[0], { tutor_joined_at: null, student_joined_at: null, status_confirmed_by: actor });
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ totalEur: 12, reviewSessionIds: [],
      sessions: [{ id: 'lesson1', included: true, reason: 'payable', status: 'completed' }] });
    expect(state.writes).toEqual([]);
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('PAM-801');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    const send = await request({ action: 'send', previewToken: preview.body.previewToken });
    expect(send.status).toBe(200);
    expect(state.tables.school_monthly_invoices[0]).toMatchObject({ total_eur: 12, billed_session_ids: ['lesson1'] });
    expect(state.tables.sessions[0].status_confirmed_by).toBe(actor);
  });
  it.each(['no_show', 'active'])('bills a %s group reservation using another attendee manual confirmation', async (status) => {
    Object.assign(state.tables.sessions[0], { status, status_confirmed_at: null, status_confirmed_by: null,
      tutor_joined_at: null, student_joined_at: null });
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'attendee', student_id: 'child2',
      status: 'completed', status_confirmed_at: '2026-09-14T14:05:00Z', status_confirmed_by: 'teacher1' });
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ totalEur: 12, reviewSessionIds: [],
      sessions: [{ id: 'lesson1', status, included: true, reason: 'payable', statusConfirmedAt: null }] });
    expect(preview.body.sessions).toHaveLength(1);
    expect(state.tables.sessions[0].status).toBe(status);
    expect(state.writes).toEqual([]);
  });
  it.each(['legacy stamp', 'different group', 'different occurrence', 'different organization'])('holds group billing when the only completion evidence is a %s', async (scope) => {
    Object.assign(state.tables.sessions[0], { tutor_joined_at: null, student_joined_at: null,
      status_confirmed_at: state.tables.sessions[0].end_time, status_confirmed_by: null });
    const other = { ...state.tables.sessions[0], id: 'other-attendee', student_id: 'child2',
      status_confirmed_by: scope === 'legacy stamp' ? null : 'teacher1' };
    if (scope === 'different group') other.class_group_id = 'other-group';
    if (scope === 'different occurrence') Object.assign(other, { start_time: '2026-09-15T13:00:00Z',
      end_time: '2026-09-15T14:00:00Z', status_confirmed_at: '2026-09-15T14:05:00Z' });
    if (scope === 'different organization') other.tutor = { full_name: 'Other Teacher', organization_id: 'other-org' };
    state.tables.sessions.push(other);
    const review = await request();
    expect(review.status).toBe(200);
    expect(review.body).toMatchObject({ reviewSessionIds: ['lesson1'],
      sessions: [{ id: 'lesson1', included: false, reason: 'unconfirmed', canConfirm: true }] });
    expect((await request({ action: 'preview' })).status).toBe(400);
    expect((await request({ action: 'send', previewToken: 'no-billable-lessons' })).status).toBe(400);
    expect(allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(state.writes).toEqual([]);
  });
  it('bills a reserved group place using another completed attendee student join without changing the absent child attendance', async () => {
    Object.assign(state.tables.sessions[0], { status: 'no_show', status_confirmed_at: null, tutor_joined_at: null });
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'attendee', student_id: 'child2',
      status: 'completed', student_joined_at: '2026-09-14T13:05:00Z' });
    const result = await request({ action: 'preview' });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ totalEur: 12, reviewSessionIds: [],
      sessions: [{ id: 'lesson1', included: true, reason: 'payable', status: 'no_show' }] });
    expect(result.body.sessions).toHaveLength(1);
    expect(state.writes).toEqual([]);
  });
  it.each(['different group', 'different occurrence'])('does not borrow student join evidence from a %s', async (scope) => {
    Object.assign(state.tables.sessions[0], { status: 'no_show', status_confirmed_at: null, tutor_joined_at: null });
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'other-attendee', student_id: 'child2',
      status: 'completed', student_joined_at: '2026-09-14T13:05:00Z',
      ...(scope === 'different group' ? { class_group_id: 'another-group' }
        : { start_time: '2026-09-15T13:00:00Z', end_time: '2026-09-15T14:00:00Z' }),
    });
    const result = await request();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ reviewSessionIds: ['lesson1'],
      sessions: [{ id: 'lesson1', included: false, reason: 'unconfirmed' }] });
    expect(state.writes).toEqual([]);
  });
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
  it('allows a supplemental invoice in the same period when other sessions are still unbilled', async () => {
    state.tables.school_monthly_invoices.push({
      id: 'invoice1', organization_id: 'org1', student_id: 'child1', payment_status: 'pending',
      period_start: '2026-09-01', period_end: '2026-09-30', contract_id: null,
      invoice_number: 'PAM-800', billed_session_ids: ['lesson1'],
    });
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'new-lesson' });
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body.totalEur).toBe(12);
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('PAM-801');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    const send = await request({ action: 'send', previewToken: preview.body.previewToken });
    expect(send.status).toBe(200);
    expect(send.body).toMatchObject({ invoiceNumber: 'PAM-801', emailSent: true });
    expect(state.tables.school_monthly_invoices).toHaveLength(2);
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
      student_joined_at: '2026-09-14T13:05:00Z', status_confirmed_at: '2026-09-14T14:05:00Z' });
    const result = await request();
    expect(result.body.sessions).toHaveLength(1);
    expect(result.body.sessions[0]).toMatchObject({ status: 'no_show', included: true, reason: 'payable' });
    expect(state.writes).toEqual([]);
  });
  it('loads occurrence evidence beyond the database response cap', async () => {
    state.rowLimit = 2;
    const lesson = state.tables.sessions[0];
    lesson.id = 'a'; lesson.status = 'no_show'; lesson.status_confirmed_at = null;
    state.tables.sessions.push(
      { ...lesson, id: 'b', student_id: 'child2' },
      { ...lesson, id: 'c', student_id: 'child3', status: 'completed', student_joined_at: '2026-09-14T13:05:00Z' },
    );
    const result = await request();
    expect(result.body.sessions[0]).toMatchObject({ included: true, reason: 'payable' });
  });
  it('hides pre-service history without billing it or changing attendance', async () => {
    const lesson = state.tables.sessions[0];
    state.tables.sessions.push({ ...lesson, id: 'before-service', start_time: '2026-09-03T09:00:00Z', end_time: '2026-09-03T10:00:00Z' });
    state.tables.school_contracts.push({ id: 'contract1', organization_id: 'org1', student_id: 'child1', kind: 'extra_lessons',
      signing_status: 'signed', accepted_at: '2026-09-08T10:00:00Z', start_within_14_status: 'yes', class_group_id: 'group1',
      order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-07', end_date: '2027-06-01' } });
    const result = await request({ action: 'preview' });
    expect(result.status).toBe(200);
    expect(result.body.sessions.map((row: any) => row.id)).toEqual(['lesson1']);
    expect(result.body.lines.flatMap((line: any) => line.sessionIds)).toEqual(['lesson1']);
    expect(state.tables.sessions).toHaveLength(2);
    expect(state.writes).toEqual([]);
  });
  it('bills individual lessons by service name when the frozen subject id drifted', async () => {
    const lesson = state.tables.sessions[0];
    lesson.class_group_id = null;
    lesson.subject_id = 'current-russian';
    lesson.subject = { name: 'Rusų kalba Tauras Granickis', price: 20 };
    state.tables.students[0].full_name = 'Granickis Tauras';
    const stale = { id: 'stale', organization_id: 'org1', student_id: 'child1', kind: 'extra_lessons',
      signing_status: 'signed', accepted_at: '2026-09-01T10:00:00Z', start_within_14_status: 'yes', class_group_id: null,
      unit_price_eur: 20,
      order_snapshot: { service_type: 'individual', subject_id: 'deleted-russian', service_name: 'Rusų kalba Tauras Granickis',
        start_date: '2026-09-07', end_date: '2027-06-01' } };
    state.tables.school_contracts.push(stale);
    expect((await request()).body).toMatchObject({ reviewSessionIds: [], sessions: [{ included: true, reason: 'payable' }] });
    const batch = await request({ action: 'batch-preview' });
    expect(batch.body.payers[0].students[0]).toMatchObject({ reviewSessionIds: [], reviewReasons: [] });
    state.tables.subjects.push({ id: 'current-russian', tutor: { organization_id: 'org1' } });
    state.tables.school_contracts.push({ ...stale, id: 'valid',
      order_snapshot: { ...stale.order_snapshot, subject_id: 'current-russian' } });
    expect((await request()).body).toMatchObject({ reviewSessionIds: [], sessions: [{ included: true, reason: 'payable' }] });
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
    expect((await request()).body.sessions).toEqual([]);
    for (const endTime of [null, '2099-09-15T14:00:00Z']) {
      state.tables.sessions[0].end_time = endTime;
      expect((await request({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: 'Earlier end' })).status).toBe(409);
    }
    expect(state.writes).toEqual([]);
  });
});

describe('school monthly invoice batch by payer', () => {
  function familyTables() {
    const lesson = {
      start_time: '2026-09-14T13:00:00Z',
      end_time: '2026-09-14T14:00:00Z',
      status: 'completed',
      price: 0,
      tutor_joined_at: '2026-09-14T13:00:00Z',
      status_confirmed_at: '2026-09-14T14:05:00Z',
      tutor: { full_name: 'Teacher One', organization_id: 'org1' },
      subject: { name: 'Math' },
    };
    const contract = {
      kind: 'extra_lessons',
      signing_status: 'signed',
      accepted_at: '2026-09-01T00:00:00Z',
      start_within_14_status: 'yes',
      unit_price_eur: 6,
      order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-01', end_date: '2027-06-01' },
    };
    state.tables.students = [
      { id: 'kajus', organization_id: 'org1', full_name: 'Adomaitis Kajus', payer_name: 'Akvilė Adomaitytė', payer_email: 'akvile@example.com' },
      { id: 'palaima', organization_id: 'org1', full_name: 'Palaima Jokūbas', payer_name: 'Raimonda Širvytė', payer_email: 'raimonda@example.com' },
    ];
    state.tables.sessions = [
      { ...lesson, id: 'kajus-lesson', student_id: 'kajus', tutor_id: 'teacher1', subject_id: 'math', class_group_id: 'group1' },
      { ...lesson, id: 'palaima-lesson', student_id: 'palaima', tutor_id: 'teacher1', subject_id: 'math', class_group_id: 'group1' },
    ];
    state.tables.school_contracts = [
      { ...contract, id: 'c-kajus', organization_id: 'org1', student_id: 'kajus', class_group_id: 'group1' },
      { ...contract, id: 'c-palaima', organization_id: 'org1', student_id: 'palaima', class_group_id: 'group1' },
    ];
  }

  it('previews separate payer groups using contract unit price when session.price is 0', async () => {
    familyTables();
    const result = await request({ action: 'batch-preview', studentId: undefined });
    expect(result.status).toBe(200);
    expect(result.body.payers).toHaveLength(2);
    expect(result.body.payers.map((group: any) => group.payerEmail).sort()).toEqual([
      'akvile@example.com',
      'raimonda@example.com',
    ]);
    expect(result.body.payers.find((group: any) => group.payerEmail === 'akvile@example.com')).toMatchObject({
      payerName: 'Akvilė Adomaitytė',
      totalEur: 6,
      students: [{ fullName: 'Adomaitis Kajus', lessonCount: 1, totalEur: 6 }],
    });
    expect(result.body.payers.find((group: any) => group.payerEmail === 'raimonda@example.com').students[0].fullName)
      .toBe('Palaima Jokūbas');
    expect(state.writes).toEqual([]);
  });

  it('makes every payer sendable when completed lessons have student joins but no tutor joins or manual confirmations', async () => {
    familyTables();
    for (const lesson of state.tables.sessions) Object.assign(lesson, {
      status_confirmed_at: null, tutor_joined_at: null, student_joined_at: '2026-09-14T13:05:00Z',
    });
    const result = await request({ action: 'batch-preview', studentId: undefined });
    expect(result.status).toBe(200);
    expect(result.body.payers).toHaveLength(2);
    for (const payer of result.body.payers) {
      expect(payer.sendableStudentIds).toHaveLength(1);
      expect(payer.students[0]).toMatchObject({ lessonCount: 1, totalEur: 6, reviewSessionIds: [] });
    }
    expect(state.writes).toEqual([]);
  });

  it('runs the September student-join flow from the real dialog through review, PDF amounts, issuance and duplicate protection', async () => {
    familyTables();
    for (const contract of state.tables.school_contracts) {
      contract.accepted_at = '2026-09-24T07:29:00Z';
      contract.order_snapshot.start_date = '2026-09-07';
    }
    for (const lesson of [...state.tables.sessions]) {
      Object.assign(lesson, { status_confirmed_at: null, tutor_joined_at: null,
        student_joined_at: '2026-09-14T13:05:00Z' });
      state.tables.sessions.push({ ...lesson, id: `${lesson.id}-before-service`,
        start_time: '2026-09-03T13:00:00Z', end_time: '2026-09-03T14:00:00Z',
        student_joined_at: '2026-09-03T13:05:00Z' });
    }
    // One child's join proves this occurrence; the other reserved place remains billable.
    Object.assign(state.tables.sessions[1], { status: 'no_show', student_joined_at: null });
    const attendanceBefore = structuredClone(state.tables.sessions);
    vi.mocked(allocateInvoiceNumber).mockResolvedValueOnce('SF-1').mockResolvedValueOnce('SF-2');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      expect(url).toBe('/api/school-monthly-invoice-admin');
      const body = JSON.parse(init.body);
      calls.push(body);
      const response = await request(body);
      return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
    }));
    const onOpenChange = vi.fn();
    render(createElement(SchoolMonthlyInvoiceDialog, {
      batch: true, open: true, organizationId: 'org1', onOpenChange,
      students: state.tables.students.map((child) => ({ id: child.id, fullName: child.full_name })),
    }));
    fireEvent.change(screen.getByLabelText('Invoice month'), { target: { value: '2026-09' } });
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Akvilė Adomaitytė');
    expect(screen.getByText('Raimonda Širvytė')).toBeTruthy();
    expect(screen.queryByText('school.invoice.batch.blocked')).toBeNull();
    expect(state.writes).toEqual([]);
    fireEvent.click(screen.getAllByRole('button', { name: 'school.invoice.batch.reviewChild' })[0]);
    await screen.findByText('school.invoice.review.reason.payable');
    expect(screen.queryByText('school.invoice.review.unconfirmed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Formuoti peržiūrai' }));
    await screen.findByText('Peržiūra paruošta');
    expect(generateSchoolMonthlyInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({
      preview: true, studentName: 'Adomaitis Kajus', subtotalEur: 6, totalEur: 6,
      lines: [expect.objectContaining({ quantity: 1, amountEur: 6 })],
    }));
    expect(state.writes).toEqual([]);
    expect(sendSchoolMonthlyInvoiceEmail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'common.back: school.invoice.batch.title' }));
    await screen.findByText('Akvilė Adomaitytė');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }));
    await waitFor(() => expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(state.tables.school_monthly_invoices.map((invoice) => ({ studentId: invoice.student_id,
      total: invoice.total_eur, sessions: invoice.billed_session_ids })).sort((a, b) => a.studentId.localeCompare(b.studentId))).toEqual([
      { studentId: 'kajus', total: 6, sessions: ['kajus-lesson'] },
      { studentId: 'palaima', total: 6, sessions: ['palaima-lesson'] },
    ]);
    expect(state.tables.school_monthly_invoice_lines.map((line) => ({ quantity: line.quantity,
      amount: line.amount_eur, sessions: line.session_ids })).sort((a, b) => a.sessions[0].localeCompare(b.sessions[0]))).toEqual([
      { quantity: 1, amount: 6, sessions: ['kajus-lesson'] },
      { quantity: 1, amount: 6, sessions: ['palaima-lesson'] },
    ]);
    expect(vi.mocked(sendSchoolMonthlyInvoiceEmail).mock.calls.map((call) => call[2].student.payer_email).sort())
      .toEqual(['akvile@example.com', 'raimonda@example.com']);
    expect(state.tables.sessions).toEqual(attendanceBefore);
    expect((screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }) as HTMLButtonElement).disabled).toBe(true);
    const writesBeforeRetry = state.writes.length;
    const retry = await request(calls.find((call) => call.action === 'send-batch'));
    expect(retry.body).toMatchObject({ sentCount: 0, skippedCount: 2 });
    expect(state.writes).toHaveLength(writesBeforeRetry);
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledTimes(2);
  });

  it('blocks stale student-join previews if occurrence evidence disappears before sending', async () => {
    familyTables();
    for (const lesson of state.tables.sessions) Object.assign(lesson, {
      status_confirmed_at: null, tutor_joined_at: null, student_joined_at: '2026-09-14T13:05:00Z',
    });
    const preview = await request({ action: 'batch-preview' });
    const tokens = batchTokens(preview);
    for (const lesson of state.tables.sessions) lesson.student_joined_at = null;
    const result = await request({ action: 'send-batch', ...tokens });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ sentCount: 0, skippedCount: 2 });
    expect(state.writes).toEqual([]);
    expect(allocateInvoiceNumber).not.toHaveBeenCalled();
    expect(sendSchoolMonthlyInvoiceEmail).not.toHaveBeenCalled();
  });

  it('sends one combined invoice email per payer and splits sibling lines in the PDF', async () => {
    familyTables();
    state.tables.students.push({
      id: 'etme', organization_id: 'org1', full_name: 'Vitkutė Etmė', payer_name: 'Akvilė Adomaitytė', payer_email: 'akvile@example.com',
    });
    state.tables.sessions.push({
      ...state.tables.sessions[0], id: 'etme-lesson', student_id: 'etme', tutor_id: 'teacher1', subject_id: 'math', class_group_id: 'group1',
    });
    state.tables.school_contracts.push({
      ...state.tables.school_contracts[0], id: 'c-etme', organization_id: 'org1', student_id: 'etme', class_group_id: 'group1',
    });
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('SF-1');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    const preview = await request({ action: 'batch-preview' });
    const tokens = batchTokens(preview);
    const akvileGroup = preview.body.payers.find((group: any) => group.payerEmail === 'akvile@example.com');
    expect(akvileGroup.students).toHaveLength(2);
    expect(akvileGroup.payerPreviewToken).toBeTruthy();

    const onePayer = await request({
      action: 'send-batch',
      payerKey: 'akvile@example.com',
      ...tokens,
    });
    expect(onePayer.status).toBe(200);
    expect(onePayer.body.sentCount).toBe(1);
    expect(onePayer.body.sent[0]).toMatchObject({ payerEmail: 'akvile@example.com', studentIds: ['kajus', 'etme'] });
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledTimes(1);
    expect(state.tables.school_monthly_invoices[0].total_eur).toBe(12);
    expect(state.tables.school_monthly_invoices[0].billed_session_ids.sort()).toEqual(['etme-lesson', 'kajus-lesson']);
    expect(vi.mocked(generateSchoolMonthlyInvoicePdf).mock.calls.at(-1)?.[0]).toMatchObject({
      studentName: 'Adomaitis Kajus, Vitkutė Etmė',
      lines: expect.arrayContaining([
        expect.objectContaining({ studentName: 'Adomaitis Kajus' }),
        expect.objectContaining({ studentName: 'Vitkutė Etmė' }),
      ]),
    });

    const everyone = await request({ action: 'send-batch', ...tokens });
    expect(everyone.status).toBe(200);
    expect(everyone.body.sentCount).toBe(1);
    expect(everyone.body.sent[0].payerEmail).toBe('raimonda@example.com');
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sendSchoolMonthlyInvoiceEmail).mock.calls[1][2].student.full_name).toBe('Palaima Jokūbas');
  });

  it('does not issue invoices when the payer preview token is missing', async () => {
    familyTables();
    const result = await request({ action: 'send-batch', payerKey: 'akvile@example.com' });
    expect(result.status).toBe(400);
    expect(result.body.sentCount || 0).toBe(0);
    expect(allocateInvoiceNumber).not.toHaveBeenCalled();
  });

  it('keeps already invoiced children visible in the period review', async () => {
    familyTables();
    state.tables.school_monthly_invoices.push({ id: 'issued', organization_id: 'org1', student_id: 'kajus',
      billed_session_ids: ['kajus-lesson'], period_start: '2026-09-01', period_end: '2026-09-30', billing_model: 'actual' });
    const preview = await request({ action: 'batch-preview' });
    expect(preview.body.payers).toHaveLength(2);
    const group = preview.body.payers.find((row: any) => row.payerEmail === 'akvile@example.com');
    expect(group.students[0]).toMatchObject({ studentId: 'kajus', alreadyIssued: true, lessonCount: 0 });
    expect(group.sendableStudentIds).toEqual([]);
  });

  it('does not select a newly added child that was absent from the reviewed preview', async () => {
    familyTables();
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('SF-1');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    const preview = await request({ action: 'batch-preview' });
    const tokens = batchTokens(preview);
    state.tables.students.push({ ...state.tables.students[0], id: 'new-child', full_name: 'New Child' });
    state.tables.sessions.push({ ...state.tables.sessions[0], id: 'new-lesson', student_id: 'new-child' });
    state.tables.school_contracts.push({ ...state.tables.school_contracts[0], id: 'new-contract', student_id: 'new-child' });
    const result = await request({ action: 'send-batch', ...tokens });
    expect(result.status).toBe(200);
    expect(result.body.sent.flatMap((row: any) => row.studentIds).sort()).toEqual(['kajus', 'palaima']);
    expect(result.body.skippedCount).toBe(0);
    expect(vi.mocked(sendSchoolMonthlyInvoiceEmail).mock.calls.every((call) => call[1].student_id !== 'new-child')).toBe(true);
  });

  it('reports a reviewed child that becomes unconfirmed while sending the other child', async () => {
    familyTables();
    vi.mocked(allocateInvoiceNumber).mockResolvedValue('SF-1');
    vi.mocked(sendSchoolMonthlyInvoiceEmail).mockResolvedValue({ sent: true } as any);
    const preview = await request({ action: 'batch-preview' });
    const tokens = batchTokens(preview);
    // A separate occurrence loses its confirmation after the administrator reviewed it.
    state.tables.sessions[1].class_group_id = null;
    state.tables.sessions[1].status_confirmed_at = null;
    state.tables.sessions[1].tutor_joined_at = null;
    state.tables.sessions[1].student_joined_at = null;
    const result = await request({ action: 'send-batch', ...tokens });
    expect(result.status).toBe(200);
    expect(result.body.sentCount).toBe(1);
    expect(result.body.sent[0].studentIds).toEqual(['kajus']);
    expect(result.body.skippedCount).toBe(1);
    expect(result.body.skipped[0]).toMatchObject({ studentId: 'palaima', error: expect.stringContaining('patvirtinkite') });
    expect(sendSchoolMonthlyInvoiceEmail).toHaveBeenCalledTimes(1);
  });

  it('applies a confirmed discount addendum when issuing a monthly invoice', async () => {
    const original = state.tables.sessions[0];
    state.tables.sessions = Array.from({ length: 3 }, (_, index) => ({
      ...original,
      id: `russian-${index}`,
      price: 6,
      class_group_id: 'group-russian',
      class_group: { name: 'Rusų kalba 11 klasė' },
      tutor_id: 'teacher1',
      subject_id: null,
      subject: null,
    }));
    state.tables.school_contracts.push({
      id: 'contract-russian',
      organization_id: 'org1',
      student_id: 'child1',
      kind: 'extra_lessons',
      signing_status: 'signed',
      accepted_at: '2026-09-01T00:00:00Z',
      start_within_14_status: 'yes',
      class_group_id: 'group-russian',
      unit_price_eur: 6,
      order_snapshot: { service_type: 'group', group_id: 'group-russian', start_date: '2026-09-01', end_date: '2027-06-01' },
    });
    state.tables.school_discount_agreements.push({
      id: 'discount-1',
      student_id: 'child1',
      contract_id: 'contract-russian',
      organization_id: 'org1',
      subject_id: null,
      tutor_id: 'teacher1',
      discount_type: 'percent',
      discount_value: 100,
      valid_from: '2026-09-01',
      valid_until: '2027-06-30',
      agreement_number: 'NPR-20261001-097BB0',
      status: 'accepted',
      accepted_at: '2026-09-14T10:00:00Z',
    });
    const preview = await request({ action: 'preview' });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      subtotalEur: 18,
      discountAmountEur: 18,
      totalEur: 0,
      lines: [{ quantity: 3, originalAmountEur: 18, discountAmountEur: 18, amountEur: 0, discountType: 'percent', discountValue: 100 }],
    });
  });

  it('reports an explicitly requested child whose payer changes after review', async () => {
    familyTables();
    const preview = await request({ action: 'batch-preview' });
    const group = preview.body.payers.find((row: any) => row.payerEmail === 'akvile@example.com');
    state.tables.students[0].payer_email = 'changed@example.com';
    const result = await request({
      action: 'send-batch',
      payerKey: group.payerKey,
      previewTokens: { kajus: group.students[0].previewToken },
      payerPreviewTokens: { [group.payerKey]: group.payerPreviewToken },
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ sentCount: 0, skippedCount: 1,
      skipped: [{ studentId: 'kajus', error: expect.stringContaining('pasikeitė') }] });
    expect(allocateInvoiceNumber).not.toHaveBeenCalled();
  });
});
