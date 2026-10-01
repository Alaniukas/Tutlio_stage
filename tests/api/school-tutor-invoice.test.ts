import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, writes: [] as Array<{ table: string; value: any }>,
  filters: [] as Array<[string, string, unknown]>, cap: 500, allocations: 0, orgError: false }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeDb() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => ({ isInternal: true }) }));
vi.mock('../../api/_lib/invoiceNumber.js', () => ({ allocateInvoiceNumber: async () => { state.allocations++; return 'T-1'; }, formatInvoiceSeriesHeading: () => 'T-1' }));
vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: async () => new Uint8Array([1]) }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
import handler from '../../api/generate-invoice';

function fakeDb(): any {
  return { storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    from(table: string) {
      const predicates: Array<(row: any) => boolean> = [];
      let from = 0, to = Infinity, inserted: any = undefined, update: any = undefined;
      const compare = (key: string, value: unknown, operator: (a: any, b: any) => boolean) => {
        predicates.push(row => operator(key.endsWith('_time') ? Date.parse(row[key]) : row[key], key.endsWith('_time') ? Date.parse(String(value)) : value));
      };
      const q: any = {
        select: () => q, order: () => q,
        eq: (key: string, value: unknown) => { state.filters.push(['eq', key, value]); predicates.push(row => key.split('.').reduce((item, part) => item?.[part], row) === value); return q; },
        neq: (key: string, value: unknown) => { predicates.push(row => row[key] !== value); return q; },
        in: (key: string, value: unknown[]) => { predicates.push(row => value.includes(row[key])); return q; },
        gte: (key: string, value: unknown) => { state.filters.push(['gte', key, value]); compare(key, value, (a, b) => a >= b); return q; },
        lte: (key: string, value: unknown) => { compare(key, value, (a, b) => a <= b); return q; },
        lt: (key: string, value: unknown) => { state.filters.push(['lt', key, value]); compare(key, value, (a, b) => a < b); return q; },
        overlaps: (key: string, values: string[]) => { state.filters.push(['overlaps', key, values]); predicates.push(row => row[key]?.some((id: string) => values.includes(id))); return q; },
        range: (a: number, b: number) => { from = a; to = Math.min(b + 1, a + state.cap); return q; },
        insert: (value: any) => { inserted = value; state.writes.push({ table, value }); return q; },
        update: (value: any) => { update = value; state.writes.push({ table, value }); return q; },
        delete: () => q,
        single: async () => {
          if (inserted) return { data: { id: 'new-invoice', ...inserted }, error: null };
          return { data: (state.tables[table] || []).find(row => predicates.every(p => p(row))) || null, error: null };
        },
        maybeSingle: async () => ({ data: (state.tables[table] || []).find(row => predicates.every(p => p(row))) || null,
          error: table === 'organizations' && state.orgError ? { message: 'unavailable' } : null }),
        then: (resolve: any, reject: any) => Promise.resolve({ data: inserted || update ? null
          : (state.tables[table] || []).filter(row => predicates.every(p => p(row))).slice(from, Math.min(to, from + state.cap)), error: null }).then(resolve, reject),
      }; return q;
    } };
}
const base = { tutor_id: 'teacher', student_id: 'student', class_group_id: 'group', subject_id: 'math', status: 'completed',
  start_time: '2026-09-15T06:00:00Z', end_time: '2026-09-15T07:00:00Z', tutor_pay_eur_snapshot: 45,
  subjects: { name: 'Math', is_group: false }, students: { full_name: 'Student', organization_id: 'school' } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  state.writes = []; state.filters = []; state.cap = 500; state.allocations = 0; state.orgError = false;
  state.tables = {
    profiles: [{ id: 'teacher', full_name: 'Teacher', organization_id: 'school', company_commission_percent: 0, company_commission_by_subject: {} }],
    organizations: [{ id: 'school', entity_type: 'school', name: 'School' }],
    invoice_profiles: [{ id: 'tutor-profile', user_id: 'teacher', entity_type: 'individual' },
      { id: 'school-profile', organization_id: 'school', business_name: 'Legal School', company_code: '123' }],
    sessions: Array.from({ length: 6 }, (_, index) => ({ ...base, id: `child-${index}`, student_id: `student-${index}` })),
    invoices: [], invoice_line_items: [], school_group_attendance_attestations: [],
  };
});
afterEach(() => vi.useRealTimers());
async function request(body: any = {}) {
  const res: any = { code: 200, body: null, status(code: number) { res.code = code; return res; }, json(value: any) { res.body = value; return res; } };
  await handler({ method: 'POST', body: { tutorId: 'teacher', periodStart: '2026-09-01', periodEnd: '2026-09-30', groupingType: 'single', isOrgTutor: true, ...body } } as any, res);
  return res;
}
describe('school teacher invoices by meeting', () => {
  const attendanceId = '60e0a05a-044c-4314-bc6c-97e4e9dc311d';
  const attendance = () => ({ id: attendanceId, organization_id: 'school', group_id: 'group', tutor_id: 'teacher',
    student_id: 'unsigned-child', anchor_session_id: null, start_time: base.start_time, end_time: base.end_time,
    status: 'completed', confirmed_at: '2026-09-15T07:05:00Z', tutor_pay_eur_snapshot: 45,
    group_name: 'Group', contract_confirmed: false });
  it('pays a conducted attendance-only meeting at its historical teacher rate without child billing', async () => {
    state.tables.sessions = [];
    state.tables.profiles[0].company_commission_percent = 90;
    state.tables.school_group_attendance_attestations = [attendance()];
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true, candidateCount: 1 });
    const result = await request({ sessionIds: [], attendanceIds: [attendanceId] });
    expect(result.code).toBe(200);
    const invoice = state.writes.find(write => write.table === 'invoices' && write.value.total_amount)?.value;
    expect(invoice).toMatchObject({ total_amount: 45, pdf_meta: { layout: 'school_tutor_meetings', tutorId: 'teacher',
      schoolMeetingKeys: [`class|group|teacher|${Date.parse(base.start_time)}`] } });
    const line = state.writes.find(write => write.table === 'invoice_line_items')!.value[0];
    expect(line).toMatchObject({ quantity: 1, total_price: 45, session_ids: [], school_attendance_ids: [attendanceId] });
    expect(state.writes.some(write => ['sessions', 'school_contracts', 'school_group_attendance_attestations'].includes(write.table))).toBe(false);
  });
  it('pays one mixed meeting when only the unsigned child attended and retains both source types', async () => {
    state.tables.sessions.forEach((row, index) => { row.status = index === 0 ? 'cancelled' : 'active'; row.tutor_pay_eur_snapshot = 90; });
    state.tables.school_group_attendance_attestations = [attendance()];
    const result = await request({ attendanceIds: [attendanceId] });
    expect(result.code).toBe(200);
    const line = state.writes.find(write => write.table === 'invoice_line_items')!.value[0];
    expect(line).toMatchObject({ quantity: 1, total_price: 45, school_attendance_ids: [attendanceId] });
    expect(line.session_ids).toHaveLength(6);
  });
  it('blocks a paid attendance meeting after normal sessions are later materialized', async () => {
    state.tables.school_group_attendance_attestations = [attendance()];
    state.tables.sessions = [{ ...base, id: 'new-real-row', student_id: 'unsigned-child' }];
    state.tables.invoices = [{ id: 'earlier', organization_id: 'school', status: 'issued', invoice_number: 'OLD', total_amount: 45,
      pdf_meta: { layout: 'school_tutor_meetings', tutorId: 'teacher',
        schoolMeetingKeys: [`class|group|teacher|${Date.parse(base.start_time)}`] } }];
    state.tables.invoice_line_items = [{ invoice_id: 'earlier', session_ids: [], school_attendance_ids: [attendanceId] }];
    expect((await request({ sessionIds: ['new-real-row'], precheckOnly: true })).body).toMatchObject({ canGenerate: false, reason: 'duplicate' });
    expect((await request({ sessionIds: ['new-real-row'] })).code).toBe(400);
    expect(state.allocations).toBe(0);
  });
  it('blocks overlapping attendance invoices and ignores other tutors and customer sales invoices', async () => {
    state.tables.sessions = [];
    state.tables.school_group_attendance_attestations = [attendance()];
    state.tables.invoices = [{ id: 'earlier', organization_id: 'school', status: 'issued', invoice_number: 'OLD', total_amount: 45,
      pdf_meta: { layout: 'school_tutor_meetings', tutorId: 'teacher' } }];
    state.tables.invoice_line_items = [{ invoice_id: 'earlier', session_ids: [], school_attendance_ids: [attendanceId] }];
    expect((await request({ precheckOnly: true })).body.reason).toBe('duplicate');
    state.tables.invoices[0].pdf_meta.tutorId = 'other-teacher';
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true, candidateCount: 1 });
    state.tables.invoices[0].pdf_meta = { layout: 'pvm_education' };
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true });
  });
  it('rejects a foreign or superseded attendance selection before allocating an invoice', async () => {
    state.tables.sessions = [];
    state.tables.school_group_attendance_attestations = [attendance()];
    const foreignId = '70e0a05a-044c-4314-bc6c-97e4e9dc311d';
    expect((await request({ attendanceIds: [foreignId] })).code).toBe(409);
    state.tables.sessions = [{ ...base, id: 'authoritative', student_id: 'unsigned-child', status: 'cancelled' }];
    expect((await request({ attendanceIds: [attendanceId] })).code).toBe(409);
    expect((await request({ attendanceIds: ['not-a-uuid'] })).code).toBe(400);
    expect(state.allocations).toBe(0);
  });
  it('excludes prior-school real lessons of a teacher transferred to this school', async () => {
    state.tables.sessions = [{ ...base, id: 'prior-school-row', students: { full_name: 'Previous student', organization_id: 'previous-school' } }];
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: false, reason: 'no_sessions' });
    expect((await request({ sessionIds: ['prior-school-row'] })).code).toBe(409);
    expect(state.allocations).toBe(0);
    expect(state.writes).toHaveLength(0);
  });
  it('keeps earned attendance pay when later materialization adds an unstamped real row', async () => {
    state.tables.school_group_attendance_attestations = [attendance()];
    state.tables.sessions = [{ ...base, id: 'later-pending', student_id: 'unsigned-child', status: 'active',
      tutor_pay_eur_snapshot: 90, status_confirmed_at: null }];
    expect((await request({ attendanceIds: [attendanceId] })).code).toBe(200);
    const line = state.writes.find(write => write.table === 'invoice_line_items')!.value[0];
    expect(line).toMatchObject({ quantity: 1, total_price: 45, session_ids: ['later-pending'], school_attendance_ids: [attendanceId] });
  });
  it('never replaces the attendance snapshot with a later contradictory confirmed session rate', async () => {
    state.tables.school_group_attendance_attestations = [attendance()];
    state.tables.sessions = [{ ...base, id: 'later-confirmed', student_id: 'unsigned-child',
      tutor_pay_eur_snapshot: 90, status_confirmed_at: '2026-09-20T08:00:00Z' }];
    expect((await request()).body).toMatchObject({ code: 'SCHOOL_TUTOR_PAY_UNRESOLVED', conflictCount: 1 });
    expect(state.allocations).toBe(0);
    expect(state.writes).toHaveLength(0);
  });
  it('pays once for several unsigned attending children and keeps all factual source IDs', async () => {
    state.tables.sessions = [];
    const otherId = '70e0a05a-044c-4314-bc6c-97e4e9dc311d';
    state.tables.school_group_attendance_attestations = [attendance(), { ...attendance(), id: otherId, student_id: 'second-unsigned' }];
    expect((await request({ attendanceIds: [attendanceId] })).code).toBe(200);
    const line = state.writes.find(write => write.table === 'invoice_line_items')!.value[0];
    expect(line).toMatchObject({ quantity: 1, total_price: 45, session_ids: [], school_attendance_ids: [attendanceId, otherId] });
  });
  it('keeps standalone absence evidence out of teacher pay when no child is confirmed attended', async () => {
    state.tables.sessions = [];
    state.tables.school_group_attendance_attestations = [{ ...attendance(), status: 'no_show' }];
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: false, reason: 'no_sessions' });
    expect((await request({ attendanceIds: [attendanceId] })).code).toBe(409);
    expect(state.allocations).toBe(0);
  });
  it('pays stored completed meetings without a confirmation stamp', async () => {
    state.tables.organizations[0].features = { tutor_lesson_status_confirmation: true };
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true, candidateCount: 1 });
    expect(state.allocations).toBe(0);
  });
  it('pays stored completed Laisvi vaikai meetings without a confirmation stamp', async () => {
    const organizationId = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
    state.tables.profiles[0].organization_id = organizationId;
    state.tables.organizations[0].id = organizationId;
    state.tables.invoice_profiles[1].organization_id = organizationId;
    state.tables.sessions.forEach(row => { row.students = { ...row.students, organization_id: organizationId }; });
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true, candidateCount: 1 });
    expect((await request({ sessionIds: ['child-0'] })).code).toBe(200);
  });
  it.each(['single', 'per_payment'])('issues one €45 meeting for six children with %s grouping and all source ids', async groupingType => {
    const result = await request({ groupingType, onlyPaid: true });
    expect(result.code).toBe(200);
    const invoice = state.writes.find(write => write.table === 'invoices' && write.value.total_amount)?.value;
    expect(invoice).toMatchObject({ total_amount: 45, pdf_meta: { layout: 'school_tutor_meetings', tutorId: 'teacher' } });
    const lines = state.writes.find(write => write.table === 'invoice_line_items')!.value;
    expect(lines).toHaveLength(1); expect(lines[0]).toMatchObject({ quantity: 1, total_price: 45 });
    expect(lines[0].session_ids).toHaveLength(6);
    expect(state.writes.some(write => write.table === 'sessions' || write.table === 'school_contracts')).toBe(false);
  });
  it('accepts complete grouped preview coverage with pending/cancelled siblings and ignores their old rates', async () => {
    state.tables.sessions[1].status = 'active'; state.tables.sessions[1].tutor_pay_eur_snapshot = 90;
    state.tables.sessions[2].status = 'cancelled'; state.tables.sessions[2].tutor_pay_eur_snapshot = 90;
    expect((await request({ sessionIds: state.tables.sessions.map(row => row.id) })).code).toBe(200);
    expect(state.writes.find(write => write.table === 'invoice_line_items')!.value[0]).toMatchObject({ quantity: 1, total_price: 45 });
  });
  it('blocks missing/conflicting pay before invoice number allocation and never substitutes child price', async () => {
    state.tables.sessions.forEach(row => { row.tutor_pay_eur_snapshot = null; row.price = 100; });
    expect((await request({ precheckOnly: true })).body).toMatchObject({ code: 'SCHOOL_TUTOR_PAY_UNRESOLVED', missingCount: 1, conflictCount: 0 });
    state.tables.sessions[0].tutor_pay_eur_snapshot = 45; state.tables.sessions[1].tutor_pay_eur_snapshot = 0;
    expect((await request()).body).toMatchObject({ code: 'SCHOOL_TUTOR_PAY_UNRESOLVED', conflictCount: 1 });
    expect(state.allocations).toBe(0); expect(state.writes).toHaveLength(0);
  });
  it('expands a submitted child to siblings and blocks an overlapping earlier school teacher invoice', async () => {
    state.tables.invoice_line_items = [{ invoice_id: 'earlier', session_ids: ['child-5'] }];
    state.tables.invoices = [{ id: 'earlier', organization_id: 'school', status: 'issued', invoice_number: 'OLD', total_amount: 45,
      period_start: '2026-09-10', period_end: '2026-09-20', pdf_meta: { layout: 'school_tutor_meetings', tutorId: 'teacher' } }];
    expect((await request({ sessionIds: ['child-0'], precheckOnly: true })).body).toMatchObject({ canGenerate: false, reason: 'duplicate' });
    expect(state.filters).not.toContainEqual(['eq', 'period_start', '2026-09-01']);
    expect(state.filters.find(filter => filter[0] === 'overlaps')?.[2]).toHaveLength(6);
  });
  it('recognizes legacy teacher invoices by seller and organization buyer without conflating payer invoices', async () => {
    state.tables.invoice_line_items = [{ invoice_id: 'earlier', session_ids: ['child-5'] }];
    state.tables.invoices = [{ id: 'earlier', organization_id: 'school', status: 'issued', total_amount: 45, pdf_meta: null,
      seller_snapshot: { name: 'Teacher' }, buyer_snapshot: { name: 'Legal School', companyCode: '123' } }];
    expect((await request({ precheckOnly: true })).body.reason).toBe('duplicate');
    Object.assign(state.tables.invoices[0], { seller_snapshot: { name: 'Legal School', companyCode: '123' }, buyer_snapshot: { name: 'Student' } });
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true, candidateCount: 1 });
  });
  it('finds an old teacher invoice beyond capped pages of overlapping customer invoice lines', async () => {
    state.cap = 37;
    state.tables.invoices = [{ id: 'customer', organization_id: 'school', status: 'issued', pdf_meta: { layout: 'pvm_education' } },
      { id: 'legacy', organization_id: 'school', status: 'issued', invoice_number: 'OLD', total_amount: 45, pdf_meta: null,
        seller_snapshot: { name: 'Teacher' }, buyer_snapshot: { name: 'Legal School', companyCode: '123' } }];
    state.tables.invoice_line_items = [...Array.from({ length: 1005 }, (_, index) => ({
      id: `line-${index}`, invoice_id: 'customer', session_ids: ['child-0'],
    })), { id: 'line-last', invoice_id: 'legacy', session_ids: ['child-0'] }];
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: false, reason: 'duplicate', invoiceNumbers: ['OLD'] });
    expect(state.allocations).toBe(0);
  });
  it('rejects nonconducted, future, outside-period and automatic-only selections and rejects packages', async () => {
    for (const patch of [{ status: 'active' }, { status: 'cancelled' }, { end_time: '2026-10-01T12:00:00Z' },
      { start_time: '2026-08-31T12:00:00Z' }, { status: 'no_show', no_show_reason: 'missed_join', status_confirmed_at: null }]) {
      state.tables.sessions = [{ ...base, id: 'child', ...patch }];
      expect((await request({ sessionIds: ['child'] })).code).toBe(409);
    }
    expect((await request({ packageIds: ['package'] })).code).toBe(400);
    expect(state.allocations).toBe(0);
  });
  it('fails closed if the organization school/company policy cannot be loaded', async () => {
    state.orgError = true; expect((await request()).code).toBe(503); expect(state.allocations).toBe(0);
  });
  it('reads every capped page across 1000 rows and uses Vilnius calendar-month boundaries', async () => {
    state.cap = 137;
    state.tables.sessions = Array.from({ length: 1105 }, (_, index) => ({ ...base, id: `child-${index}`, student_id: `student-${index}` }));
    expect((await request({ precheckOnly: true })).body).toMatchObject({ canGenerate: true, candidateCount: 1 });
    expect(new Set(state.filters.filter(filter => filter[0] === 'overlaps' && filter[1] === 'session_ids')
      .flatMap(filter => filter[2] as string[])).size).toBe(1105);
    const lower = state.filters.find(filter => filter[0] === 'gte' && filter[1] === 'start_time')?.[2];
    const upper = state.filters.find(filter => filter[0] === 'lt' && filter[1] === 'start_time')?.[2];
    expect(Date.parse(String(lower))).toBe(Date.parse('2026-08-31T21:00:00Z'));
    expect(Date.parse(String(upper))).toBe(Date.parse('2026-09-30T21:00:00Z'));
  });
});
