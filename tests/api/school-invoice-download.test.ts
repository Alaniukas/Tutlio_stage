import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: 'admin' as string | null,
  admin: { organizationId: 'org', role: 'owner', permissions: {} } as any,
  invoice: {} as any,
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  bucket: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  storage: { from: (bucket: string) => { state.bucket(bucket); return { download: state.download }; } },
  from: (table: string) => {
    const request = { table, filters: [] as Array<[string, unknown]> };
    state.queries.push(request);
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => { request.filters.push([column, value]); return query; },
      single: async () => ({ data: request.filters.every(([column, value]) => state.invoice[column] === value) ? state.invoice : null, error: null }),
    };
    return query;
  },
}) }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId } : null }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: async () => state.admin }));
vi.mock('../../api/_lib/invoiceBranding.js', () => ({ resolveInvoiceBranding: vi.fn() }));
vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: vi.fn() }));
import handler from '../../api/invoice-pdf';

function response(): any {
  return { code: 0, body: null, headers: {} as Record<string, string>,
    status(code: number) { this.code = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    setHeader(key: string, value: string) { this.headers[key] = value; },
  };
}
const request = () => ({ method: 'GET', query: { id: 'payer-invoice', source: 'school_monthly' } }) as any;
beforeEach(() => {
  state.userId = 'admin'; state.admin = { organizationId: 'org', role: 'owner', permissions: {} };
  state.queries = []; state.bucket.mockClear(); state.download.mockReset();
  state.invoice = { id: 'payer-invoice', organization_id: 'org', invoice_number: 'PAM-49',
    created_at: '2026-10-04T09:00:00Z', pdf_path: 'school-monthly/org/payer-invoice.pdf' };
  state.download.mockResolvedValue({ data: { arrayBuffer: async () => new TextEncoder().encode('%PDF-original').buffer }, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('school payer invoice PDF download', () => {
  it('serves the original stored PDF only within the finance administrator organization', async () => {
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('%PDF-original');
    expect(res.headers).toMatchObject({ 'Cache-Control': 'private, no-store', 'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="PAM-49.pdf"' });
    expect(state.queries).toEqual([{ table: 'school_monthly_invoices', filters: [
      ['id', 'payer-invoice'], ['organization_id', 'org'],
    ] }]);
    expect(state.bucket).toHaveBeenCalledWith('invoices');
    expect(state.download).toHaveBeenCalledWith('school-monthly/org/payer-invoice.pdf');
  });

  it('allows accountants with finance access', async () => {
    state.admin = { organizationId: 'org', role: 'accountant', permissions: {} };
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(200);
  });

  it.each([
    ['a tutor', null],
    ['an administrator without finance access', { organizationId: 'org', role: 'custom', permissions: { 'students.view': true } }],
  ])('denies %s before reading payer invoice records', async (_label, admin) => {
    state.admin = admin;
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(403);
    expect(state.queries).toEqual([]);
    expect(state.download).not.toHaveBeenCalled();
  });

  it('does not expose an invoice or its PDF to another organization administrator', async () => {
    state.admin.organizationId = 'other';
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(404);
    expect(state.download).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    state.userId = null;
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(401);
    expect(state.queries).toEqual([]);
  });

  it('downloads an existing canonical PDF when the invoice row lost its file path', async () => {
    state.invoice.pdf_path = null;
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('%PDF-original');
    expect(state.download).toHaveBeenCalledWith('school-monthly/org/payer-invoice.pdf');
  });

  it('returns an unavailable PDF error when neither a file path nor a canonical file exists', async () => {
    state.invoice.pdf_path = null;
    state.download.mockResolvedValue({ data: null, error: { message: 'Missing stored PDF' } });
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(404);
    expect(state.download).toHaveBeenCalledWith('school-monthly/org/payer-invoice.pdf');
  });

  it('does not download an unnumbered invoice', async () => {
    state.invoice.invoice_number = null;
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(404);
    expect(state.download).not.toHaveBeenCalled();
  });

  it('does not replace an unavailable original with a freshly generated invoice', async () => {
    state.download.mockResolvedValue({ data: null, error: { message: 'Missing stored PDF' } });
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(404);
    expect(res.body).toEqual({ error: 'Invoice PDF not available' });
  });
});
