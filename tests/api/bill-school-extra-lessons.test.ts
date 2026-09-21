import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ contracts: [] as any[], sessions: [] as any[], discounts: [] as any[], inserts: [] as any[], filters: [] as any[], sessionError: null as any, emails: 0 }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from(table: string) {
    let insert: any;
    let afterId: string | null = null;
    const query: any = {
      select: () => query, not: () => query, is: () => query,
      order: () => query, limit: () => query, in: () => query,
      gt: (_key: string, value: string) => { afterId = value; return query; },
      eq: (key: string, value: any) => { state.filters.push([table, key, value]); return query; },
      gte: (key: string, value: any) => { state.filters.push([table, key, value]); return query; },
      lte: (key: string, value: any) => { state.filters.push([table, key, value]); return query; },
      insert: (row: any) => { insert = row; state.inserts.push(row); return query; },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: 'invoice', ...insert }, error: null }),
      then: (resolve: any) => resolve({ data: afterId ? [] : table === 'school_contracts' ? state.contracts : table === 'school_discount_agreements' ? state.discounts : state.sessions, error: table === 'sessions' ? state.sessionError : null }),
    };
    return query;
  },
}) }));
vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ snapshotFromRow: (row: any) => row.order_snapshot }));
vi.mock('../../api/_lib/schoolMonthlyInvoiceEmail.js', () => ({ sendSchoolMonthlyInvoiceEmail: async () => { state.emails++; return { sent: true }; } }));
vi.mock('../../api/_lib/publicLinkToken.js', () => ({ publicAppOrigin: () => 'https://example.com' }));

import handler from '../../api/bill-school-extra-lessons';
import { EXTRA_LESSONS_LEGAL_BODY } from '../../src/lib/extraLessonsLegalBody';

function contract(id: string, service_type: string, group_id: string | null, subject_id: string, base = 8) {
  return { id, organization_id: 'org', student_id: 'student', student: { payer_email: 'parent@example.com' }, org: { id: 'org' }, class_group_id: group_id, unit_price_eur: 10, base_lessons_per_month: base, accepted_at: '2026-07-01T10:00:00Z', start_within_14_status: 'yes', order_snapshot: { service_type, group_id, subject_id, start_date: '2026-07-01', end_date: '2027-06-30' } };
}
async function run(query: Record<string, string> = {}) {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: 'GET', query } as any, response);
  return response;
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-01T04:00:00Z'));
  state.contracts = []; state.sessions = []; state.discounts = []; state.inserts = []; state.filters = []; state.sessionError = null; state.emails = 0;
});
afterEach(() => vi.useRealTimers());

describe('monthly school billing allocation', () => {
  it('previews an elapsed interval and organization without any inserts or emails', async () => {
    state.contracts = [contract('first', 'individual', null, 'math')];
    const response = await run({ dryRun: 'true', organizationId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', periodStart: '2026-08-01', periodEnd: '2026-08-07' });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(state.inserts).toHaveLength(0); expect(state.emails).toBe(0);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, planned: [expect.objectContaining({ contract_id: 'first', total_eur: 80 })], period: { start: '2026-08-01', end: '2026-08-07' } }));
    expect(state.filters).toContainEqual(['school_contracts', 'organization_id', '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17']);
  });
  it('rejects date overrides for live writes, future intervals and invalid organizations', async () => {
    for (const query of [
      { periodStart: '2026-08-01', periodEnd: '2026-08-07' },
      { dryRun: 'true', periodStart: '2026-09-01', periodEnd: '2026-09-07' },
      { dryRun: 'true', organizationId: 'invalid' },
    ]) expect((await run(query)).status).toHaveBeenCalledWith(400);
    expect(state.inserts).toHaveLength(0); expect(state.emails).toBe(0);
  });
  it('uses canonical actual group charges per child and caches the shared group read', async () => {
    const canonical = { ...contract('first', 'group', 'g1', 'math'), organization_id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', filled_body: EXTRA_LESSONS_LEGAL_BODY };
    state.contracts = [canonical, { ...canonical, id: 'second', student_id: 'student2' }];
    state.sessions = [
      { id: 'a', student_id: 'student', class_group_id: 'g1', subject_id: 'math', start_time: '2026-08-10T10:00:00Z', status: 'completed', tutor_joined_at: '2026-08-10T10:00:00Z', school_billing_kind: 'base' },
      { id: 'b', student_id: 'student2', class_group_id: 'g1', subject_id: 'math', start_time: '2026-08-10T10:00:00Z', status: 'no_show', school_billing_kind: 'base' },
    ];
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(state.inserts.map((row) => [row.contract_id, row.total_eur, row.billing_model, row.billed_session_ids, row.due_date])).toEqual([
      ['first', 10, 'actual', ['a'], '2026-09-08'], ['second', 10, 'actual', ['b'], '2026-09-08'],
    ]);
    expect(state.filters.filter(([table, key]) => table === 'sessions' && key === 'class_group_id')).toHaveLength(2); // data page + empty page, once for both children.
  });

  it('freezes a parent-approved contract discount even if its UI feature was later disabled', async () => {
    const organizationId = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
    state.contracts = [{ ...contract('first', 'individual', null, 'math'), organization_id: organizationId,
      org: { id: organizationId, features: { school_extra_lessons_contract: false } }, filled_body: EXTRA_LESSONS_LEGAL_BODY }];
    state.sessions = [
      { id: 'before', student_id: 'student', subject_id: 'math', tutor_id: 'teacher', start_time: '2026-08-10T10:00:00Z', status: 'completed', tutor_joined_at: '2026-08-10T10:00:00Z', school_billing_kind: 'base' },
      { id: 'after', student_id: 'student', subject_id: 'math', tutor_id: 'teacher', start_time: '2026-08-20T10:00:00Z', status: 'completed', tutor_joined_at: '2026-08-20T10:00:00Z', school_billing_kind: 'base' },
    ];
    state.discounts = [{ id: 'discount', contract_id: 'first', agreement_number: 'NPR-1', subject_id: 'math', tutor_id: 'teacher',
      discount_type: 'percent', discount_value: 25, valid_from: '2026-08-01', valid_until: '2026-08-31', accepted_at: '2026-08-15T10:00:00Z', note: null }];
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(state.inserts[0]).toMatchObject({ contract_id: 'first', subtotal_eur: 20, discount_amount_eur: 2.5,
      total_eur: 17.5, discount_note: 'NPR-1', payment_status: 'pending' });
    expect(state.emails).toBe(1);
  });

  it('records a fully discounted month as paid and still emails the zero amount', async () => {
    const organizationId = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
    state.contracts = [{ ...contract('first', 'individual', null, 'math'), organization_id: organizationId,
      org: { id: organizationId, features: { school_extra_lessons_contract: true } }, filled_body: EXTRA_LESSONS_LEGAL_BODY }];
    state.sessions = [{ id: 'lesson', student_id: 'student', subject_id: 'math', tutor_id: 'teacher',
      start_time: '2026-08-20T10:00:00Z', status: 'completed', tutor_joined_at: '2026-08-20T10:00:00Z', school_billing_kind: 'base' }];
    state.discounts = [{ id: 'discount', contract_id: 'first', agreement_number: 'NPR-1', subject_id: 'math', tutor_id: 'teacher',
      discount_type: 'percent', discount_value: 100, valid_from: '2026-08-01', valid_until: '2026-08-31', accepted_at: '2026-08-15T10:00:00Z', note: null }];
    expect((await run()).status).toHaveBeenCalledWith(200);
    expect(state.inserts[0]).toMatchObject({ subtotal_eur: 10, discount_amount_eur: 10, total_eur: 0, payment_status: 'paid' });
    expect(state.emails).toBe(1);
  });

  it('holds an entire canonical invoice with unconfirmed outcomes', async () => {
    state.contracts = [{ ...contract('first', 'individual', null, 'math'), organization_id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', filled_body: EXTRA_LESSONS_LEGAL_BODY }];
    state.sessions = [{ id: 'a', student_id: 'student', subject_id: 'math', start_time: '2026-08-10T10:00:00Z', status: 'completed' }];
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(409);
    expect(state.inserts).toHaveLength(0);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ review: [{ contract_id: 'first', reason: 'unconfirmed_session_outcomes', session_ids: ['a'] }] }));
  });

  it('holds a canonical contract with missing scheduled lesson rows instead of assuming zero supplied services', async () => {
    state.contracts = [{ ...contract('first', 'individual', null, 'math'), organization_id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', filled_body: EXTRA_LESSONS_LEGAL_BODY }];
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(409);
    expect(state.inserts).toHaveLength(0);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ review: [{ contract_id: 'first', reason: 'missing_session_rows_for_scheduled_service' }] }));
  });
  it('invoices only the matching group or individual service and its own allotment', async () => {
    state.contracts = [contract('group', 'group', 'g1', 'math', 12), contract('individual', 'individual', null, 'english')];
    state.sessions = [
      { id: 'group-extra', class_group_id: 'g1', subject_id: 'math', start_time: '2026-08-10T10:00:00Z', status: 'completed', school_billing_kind: 'extra' },
      { id: 'individual-extra', class_group_id: null, subject_id: 'english', start_time: '2026-08-11T10:00:00Z', status: 'completed', school_billing_kind: 'extra' },
      { id: 'other-group', class_group_id: 'g2', subject_id: 'math', start_time: '2026-08-12T10:00:00Z', status: 'completed', school_billing_kind: 'extra' },
    ];
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(state.inserts.map((row) => [row.contract_id, row.total_eur, row.extra_session_ids])).toEqual([
      ['group', 130, ['group-extra']], ['individual', 90, ['individual-extra']],
    ]);
    expect(state.filters).toContainEqual(['sessions', 'tutor.organization_id', 'org']);
    expect(state.filters).toContainEqual(['sessions', 'start_time', '2026-07-31T21:00:00.000Z']);
  });

  it('holds ambiguous agreements instead of billing a lesson twice', async () => {
    state.contracts = [contract('one', 'individual', null, 'english'), contract('two', 'individual', null, 'english')];
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(409);
    expect(state.inserts).toHaveLength(0);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ held: 2 }));
  });

  it('does not create a partial invoice when loading sessions fails', async () => {
    state.contracts = [contract('group', 'group', 'g1', 'math')];
    state.sessionError = { message: 'database unavailable' };
    const response = await run();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(state.inserts).toHaveLength(0);
  });
});
