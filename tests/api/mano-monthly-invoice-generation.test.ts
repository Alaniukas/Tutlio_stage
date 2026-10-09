import { validateHeaderValue } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MANO_KOREPETITORIUS_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  writes: [] as Array<{ table: string; action: string; value?: any }>,
  invoiceError: null as null | { code: string; message: string },
  allocate: vi.fn(async (db: unknown, profileId: string) => profileId === 'organization' ? 'MK-1685' : 'SF-002'),
  pdf: vi.fn(async (data: any) => new Uint8Array([37, 80, 68, 70])),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeDb() }));
vi.mock('../../api/_lib/auth.js', () => ({
  verifyRequestAuth: async () => ({ isInternal: true, userId: 'admin' }),
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: async () => ({
    organizationId: state.tables.profiles[0].organization_id, role: 'owner', permissions: {},
  }),
}));
vi.mock('../../api/_lib/invoiceNumber.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/_lib/invoiceNumber.js')>(),
  allocateInvoiceNumber: (...args: [unknown, string]) => state.allocate(...args),
}));
vi.mock('../../api/_lib/invoicePdf.js', () => ({
  generateInvoicePdf: (data: any) => state.pdf(data),
}));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
import generate from '../../api/generate-invoice';
import download from '../../api/invoice-pdf';

function fakeDb(): any {
  return {
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    from(table: string) {
      const predicates: Array<(row: any) => boolean> = [];
      let action = 'read', value: any, first = 0, last = Infinity;
      const column = (row: any, key: string) => key.includes('->>')
        ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key];
      const result = () => {
        let data: any = (state.tables[table] || []).filter(row => predicates.every(p => p(row))).slice(first, last);
        if (action === 'insert') {
          data = table === 'invoices' ? { id: 'new-invoice', ...value } : null;
          if (!state.invoiceError) {
            state.tables[table].push(...(Array.isArray(value) ? value : [data]));
          }
        }
        if (action === 'update') {
          for (const row of data) Object.assign(row, value);
        }
        return { data, error: action === 'insert' && table === 'invoices' ? state.invoiceError : null };
      };
      const q: any = {
        select: () => q, order: () => q,
        range: (from: number, to: number) => { first = from; last = to + 1; return q; },
        eq: (key: string, v: unknown) => { predicates.push(row => column(row, key) === v); return q; },
        is: (key: string, v: unknown) => { predicates.push(row => column(row, key) === v); return q; },
        neq: (key: string, v: unknown) => { predicates.push(row => column(row, key) !== v); return q; },
        in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(column(row, key))); return q; },
        overlaps: (key: string, values: unknown[]) => {
          predicates.push(row => (column(row, key) || []).some((v: unknown) => values.includes(v))); return q;
        },
        gte: () => q, lte: () => q,
        insert: (v: any) => { action = 'insert'; value = v; state.writes.push({ table, action, value }); return q; },
        update: (v: any) => { action = 'update'; value = v; state.writes.push({ table, action, value }); return q; },
        single: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
        maybeSingle: async () => { const r = result(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return q;
    },
  };
}

function response(): any {
  return { code: 200, body: null, headers: {} as Record<string, string>,
    status(code: number) { this.code = code; return this; },
    json(value: any) { this.body = value; return this; },
    send(value: any) { this.body = value; return this; },
    setHeader(key: string, value: string) { validateHeaderValue(key, value); this.headers[key] = value; },
  };
}

async function request(body: any = {}) {
  const res = response();
  await generate({ method: 'POST', body: { tutorId: 'tutor', issuedByUserId: 'admin',
    periodStart: '2026-09-01', periodEnd: '2026-09-30', groupingType: 'single', isOrgTutor: true,
    ...body } } as any, res);
  return res;
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T09:00:00Z'));
  state.writes = []; state.invoiceError = null; state.allocate.mockClear(); state.pdf.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  state.tables = {
    profiles: [{ id: 'tutor', full_name: 'Eva Jautakytė', organization_id: MANO_KOREPETITORIUS_ORG_ID,
      company_commission_percent: 17 }],
    organizations: [{ id: MANO_KOREPETITORIUS_ORG_ID, entity_type: 'company',
      name: 'Mano Korepetitorius', features: { pvm_education_invoice: true } }],
    invoice_profiles: [
      { id: 'personal', user_id: 'tutor', entity_type: 'individual', activity_number: '123' },
      { id: 'organization', organization_id: MANO_KOREPETITORIUS_ORG_ID, entity_type: 'mb',
        business_name: 'MB Mano Korepetitorius', company_code: '456', address: 'Vilnius',
        contact_email: 'info@example.test' },
    ],
    sessions: [{ id: 'lesson', tutor_id: 'tutor', student_id: 'student', subject_id: 'math',
      status: 'completed', price: 30, start_time: '2026-09-19T08:00:00Z', end_time: '2026-09-19T09:00:00Z',
      students: { id: 'student', full_name: 'Example Child', payer_email: 'parent@example.test',
        organization_id: MANO_KOREPETITORIUS_ORG_ID }, subjects: { name: 'Matematika', is_trial: false } }],
    invoices: [], invoice_line_items: [],
  };
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('MK monthly invoice issue date, number and download', () => {
  it('stores the service-month date and name/month number in both the tutor invoice and PDF', async () => {
    const res = await request();
    expect(res.body).toMatchObject({ success: true, invoiceIds: ['new-invoice'] });
    expect(state.tables.invoices[0]).toMatchObject({ invoice_number: 'EVAJAU-202609',
      issue_date: '2026-09-30', total_amount: 17, seller_user_id: 'tutor',
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'tutor' } });
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({
      invoiceNumberLabel: 'Serija EVAJAU Nr. 202609', issueDate: '2026-09-30', totalAmount: 17,
    }));
    expect(state.allocate).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-10-20T09:00:00Z'));
    const pdf = response();
    await download({ method: 'GET', query: { id: 'new-invoice' } } as any, pdf);
    expect(pdf.code).toBe(200);
    expect(pdf.headers['Content-Disposition']).toBe('attachment; filename="EVAJAU (202609).pdf"');
    expect(state.pdf.mock.calls.at(-1)?.[0].issueDate).toBe('2026-09-30');
  });

  it('dates customer invoices at month end while preserving their MK sequence', async () => {
    const res = await request({ isOrgTutor: false });
    expect(res.body).toMatchObject({ success: true });
    expect(state.tables.invoices[0]).toMatchObject({
      invoice_number: 'MK-1685', issue_date: '2026-09-30', total_amount: 30,
    });
    expect(state.allocate).toHaveBeenCalledWith(expect.anything(), 'organization');
    expect(state.pdf.mock.calls[0][0].issueDate).toBe('2026-09-30');
    const pdf = response();
    await download({ method: 'GET', query: { id: 'new-invoice' } } as any, pdf);
    expect(pdf.code).toBe(200);
    expect(pdf.headers['Content-Disposition']).toContain('MK Nr. 1685 (2026-09-30).pdf');
  });

  it('downloads names with Lithuanian initials using a valid HTTP header', async () => {
    state.tables.profiles[0].full_name = 'Pijus Oželis';
    await request();
    const pdf = response();
    await download({ method: 'GET', query: { id: 'new-invoice' } } as any, pdf);
    expect(pdf.code).toBe(200);
    expect(pdf.headers['Content-Disposition']).toContain('filename*=UTF-8');
    expect(state.pdf.mock.calls.at(-1)?.[0].invoiceNumberLabel).toBe('Serija PIJOŽE Nr. 202609');
  });

  it('keeps a same-day prepaid package on its advance-invoice date', async () => {
    state.tables.lesson_packages = [{
      id: 'package', tutor_id: 'tutor', student_id: 'student', subject_id: 'math',
      paid: true, payment_method: 'manual', manual_sales_invoice_id: null,
      total_lessons: 4, total_price: 120, paid_at: '2026-10-08T09:00:00Z',
      students: state.tables.sessions[0].students, subjects: { name: 'Matematika' },
    }];
    const res = await request({ isOrgTutor: false, periodStart: '2026-10-08', periodEnd: '2026-10-08',
      packageIds: ['package'] });
    expect(res.body).toMatchObject({ success: true });
    expect(state.tables.invoices[0]).toMatchObject({
      invoice_number: 'MK-1685', issue_date: '2026-10-08', total_amount: 120,
    });
  });

  it('keeps other organizations numbering and generation date', async () => {
    for (const table of ['profiles', 'organizations', 'invoice_profiles']) {
      for (const row of state.tables[table]) {
        if (row.organization_id) row.organization_id = 'other-org';
        if (table === 'organizations') row.id = 'other-org';
      }
    }
    await request();
    expect(state.tables.invoices[0]).toMatchObject({ invoice_number: 'SF-002', issue_date: '2026-10-08' });
    expect(state.allocate).toHaveBeenCalledWith(expect.anything(), 'personal');
  });

  it('rejects a tutor period spanning two months before writing invoices', async () => {
    const res = await request({ periodStart: '2026-08-31' });
    expect(res.code).toBe(400);
    expect(state.writes).toEqual([]);
    expect(state.allocate).not.toHaveBeenCalled();
  });

  it('reports a duplicate monthly number without consuming a sequential number', async () => {
    state.invoiceError = { code: '23505', message: 'duplicate seller invoice number' };
    const res = await request();
    expect(res.code).toBe(409);
    expect(state.allocate).not.toHaveBeenCalled();
    expect(state.pdf).not.toHaveBeenCalled();
  });
});
