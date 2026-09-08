import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensurePaidTrialInvoice, ensurePaidTrialPackageInvoice } from '../../api/_lib/paidTrialInvoice';
import { PRO_KLASE_QA_ORG_ID } from '../../api/_lib/marketMoney';

const mocks = vi.hoisted(() => ({ pdf: vi.fn(), send: vi.fn() }));
vi.mock('../../api/_lib/invoicePdf', () => ({ generateInvoicePdf: mocks.pdf }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));

function database(overrides: Record<string, any> = {}) {
  const lesson = { paid: true, price: 15, total_price: 15.48, tutor_id: 'tutor', subjects: { is_trial: true },
    students: { full_name: 'Vaikas', payer_name: 'Mama', payer_email: 'payer@example.test' },
    profiles: { organization_id: PRO_KLASE_QA_ORG_ID }, ...overrides };
  const invoice = { id: 'invoice', invoice_number: 'PK-001', issue_date: '2026-09-07', total_amount: 15,
    seller_snapshot: { name: 'Pro klasė', entityType: 'mb' }, buyer_snapshot: { name: 'Mama', email: 'payer@example.test' },
    invoice_line_items: [{ description: 'Bandomoji', quantity: 1, unit_price: 15, total_price: 15 }], payer_email_sent_at: null };
  const updates: any[] = [];
  const rpc = vi.fn().mockResolvedValue({ data: 'invoice', error: null });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const download = vi.fn().mockResolvedValue({ data: { arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer }, error: null });
  const db: any = { rpc, storage: { from: () => ({ upload, download }) }, from(table: string) {
    let mutation: any;
    const result = () => ({ data: mutation ? null : table === 'sessions' || table === 'lesson_packages' ? lesson : table === 'invoice_profiles'
      ? { business_name: 'Pro klasė', entity_type: 'mb' } : invoice, error: null });
    const q: any = { select: () => q, eq: () => q, single: async () => result(),
      update: (data: any) => { mutation = data; updates.push(data); Object.assign(invoice, data); return q; },
      then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject) };
    return q;
  } };
  return { db, rpc, upload, updates, invoice };
}

describe('paid trial invoice delivery', () => {
  it('uses the atomic package path for creation-time trial links and delivers only once', async () => {
    const { db, rpc } = database();
    mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    mocks.send.mockResolvedValue({ error: null });
    expect(await ensurePaidTrialPackageInvoice(db, 'package')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('issue_paid_trial_package_invoice', expect.objectContaining({ p_package_id: 'package' }));
    await ensurePaidTrialPackageInvoice(db, 'package');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('RESEND_API_KEY', 'test'); mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70])); mocks.send.mockResolvedValue({ error: null }); });
  it('atomically issues, stores and emails the PDF to the payer, then skips a delivered retry', async () => {
    const { db, rpc, upload, updates } = database();
    await ensurePaidTrialInvoice(db, 'lesson');
    expect(rpc).toHaveBeenCalledWith('issue_paid_trial_invoice', expect.objectContaining({ p_session_id: 'lesson', p_buyer: { name: 'Mama', email: 'payer@example.test' } }));
    expect(upload).toHaveBeenCalledWith('tutor/invoice.pdf', expect.any(Uint8Array), expect.objectContaining({ contentType: 'application/pdf' }));
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'payer@example.test', attachments: [expect.objectContaining({ filename: 'PK-001.pdf' })] }), { idempotencyKey: 'paid-trial-invoice/invoice' });
    expect(updates).toEqual([expect.objectContaining({ pdf_storage_path: 'tutor/invoice.pdf' }), expect.objectContaining({ payer_email_sent_at: expect.any(String) })]);
    await ensurePaidTrialInvoice(db, 'lesson');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it.each([{ paid: false }, { price: 0 }, { lesson_package_id: 'package' }, { subjects: { is_trial: false } }, { profiles: { organization_id: 'other' } }])('does not invoice ineligible lessons: %j', async (override) => {
    const { db, rpc } = database(override);
    await ensurePaidTrialInvoice(db, 'lesson');
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('retries delivery with the same idempotency key after an email error', async () => {
    const { db, invoice, updates } = database();
    mocks.send.mockResolvedValueOnce({ error: { message: 'temporary failure' } });
    await expect(ensurePaidTrialInvoice(db, 'lesson')).rejects.toThrow('temporary failure');
    expect(invoice.payer_email_sent_at).toBeNull();
    await ensurePaidTrialInvoice(db, 'lesson');
    expect(mocks.send.mock.calls[0][1]).toEqual(mocks.send.mock.calls[1][1]);
    expect(mocks.send.mock.calls[0][0].attachments).toEqual(mocks.send.mock.calls[1][0].attachments);
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(updates.filter(update => update.pdf_storage_path)).toHaveLength(1);
  });
  it('does not email a PDF that failed to persist', async () => {
    const { db, upload } = database();
    upload.mockResolvedValue({ error: { message: 'storage unavailable' } });
    await expect(ensurePaidTrialInvoice(db, 'lesson')).rejects.toThrow('storage unavailable');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
