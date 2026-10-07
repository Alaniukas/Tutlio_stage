import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../../api/types';

const state = vi.hoisted(() => ({
  access: vi.fn(), calls: [] as { table: string; filters: [string, string, unknown][]; from: number }[],
  tables: {} as Record<string, Record<string, any>[]>, failingTable: '',
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: state.access }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const filters: [string, string, unknown][] = [];
  let offset = 0;
  const readField = (row: Record<string, any>, field: string): unknown => field.split('.').reduce((value: any, key) => value?.[key], row);
  const query: any = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(['eq', key, value]); return query; },
    is: (key: string, value: unknown) => { filters.push(['is', key, value]); return query; },
    in: (key: string, value: unknown[]) => { filters.push(['in', key, value]); return query; },
    or: (expression: string) => { filters.push(['or', '', expression]); return query; },
    order: () => query,
    range: (from: number) => { offset = from; return query; },
    then: (resolve: (value: unknown) => void) => {
      state.calls.push({ table, filters, from: offset });
      const rows = (state.tables[table] || []).filter(row => filters.every(([op, key, value]) => {
        if (op === 'or') return row.pool_organization_id == null || row.pool_organization_id === 'org';
        const field = readField(row, key);
        if (op === 'in') return (value as unknown[]).includes(field);
        if (op === 'is') return field == null;
        return field === value;
      }));
      // Simulate a database response cap below the requested page size.
      resolve(state.failingTable === table ? { data: null, error: { message: 'DB unavailable' } } : { data: rows.slice(offset, offset + 1), error: null });
    },
  };
  return query;
} }) }));

import handler from '../../api/company-payment-report';
const request = (method = 'GET', query = {}): VercelRequest => ({ method, headers: {}, query } as VercelRequest);
function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('company payment report API', () => {
  beforeEach(() => {
    state.access.mockReset().mockResolvedValue({ ok: true, access: { organizationId: 'org' } });
    state.calls.length = 0;
    state.tables = {};
    state.failingTable = '';
  });
  it.each([401, 403])('denies unauthorized or restricted access (%i) before reading financial data', async status => {
    state.access.mockResolvedValue({ ok: false, status, error: 'Denied' });
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(state.access).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'finance.view');
    expect(state.calls).toHaveLength(0);
  });
  it('uses only the authenticated tenant and reads every page without returning raw data', async () => {
    const student = { id: 's', organization_id: 'org', full_name: 'Mantas', payer_email: 'payer@example.test', payer_phone: '+37060000000' };
    state.tables.students = [student, { ...student, id: 'outsider', organization_id: 'other', full_name: 'Private name' }];
    const lesson = { id: 'l1', student_id: 's', tutor_id: 't', students: { organization_id: 'org' }, price: 20, paid: true,
      status: 'completed', start_time: '2026-09-01T09:00:00Z', end_time: '2026-09-01T10:00:00Z' };
    state.tables.sessions = [lesson, { ...lesson, id: 'l2' }, { ...lesson, id: 'other-lesson', students: { organization_id: 'other' }, price: 999 }];
    state.tables.profiles = [{ id: 't', full_name: 'Jonas' }];
    state.tables.platform_fee_ledger = [{ organization_id: 'other', source_type: 'session', source_id: 'l1', paid_at: '2026-09-01T12:00:00Z', base_amount: 999 }];
    const res = response();
    await handler(request('GET', { organizationId: 'other' }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    const result = res.json.mock.calls[0][0];
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ amount: 20, paidAt: null, payerPhone: '+37060000000' });
    expect(JSON.stringify(result)).not.toContain('Private name');
    expect(result.students).toBeUndefined();
    expect(state.calls.filter(call => call.table === 'sessions').map(call => call.from)).toEqual([0, 1, 2]);
    for (const table of ['students', 'sessions', 'lesson_packages', 'invoices', 'platform_fee_ledger']) {
      expect(state.calls.find(call => call.table === table)?.filters).toContainEqual(['eq', table === 'sessions' || table === 'lesson_packages' ? 'students.organization_id' : 'organization_id', 'org']);
    }
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('fails the complete report if one data source fails', async () => {
    state.failingTable = 'platform_fee_ledger';
    const res = response();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Payment report unavailable' });
    log.mockRestore();
  });
  it('rejects write methods', async () => {
    const res = response();
    await handler(request('POST'), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(state.access).not.toHaveBeenCalled();
  });
});
