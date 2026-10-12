import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_QA_ORG_ID } from '../../api/_lib/marketMoney';
import { proKlaseSessionPayEur } from '../../api/_lib/proKlaseTutorPay';
import { sessionClientRevenueEur } from '../../src/lib/sessionComplimentary';
import { countPastUnpaidSessions } from '../../src/lib/session-stats';

const state = vi.hoisted(() => ({
  access: vi.fn(),
  tables: {} as Record<string, any[]>,
  writes: [] as any[],
  errorTable: '' as string,
  beforeSave: null as (() => void) | null,
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: state.access }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from(table: string) {
    const filters: Array<(row: any) => boolean> = [];
    let patch: Record<string, unknown> | null = null;
    let maxRows = Infinity;
    const values = (row: any, key: string): any[] => key.split('.').reduce<any[]>((current, part) =>
      current.flatMap(value => Array.isArray(value?.[part]) ? value[part] : [value?.[part]]), [row]);
    const resolve = () => {
      if (patch && state.beforeSave) { const callback = state.beforeSave; state.beforeSave = null; callback(); }
      if (state.errorTable === table) return { data: null, error: { message: 'Private SQL detail' } };
      const rows = (state.tables[table] || []).filter(row => filters.every(filter => filter(row))).slice(0, maxRows);
      if (patch && rows.length) {
        state.writes.push({ table, ids: rows.map(row => row.id), patch });
        for (const row of rows) Object.assign(row, patch);
      }
      return { data: rows, error: null };
    };
    const query: any = {
      select: () => query,
      eq(key: string, value: unknown) { filters.push(row => values(row, key).includes(value)); return query; },
      is(key: string, value: unknown) { filters.push(row => values(row, key).some(current => (current ?? null) === value)); return query; },
      neq(key: string, value: unknown) { filters.push(row => values(row, key).some(current => current != null && current !== value)); return query; },
      contains(key: string, ids: string[]) { filters.push(row => ids.every(id => row[key]?.includes(id))); return query; },
      limit(count: number) { maxRows = count; return query; },
      update(value: Record<string, unknown>) { patch = value; return query; },
      maybeSingle: async () => { const result = resolve(); return { ...result, data: result.data?.[0] ?? null }; },
      then: (yes: (value: unknown) => void, no: (reason: unknown) => void) => Promise.resolve(resolve()).then(yes, no),
    };
    return query;
  },
}) }));
import handler from '../../api/annul-session-payment';

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  state.access.mockReset().mockResolvedValue({ ok: true, access: { organizationId: PRO_KLASE_QA_ORG_ID, userId: 'admin' } });
  state.tables = {
    sessions: [{ id: 'lesson-1', tutor_id: 'tutor-1', student_id: 'student-1', status: 'no_show',
      status_confirmed_at: '2026-10-12T15:00:00Z', end_time: '2026-10-12T15:00:00Z', price: 30, paid: false, payment_status: 'pending',
      is_complimentary: false, lesson_package_id: null, payment_batch_id: null,
      stripe_checkout_session_id: null, class_group_id: null, school_billing_kind: null }],
    profiles: [{ id: 'tutor-1', organization_id: PRO_KLASE_QA_ORG_ID }],
    invoice_line_items: [], invoices: [], pooled_package_quotes: [], payments: [],
  };
  state.writes = [];
  state.errorTable = '';
  state.beforeSave = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function request(body: Record<string, unknown> = {}, method = 'POST') {
  const res: any = { code: 0, body: null, setHeader: vi.fn(),
    status(code: number) { res.code = code; return res; }, json(value: unknown) { res.body = value; return res; } };
  await handler({ method, body: { sessionId: 'lesson-1', ...body } } as any, res);
  return res;
}

describe('administrator lesson payment annulment', () => {
  it('removes the client charge while retaining the confirmed no-show and its 6 EUR tutor pay', async () => {
    const now = new Date('2026-10-12T16:00:00Z');
    expect(countPastUnpaidSessions(state.tables.sessions, now)).toBe(1);
    const result = await request();
    expect(result.code).toBe(200);
    expect(result.body.session).toMatchObject({ id: 'lesson-1', paid: true, payment_status: 'paid', is_complimentary: true });
    const saved = state.tables.sessions[0];
    expect(saved).toMatchObject({ status: 'no_show', status_confirmed_at: '2026-10-12T15:00:00Z', price: 30 });
    expect(sessionClientRevenueEur(saved)).toBe(0);
    expect(proKlaseSessionPayEur(saved, 25)).toBe(6);
    expect(countPastUnpaidSessions(state.tables.sessions, now)).toBe(0);
    expect((await request()).code).toBe(200);
    expect(state.writes).toHaveLength(1);
  });
  it('preserves the ordinary tutor rate for a completed lesson', async () => {
    state.tables.sessions[0].status = 'completed';
    expect((await request()).code).toBe(200);
    expect(proKlaseSessionPayEur(state.tables.sessions[0], 25)).toBe(25);
  });
  it('does not invent an attendance confirmation or tutor pay', async () => {
    state.tables.sessions[0].status_confirmed_at = null;
    expect((await request()).code).toBe(200);
    expect(state.tables.sessions[0].status_confirmed_at).toBeNull();
    expect(proKlaseSessionPayEur(state.tables.sessions[0], 25)).toBe(0);
  });
  it('keeps the Pro Klasė action out of another organization’s billing flow', async () => {
    state.access.mockResolvedValue({ ok: true, access: { organizationId: 'another-org', userId: 'admin' } });
    expect((await request()).code).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it.each([401, 403])('requires sessions.edit through authenticated admin access (%s)', async code => {
    state.access.mockResolvedValue({ ok: false, status: code });
    expect((await request()).code).toBe(code);
    expect(state.access.mock.calls[0][2]).toBe('sessions.edit');
    expect(state.writes).toEqual([]);
  });
  it('rejects another organization’s session even if the caller supplies its organization ID', async () => {
    state.tables.profiles[0].organization_id = 'foreign';
    expect((await request({ organizationId: 'foreign' })).code).toBe(403);
    expect(state.writes).toEqual([]);
  });
  it.each([
    [{ paid: true }, 'paid'], [{ payment_status: 'paid' }, 'paid'],
    [{ lesson_package_id: 'package' }, 'billed'], [{ payment_batch_id: 'batch' }, 'billed'],
    [{ stripe_checkout_session_id: 'checkout' }, 'checkout'],
    [{ status: 'cancelled' }, 'notAllowed'], [{ class_group_id: 'group' }, 'notAllowed'],
    [{ school_billing_kind: 'annual' }, 'notAllowed'],
  ])('rejects an ineligible payment %j', async (overrides, code) => {
    Object.assign(state.tables.sessions[0], overrides);
    expect(await request()).toMatchObject({ code: 409, body: { code } });
    expect(state.writes).toEqual([]);
  });
  it('blocks a client invoice but allows an existing tutor remuneration invoice', async () => {
    const invoice = { status: 'issued', organization_id: PRO_KLASE_QA_ORG_ID, pdf_meta: { invoiceKind: 'tutor_pay' } };
    state.tables.invoice_line_items = [{ session_ids: ['lesson-1'], invoices: invoice }];
    expect((await request()).code).toBe(200);
    expect(proKlaseSessionPayEur(state.tables.sessions[0], 25)).toBe(6);
    Object.assign(state.tables.sessions[0], { is_complimentary: false, paid: false, payment_status: 'pending' });
    invoice.pdf_meta.invoiceKind = 'customer';
    expect(await request()).toMatchObject({ code: 409, body: { code: 'billed' } });
    expect(state.writes).toHaveLength(1);
  });
  it.each([
    ['invoices', { source_session_id: 'lesson-1', organization_id: PRO_KLASE_QA_ORG_ID, status: 'issued', pdf_meta: null }],
    ['pooled_package_quotes', { session_ids: ['lesson-1'], lesson_packages: { payment_status: 'pending' } }],
    ['payments', { session_id: 'lesson-1' }],
  ])('blocks existing billing evidence in %s', async (table, row) => {
    state.tables[table] = [row];
    expect(await request()).toMatchObject({ code: 409, body: { code: 'billed' } });
    expect(state.writes).toEqual([]);
  });
  it('allows annulment after linked client invoices and package offers were cancelled', async () => {
    state.tables.invoice_line_items = [{ session_ids: ['lesson-1'], invoices: { status: 'cancelled', organization_id: PRO_KLASE_QA_ORG_ID } }];
    state.tables.pooled_package_quotes = [{ session_ids: ['lesson-1'], lesson_packages: { payment_status: 'cancelled' } }];
    expect((await request()).code).toBe(200);
  });
  it.each(['profiles', 'invoice_line_items', 'invoices', 'pooled_package_quotes', 'payments'])('fails closed on a %s lookup error', async table => {
    state.errorTable = table;
    const result = await request();
    expect(result).toMatchObject({ code: 503, body: { code: 'failed' } });
    expect(JSON.stringify(result.body)).not.toContain('Private SQL');
    expect(state.writes).toEqual([]);
  });
  it.each([
    { paid: true }, { payment_status: 'paid' }, { lesson_package_id: 'new-package' },
    { payment_batch_id: 'new-batch' }, { stripe_checkout_session_id: 'new-checkout' },
    { tutor_id: 'another-tutor' }, { student_id: 'another-student' }, { status: 'cancelled' },
  ])('does not overwrite a concurrent payment or lesson change %j', async change => {
    state.beforeSave = () => Object.assign(state.tables.sessions[0], change);
    expect(await request()).toMatchObject({ code: 409, body: { code: 'changed' } });
    expect(state.writes).toEqual([]);
    expect(state.tables.sessions[0].is_complimentary).toBe(false);
  });
  it('accepts legacy nullable unpaid fields', async () => {
    Object.assign(state.tables.sessions[0], { paid: null, payment_status: null });
    expect((await request()).code).toBe(200);
  });
  it('rejects unsupported methods, missing lessons and invalid input', async () => {
    expect((await request({}, 'GET')).code).toBe(405);
    expect((await request({ sessionId: '' })).code).toBe(400);
    expect((await request({ sessionId: 'missing' })).code).toBe(404);
    expect(state.writes).toEqual([]);
  });
});
