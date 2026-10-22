import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSchoolPaymentsData } from '@/hooks/useSchoolPaymentsData';
import { getCached, invalidateCache, setCache } from '@/lib/dataCache';
import { buildSchoolFinanceRows, summarizeSchoolFinanceRows } from '@/lib/schoolFinanceExport';

const state = vi.hoisted(() => ({
  from: vi.fn(), contracts: [] as any[], installments: [] as any[], requests: [] as any[], failAt: -1,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...args: any[]) => state.from(...args) } }));
vi.mock('@/lib/authSession', () => ({ resolveAuthUser: async () => ({ id: 'admin' }) }));

function queryFor(table: string) {
  const filters: Array<[string, string, any]> = [];
  let offset = 0;
  const query: any = {
    select: () => query,
    order: () => query,
    eq: (key: string, value: any) => { filters.push(['eq', key, value]); return query; },
    is: (key: string, value: any) => { filters.push(['is', key, value]); return query; },
    in: (key: string, value: any) => { filters.push(['in', key, value]); return query; },
    or: () => { filters.push(['family', 'party_kind', null]); return query; },
    range: (from: number) => { offset = from; return query; },
    maybeSingle: async () => ({ data: table === 'organization_admins'
      ? { organization_id: 'school' } : { name: 'Demo school', features: {} }, error: null }),
    then: (resolve: (value: unknown) => void) => {
      state.requests.push({ table, filters: [...filters], offset });
      if (table === 'school_payment_installments' && offset === state.failAt) {
        return Promise.resolve({ data: null, error: { message: 'History unavailable' } }).then(resolve);
      }
      const source = table === 'school_contracts' ? state.contracts : state.installments;
      const rows = source.filter(row => filters.every(([op, key, value]) => {
        const field = key.split('.').reduce((object, part) => object?.[part], row);
        if (op === 'family') return field == null || field === 'student';
        if (op === 'in') return value.includes(field);
        return value === null ? field == null : field === value;
      }));
      // Emulate a server cap below fetchAllRows' requested page size.
      return Promise.resolve({ data: rows.slice(offset, offset + 2), error: null }).then(resolve);
    },
  };
  return query;
}

beforeEach(() => {
  invalidateCache();
  state.requests = [];
  state.failAt = -1;
  state.from.mockReset().mockImplementation(queryFor);
  state.contracts = [
    { id: 'current', signing_status: 'signed', annual_fee: 300 },
    { id: 'current-no-schedule', signing_status: 'signed', annual_fee: 0 },
    { id: 'archived-300', signing_status: 'signed', archived_at: '2026-09-04' },
    { id: 'archived-50-a', signing_status: 'sent', archived_at: '2026-07-29' },
    { id: 'archived-50-b', signing_status: 'sent', archived_at: '2026-07-28' },
    { id: 'archived-no-schedule', signing_status: 'signed', archived_at: '2026-08-01' },
    { id: 'draft', signing_status: 'sent' },
    { id: 'foreign', signing_status: 'signed', organization_id: 'another-school' },
    { id: 'staff', signing_status: 'signed', staff_document_type: 'consent' },
    { id: 'teacher', signing_status: 'signed', party_kind: 'teacher' },
  ].map(row => ({ organization_id: 'school', student_id: `student-${row.id}`, annual_fee: 1000, ...row }));
  const installment = (id: string, contractId: string, amount: number, payment_status = 'paid') => ({
    id, contract_id: contractId, amount, payment_status, installment_number: 1,
    due_date: '2026-08-01', paid_at: '2026-07-28', stripe_payment_intent_id: 'pi_paid',
    contract: state.contracts.find(row => row.id === contractId),
  });
  state.installments = [
    installment('current-paid', 'current', 100),
    installment('current-pending', 'current', 200, 'pending'),
    installment('receipt-300', 'archived-300', 300),
    installment('receipt-50-a', 'archived-50-a', 50),
    installment('receipt-50-b', 'archived-50-b', 50),
    installment('archived-unpaid', 'archived-300', 666, 'overdue'),
    installment('draft-unpaid', 'draft', 123, 'pending'),
    installment('foreign-receipt', 'foreign', 9999),
    installment('staff-receipt', 'staff', 9999),
    installment('teacher-receipt', 'teacher', 9999),
  ];
});
afterEach(() => { cleanup(); invalidateCache(); vi.restoreAllMocks(); });

describe('school payment history', () => {
  it('loads all historical receipt pages without archived debt or other organizations and staff', async () => {
    const { result } = renderHook(() => useSchoolPaymentsData({ includePaidHistory: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.contracts.map(row => row.id)).toEqual(['current', 'current-no-schedule']);
    expect(result.current.installments.map(row => row.id)).toEqual([
      'current-paid', 'current-pending', 'receipt-300', 'receipt-50-a', 'receipt-50-b',
    ]);
    const summary = summarizeSchoolFinanceRows(buildSchoolFinanceRows(result.current.contracts, result.current.installments));
    expect(summary.totalPaid).toBe(500);
    expect(summary.totalOutstanding).toBe(200);
    expect(summary.contractsWithoutSchedule).toBe(1);
    for (const table of ['school_contracts', 'school_payment_installments']) {
      expect(state.requests.filter(request => request.table === table).some(request => request.offset >= 4)).toBe(true);
    }
    expect(state.requests.filter(request => request.table === 'school_payment_installments')
      .every(request => request.filters.some(([, key, value]: any[]) => key === 'contract.organization_id' && value === 'school'))).toBe(true);
  });

  it('keeps history out of actionable payments and uses a separate cache', async () => {
    setCache('company_payments:history', { installments: [state.installments[2]] });
    const { result } = renderHook(() => useSchoolPaymentsData());
    expect(result.current.installments).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.installments.map(row => row.id)).toEqual(['current-paid', 'current-pending']);
    expect(getCached<any>('company_payments')?.installments).toHaveLength(2);
    expect(getCached<any>('company_payments:history')?.installments).toHaveLength(1);
  });

  it('does not mistake the actionable-payments cache for the complete report', async () => {
    setCache('company_payments', { installments: [state.installments[0]] });
    const { result } = renderHook(() => useSchoolPaymentsData({ includePaidHistory: true }));
    expect(result.current.loading).toBe(true);
    expect(result.current.installments).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.installments.filter(row => row.contract?.archived_at)).toHaveLength(3);
  });

  it('reports a failed history page instead of caching partial financial totals', async () => {
    state.failAt = 2;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSchoolPaymentsData({ includePaidHistory: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.installments).toEqual([]);
    expect(getCached('company_payments:history')).toBeNull();
  });
});
