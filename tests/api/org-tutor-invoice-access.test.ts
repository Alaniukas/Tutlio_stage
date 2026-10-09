import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'tutor' as string | null, admin: null as any,
  tables: {} as Record<string, any[]>, errorTable: '',
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  pdf: vi.fn(async () => new Uint8Array([1])),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId } : null }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.admin }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: async () => null }));
vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: (...args: any[]) => state.pdf(...args) }));
import list from '../../api/org-tutor-invoices';
import pdf from '../../api/invoice-pdf';
import remove from '../../api/delete-invoice';
import generate from '../../api/generate-invoice';

function db(): any {
  return {
    storage: { from: () => ({ upload: async () => ({}), remove: async () => ({}), download: async () => ({}) }) },
    from(table: string) {
      const request = { table, filters: [] as Array<[string, unknown]> };
      state.queries.push(request);
      const predicates: Array<(row: any) => boolean> = [];
      let offset = 0, maximum = Infinity;
      const value = (row: any, key: string) => key.split(/\.|->>/).reduce((item, part) => item?.[part], row);
      const result = () => ({ data: (state.tables[table] || []).filter(row => predicates.every(p => p(row))).slice(offset, maximum),
        error: state.errorTable === table ? { message: 'Private database error' } : null });
      const q: any = {
        select: () => q, order: () => q, limit: () => q,
        range: (from: number, to: number) => { offset = from; maximum = to + 1; return q; },
        eq: (key: string, expected: unknown) => { request.filters.push([key, expected]); predicates.push(row => value(row,key) === expected); return q; },
        neq: (key: string, expected: unknown) => { predicates.push(row => value(row,key) !== expected); return q; },
        in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(value(row,key))); return q; },
        gte: (key: string, minimum: string) => { predicates.push(row => value(row,key) >= minimum); return q; },
        lte: (key: string, maximum: string) => { predicates.push(row => value(row,key) <= maximum); return q; },
        update: () => q, delete: () => q,
        maybeSingle: async () => ({ ...result(), data: result().data[0] || null }),
        single: async () => ({ ...result(), data: result().data[0] || null }),
        then: (resolve: any) => Promise.resolve(result()).then(resolve),
      };
      return q;
    },
  };
}
function response(): any {
  return { code: 0, body: null, headers: {} as Record<string,string>,
    status(code: number) { this.code=code; return this; },
    json(body: unknown) { this.body=body; return this; },
    send(body: unknown) { this.body=body; return this; },
    setHeader(key: string,value: string) { this.headers[key]=value; },
  };
}
const invoice = (id: string, issuer = 'tutor', meta: unknown = null) => ({
  id, invoice_number: id, organization_id: 'org', issued_by_user_id: issuer,
  buyer_snapshot: { name: meta ? 'Organization' : 'Ruste' }, seller_snapshot: { name: 'Teacher' },
  issue_date: '2026-08-26', status: 'issued', total_amount: 10.40, pdf_meta: meta,
  period_start: '2026-08-01', period_end: '2026-08-31',
});
beforeEach(() => {
  state.userId='tutor'; state.admin=null; state.errorTable=''; state.queries=[]; state.pdf.mockClear();
  state.tables={ profiles: [{ id: 'tutor', organization_id: 'org' }], invoices: [
    invoice('automatic-customer'), invoice('related-customer','admin'),
    invoice('own-pay','tutor',{ invoiceKind:'tutor_pay',tutorId:'tutor' }),
    invoice('admin-issued-own-pay','admin',{ invoiceKind:'tutor_pay',tutorId:'tutor' }),
    invoice('other-pay','other',{ invoiceKind:'tutor_pay',tutorId:'other' }),
  ], invoice_line_items: [{ invoice_id:'related-customer',session_ids:['own-lesson'] }],
  sessions: [{ id:'own-lesson',tutor_id:'tutor' }] };
  vi.spyOn(console,'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('organization tutor invoice confidentiality', () => {
  it.each([
    ['b0a00000-7e57-4000-8000-000000000001', 'company'],
    ['d1000000-0000-4000-8000-000000000001', 'company'],
    ['d2000000-0000-4000-8000-000000000001', 'school'],
  ])('enforces the same privacy rule for organization %s (%s), without feature flags', async (organizationId, entityType) => {
    state.tables.profiles[0].organization_id = organizationId;
    state.tables.organizations = [{ id: organizationId, entity_type: entityType, features: {} }];
    state.tables.invoices = state.tables.invoices.map(row => ({ ...row, organization_id: organizationId }));
    const res = response(); await list({ method: 'GET', query: {} } as any, res);
    expect(res.code).toBe(200);
    expect(res.body.invoices.map((row: any) => row.id)).toEqual(['own-pay','admin-issued-own-pay']);
    for (const invoiceId of ['automatic-customer','related-customer','other-pay']) {
      const denied = response(); await pdf({ method:'GET',query:{ id: invoiceId } } as any,denied);
      expect(denied.code).toBe(403);
    }
    const ownPdf = response(); await pdf({ method:'GET',query:{ id:'own-pay' } } as any,ownPdf);
    expect(ownPdf.code).toBe(200);
    const deletion = response(); await remove({ method:'POST',body:{ invoiceId:'automatic-customer' } } as any,deletion);
    expect(deletion.code).toBe(403);
    const generation = response();
    await generate({ method:'POST',body:{ tutorId:'tutor',periodStart:'2026-09-01',periodEnd:'2026-09-30',
      groupingType:'single',isOrgTutor:false,precheckOnly:true } } as any,generation);
    expect(generation.code).toBe(403);
  });
  it.each([{}, { periodStart:'2026-08-01',periodEnd:'2026-08-31',tutorId:'other' }])('lists only own pay and never client invoices, including automatic billing (%j)', async query => {
    const res=response(); await list({ method:'GET',query } as any,res);
    expect(res.code).toBe(200);
    expect(res.body.invoices.map((i: any) => i.id)).toEqual(['own-pay','admin-issued-own-pay']);
    expect(res.body.periodInvoices).toEqual(res.body.invoices);
    expect(JSON.stringify(res.body)).not.toContain('Ruste');
    expect(state.queries.find(q => q.table==='invoices')?.filters).toContainEqual(['pdf_meta->>tutorId','tutor']);
    expect(state.queries.some(q => q.table==='sessions' || q.table==='invoice_line_items')).toBe(false);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
  it.each(['profiles','invoices'])('fails closed when %s cannot be read', async table => {
    state.errorTable=table; const res=response(); await list({ method:'GET',query:{} } as any,res);
    expect(res.code).toBe(503); expect(JSON.stringify(res.body)).not.toContain('Private database error');
  });
  it('requires an authenticated user', async () => {
    state.userId=null; const res=response(); await list({ method:'GET',query:{} } as any,res);
    expect(res.code).toBe(401); expect(state.queries).toEqual([]);
  });
  it.each(['automatic-customer','related-customer','other-pay'])('denies the direct PDF of %s', async id => {
    const res=response(); await pdf({ method:'GET',query:{ id } } as any,res);
    expect(res.code).toBe(403); expect(state.pdf).not.toHaveBeenCalled();
    expect(state.queries.some(q => q.table==='invoice_line_items')).toBe(false);
  });
  it.each(['own-pay','admin-issued-own-pay'])('allows the direct PDF of %s', async id => {
    const res=response(); await pdf({ method:'GET',query:{ id } } as any,res);
    expect(res.code).toBe(200); expect(state.pdf).toHaveBeenCalledOnce();
  });
  it('regenerates a corrected Pro Klasė PDF with the stored tutor series instead of serving the old file', async () => {
    const organizationId = 'b0a00000-7e57-4000-8000-000000000001';
    state.tables.profiles[0].organization_id = organizationId;
    state.tables.organizations = [{ id: organizationId, name: 'Organization', entity_type: 'company' }];
    state.tables.invoices = [{ ...invoice('own-pay', 'admin', { invoiceKind: 'tutor_pay', tutorId: 'tutor' }),
      organization_id: organizationId, invoice_number: 'DOMSMA-001', pdf_storage_path: 'previous-number.pdf' }];
    const res = response(); await pdf({ method: 'GET', query: { id: 'own-pay' } } as any, res);
    expect(res.code).toBe(200);
    expect(state.pdf.mock.calls[0][0]).toMatchObject({ invoiceNumber: 'DOMSMA-001', totalAmount: 10.40 });
    expect(res.headers['Content-Disposition']).toContain('DOMSMA-001');
  });
  it('keeps customer PDFs available to the authorized organization admin', async () => {
    state.admin={ organizationId:'org',role:'owner',permissions:{} };
    const res=response(); await pdf({ method:'GET',query:{ id:'related-customer' } } as any,res);
    expect(res.code).toBe(200);
  });
  it('denies a foreign organization admin even if they issued the customer invoice', async () => {
    state.admin={ organizationId:'other-org',role:'owner',permissions:{} };
    const res=response(); await pdf({ method:'GET',query:{ id:'automatic-customer' } } as any,res);
    expect(res.code).toBe(403);
  });
  it('does not allow the nominal issuer to delete an automatic customer invoice', async () => {
    const res=response(); await remove({ method:'POST',body:{ invoiceId:'automatic-customer' } } as any,res);
    expect(res.code).toBe(403); expect(state.queries.map(q => q.table)).toEqual(['invoices']);
  });
  it('does not expand deletion rights to remuneration issued by an admin on behalf of the tutor', async () => {
    const res=response(); await remove({ method:'POST',body:{ invoiceId:'admin-issued-own-pay' } } as any,res);
    expect(res.code).toBe(403);
  });
  it('does not let an organization tutor switch the generator to customer billing', async () => {
    const res=response();
    await generate({ method:'POST',body:{ tutorId:'tutor',periodStart:'2026-09-01',periodEnd:'2026-09-30',
      groupingType:'single',isOrgTutor:false,precheckOnly:true } } as any,res);
    expect(res.code).toBe(403);
    expect(state.queries.some(q => q.table==='sessions' || q.table==='invoices')).toBe(false);
  });
  it('ignores Pro Klasė customer invoices during the tutor-pay duplicate check', async () => {
    const org='b0a00000-7e57-4000-8000-000000000001';
    state.tables.profiles=[{ id:'tutor',organization_id:org,full_name:'Tutor',company_commission_percent:20 }];
    state.tables.organizations=[{ id:org,name:'Pro Klasė QA',entity_type:'company' }];
    state.tables.invoices=[{ ...invoice('CUSTOMER-SF'),organization_id:org,period_start:'2026-09-01',period_end:'2026-09-30' }];
    state.tables.invoice_line_items=[{ invoice_id:'CUSTOMER-SF',session_ids:['lesson'] }];
    state.tables.sessions=[{ id:'lesson',tutor_id:'tutor',status:'completed',status_confirmed_at:'2026-09-15T11:01:00Z',
      start_time:'2026-09-15T10:00:00Z',end_time:'2026-09-15T11:00:00Z',price:40,
      subjects:{ is_trial:false },students:{ full_name:'Ruste', organization_id: org } }];
    const body={ tutorId:'tutor',periodStart:'2026-09-01',periodEnd:'2026-09-30',groupingType:'single',isOrgTutor:true,precheckOnly:true };
    const res=response(); await generate({ method:'POST',body } as any,res);
    expect(res.body).toMatchObject({ canGenerate:true });
    expect(JSON.stringify(res.body)).not.toContain('CUSTOMER-SF');
    expect(JSON.stringify(res.body)).not.toContain('Ruste');
    state.tables.invoices.push({ ...invoice('MY-PAY','admin',{ invoiceKind:'tutor_pay',tutorId:'tutor' }),
      organization_id:org,period_start:'2026-09-01',period_end:'2026-09-30',total_amount:20 });
    state.tables.invoice_line_items.push({ invoice_id:'MY-PAY',session_ids:['lesson'] });
    const duplicate=response(); await generate({ method:'POST',body } as any,duplicate);
    expect(duplicate.body).toMatchObject({ canGenerate:false,reason:'duplicate',invoiceNumbers:['MY-PAY'],totalAmount:20 });
    expect(JSON.stringify(duplicate.body)).not.toContain('CUSTOMER-SF');
  });
});
