import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  from: vi.fn(), create: vi.fn(), fetch: vi.fn(), download: vi.fn(),
  entityType: 'company', invoiceNumber: null as string | null, pdfPath: 'invoice.pdf' as string | null,
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: mock.from, storage: { from: () => ({ download: mock.download }) },
}) }));
vi.mock('stripe', () => ({ default: class {
  checkout = { sessions: { create: mock.create } };
} }));
vi.mock('../../api/_lib/auth.js', () => ({
  verifyRequestAuth: async () => ({ isInternal: false, userId: 'tutor-1' }),
}));

import handler from '../../api/create-package-checkout';

beforeEach(() => {
  vi.clearAllMocks();
  mock.entityType = 'company';
  mock.invoiceNumber = null;
  mock.pdfPath = 'invoice.pdf';
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test');
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service_test');
  vi.stubEnv('APP_URL', 'https://tutlio.test');
  mock.from.mockImplementation((table: string) => {
    const result = () => ({ data:
      table === 'profiles' ? { id: 'tutor-1', full_name: 'Tutor', organization_id: 'org-other' }
        : table === 'students' ? { id: 'student-1', full_name: 'Vaikas', payer_name: 'Mokėtojas', payer_email: 'parent@example.test' }
        : table === 'organizations' ? { name: 'Kita organizacija', stripe_account_id: 'acct_other', stripe_onboarding_complete: true, entity_type: mock.entityType, features: {} }
        : table === 'subjects' ? [{ id: 'subject-1', tutor_id: 'tutor-1', name: 'Matematika', price: 20 }]
        : table === 'lesson_packages' ? { id: 'package-1' }
        : table === 'invoices' ? { invoice_number: mock.invoiceNumber, pdf_storage_path: mock.pdfPath }
        : [], error: null });
    const q: any = {
      select: () => q, eq: () => q, in: () => q, insert: () => q, update: () => q,
      single: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    };
    return q;
  });
  mock.create.mockResolvedValue({ id: 'cs_package', url: 'https://checkout.stripe.test/package' });
  mock.download.mockResolvedValue({ data: { arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer }, error: null });
  mock.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith('/api/generate-invoice')) {
      mock.invoiceNumber = 'ORG-42';
      return { ok: true, json: async () => ({ invoiceIds: ['invoice-1'] }) };
    }
    return { ok: true, status: 200 };
  });
  vi.stubGlobal('fetch', mock.fetch);
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function createPackage(body: Record<string, unknown> = {}) {
  const res: any = { statusCode: 0, body: null, setHeader: vi.fn(),
    status(code: number) { res.statusCode = code; return res; },
    send(value: string) { res.body = JSON.parse(value); return res; },
  };
  await handler({ method: 'POST', headers: { host: 'tutlio.lt' }, body: {
    tutorId: 'tutor-1', studentId: 'student-1', items: [{ subjectId: 'subject-1', totalLessons: 3 }], ...body,
  } } as any, res);
  expect(res.statusCode).toBe(200);
  return mock.create.mock.calls[0][0];
}

describe('package Checkout reporting at creation', () => {
  it.each(['company', 'school'])('issues the S.F. before creating a %s payment', async (entityType) => {
    mock.entityType = entityType;
    const payload = await createPackage();
    expect(mock.fetch.mock.invocationCallOrder[0]).toBeLessThan(mock.create.mock.invocationCallOrder[0]);
    expect(payload.payment_intent_data.description).toBe('ORG-42 · Mokėtojas');
    expect(payload.payment_intent_data.metadata).toMatchObject({
      tutlio_package_id: 'package-1', tutor_id: 'tutor-1', invoice_number: 'ORG-42', payer_name: 'Mokėtojas',
    });
    expect(payload.metadata).toMatchObject(payload.payment_intent_data.metadata);
    expect(mock.create.mock.calls[0][1]).toEqual({ stripeAccount: 'acct_other' });
  });

  it('includes an issued invoice number even if its PDF is unavailable', async () => {
    mock.pdfPath = null;
    const payload = await createPackage();
    expect(payload.payment_intent_data.description).toBe('ORG-42 · Mokėtojas');
    expect(payload.metadata.invoice_number).toBe('ORG-42');
  });

  it('includes the payer without inventing an S.F. number when issuing is disabled', async () => {
    const payload = await createPackage({ attachSalesInvoice: false });
    expect(payload.payment_intent_data.description).toBe('Mokėtojas');
    expect(payload.payment_intent_data.metadata.payer_name).toBe('Mokėtojas');
    expect(payload.metadata.invoice_number).toBeUndefined();
    expect(mock.fetch.mock.calls.some(([url]) => url.endsWith('/api/generate-invoice'))).toBe(false);
  });
});
