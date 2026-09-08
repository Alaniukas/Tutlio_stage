import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { isProKlaseOrg } from './marketMoney.js';
import { proKlaseVatExemptionNote } from './proKlaseInvoice.js';
import { getFromEmail, getResendApiKey } from './resendConfig.js';

/** Called after verified payment, also on retries: creation is atomic in Postgres. */
export async function ensurePaidTrialInvoice(db: SupabaseClient, sessionId: string): Promise<void> {
  const { data: lesson, error } = await db.from('sessions')
    .select('id, paid, price, lesson_package_id, tutor_id, subjects(is_trial), students(full_name, email, payer_name, payer_email), profiles!sessions_tutor_id_fkey(organization_id)')
    .eq('id', sessionId).single();
  if (error) throw new Error(error.message);
  const row = lesson as any;
  const orgId = row?.profiles?.organization_id;
  if (!row?.paid || !isProKlaseOrg(orgId) || !row.subjects?.is_trial || row.lesson_package_id || Number(row.price) <= 0) return;
  const { data: profile, error: profileError } = await db.from('invoice_profiles').select('*').eq('organization_id', orgId).single();
  if (profileError || !profile?.business_name) throw new Error('Organization invoice profile required');
  const seller = {
    name: profile.business_name, entityType: profile.entity_type, companyCode: profile.company_code,
    vatCode: profile.vat_code, address: profile.address, contactEmail: profile.contact_email,
    contactPhone: profile.contact_phone, bankName: profile.bank_name, iban: profile.iban,
    taxExemptionNote: proKlaseVatExemptionNote(orgId, true),
  };
  const buyer = { name: row.students?.payer_name || row.students?.full_name,
    email: row.students?.payer_email || row.students?.email };
  const { data: invoiceId, error: issueError } = await db.rpc('issue_paid_trial_invoice', {
    p_session_id: sessionId, p_seller: seller, p_buyer: buyer,
  });
  if (issueError) throw new Error(issueError.message);
  if (!invoiceId) return;
  await deliverTrialInvoice(db, invoiceId, row.tutor_id);
}

async function deliverTrialInvoice(db: SupabaseClient, invoiceId: string, tutorId: string): Promise<void> {
  const { data: invoice, error: invoiceError } = await db.from('invoices')
    .select('*, invoice_line_items(*)').eq('id', invoiceId).single();
  if (invoiceError || !invoice) throw new Error(invoiceError?.message || 'Invoice missing');
  if (invoice.payer_email_sent_at || invoice.status === 'cancelled') return;
  const path = invoice.pdf_storage_path || `${tutorId}/${invoiceId}.pdf`;
  const storage = db.storage.from('invoices');
  if (!invoice.pdf_storage_path) {
  // Most payment callbacks do not issue a PDF; keep fontkit/pdf-lib off that path.
  const { generateInvoicePdf } = await import('./invoicePdf.js');
  const generatedPdf = await generateInvoicePdf({
    invoiceNumber: invoice.invoice_number, issueDate: invoice.issue_date,
    periodStart: invoice.period_start, periodEnd: invoice.period_end,
    seller: invoice.seller_snapshot, buyer: invoice.buyer_snapshot,
    lineItems: invoice.invoice_line_items.map((line: any) => ({ description: line.description,
      quantity: Number(line.quantity), unitPrice: Number(line.unit_price), totalPrice: Number(line.total_price) })),
    totalAmount: Number(invoice.total_amount), amountDue: 0, paidNote: ['Apmokėta'],
  });
  const { error: uploadError } = await storage.upload(path, generatedPdf, { contentType: 'application/pdf', upsert: false });
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message) && String(uploadError.statusCode) !== '409') throw new Error(uploadError.message);
  }
  // Always send the canonical stored bytes, including concurrent calls and retries.
  // Regenerating a PDF can change its metadata and violate email idempotency.
  const { data: storedPdf, error: downloadError } = await storage.download(path);
  if (downloadError || !storedPdf) throw new Error(downloadError?.message || 'Invoice PDF missing');
  const pdf = new Uint8Array(await storedPdf.arrayBuffer());
  if (!invoice.pdf_storage_path) {
    const { error: saveError } = await db.from('invoices').update({ pdf_storage_path: path }).eq('id', invoiceId);
    if (saveError) throw new Error(saveError.message);
  }
  const recipient = invoice.buyer_snapshot?.email;
  if (!recipient) throw new Error('Invoice payer email missing');
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('Invoice email service not configured');
  const { error: mailError } = await new Resend(apiKey).emails.send({
    from: getFromEmail(), to: recipient, subject: `Sąskaita faktūra ${invoice.invoice_number}`,
    text: 'Ačiū už apmokėjimą. Prisegame apmokėtos bandomosios pamokos sąskaitą faktūrą.',
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: Buffer.from(pdf) }],
  }, { idempotencyKey: `paid-trial-invoice/${invoiceId}` });
  if (mailError) throw new Error(mailError.message);
  const { error: sentError } = await db.from('invoices').update({ payer_email_sent_at: new Date().toISOString() }).eq('id', invoiceId);
  if (sentError) throw new Error(sentError.message);
}

/** Creation-time trial payment links use a one-lesson package, not session checkout. */
export async function ensurePaidTrialPackageInvoice(db: SupabaseClient, packageId: string): Promise<boolean> {
  const { data, error } = await db.from('lesson_packages')
    .select('id, paid, tutor_id, total_price, total_lessons, subjects(is_trial), students(full_name, email, payer_name, payer_email), profiles!lesson_packages_tutor_id_fkey(organization_id)')
    .eq('id', packageId).single();
  if (error) throw new Error(error.message);
  const row = data as any;
  const orgId = row?.profiles?.organization_id;
  if (!row?.paid || !isProKlaseOrg(orgId) || !row.subjects?.is_trial || Number(row.total_price) <= 0) return false;
  const { data: profile, error: profileError } = await db.from('invoice_profiles').select('*').eq('organization_id', orgId).single();
  if (profileError || !profile?.business_name) throw new Error('Organization invoice profile required');
  const { data: invoiceId, error: issueError } = await db.rpc('issue_paid_trial_package_invoice', {
    p_package_id: packageId,
    p_seller: { name: profile.business_name, entityType: profile.entity_type, companyCode: profile.company_code,
      vatCode: profile.vat_code, address: profile.address, contactEmail: profile.contact_email,
      contactPhone: profile.contact_phone, bankName: profile.bank_name, iban: profile.iban,
      taxExemptionNote: proKlaseVatExemptionNote(orgId, true) },
    p_buyer: { name: row.students?.payer_name || row.students?.full_name, email: row.students?.payer_email || row.students?.email },
  });
  if (issueError) throw new Error(issueError.message);
  if (invoiceId) await deliverTrialInvoice(db, invoiceId, row.tutor_id);
  return true;
}
