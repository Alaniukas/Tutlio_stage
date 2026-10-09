/**
 * User-authorized correction of existing September 2026 MK invoices.
 * plan: read production, back up originals, create corrected PDFs and mail previews.
 * apply: correct only those exact invoice IDs and replace their stored PDFs.
 * send: send customers once, with a fresh payment-state check per payer.
 * verify: check the corrected records, files, and provider delivery status.
 * Does not recreate billing batches, payments, invoices, or contracts.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { Resend } from 'resend';
import {
  CORRECTION_META_KEY, MANO_SEPTEMBER_CORRECTION, correctedManoEmail,
  correctedManoInvoice, correctedManoPdf,
} from '../api/_lib/manoInvoiceCorrection.ts';
import { MANO_KOREPETITORIUS_ORG_ID as ORG_ID } from '../api/_lib/marketMoney.ts';
import { resolveInvoiceBranding } from '../api/_lib/invoiceBranding.ts';
import { resolveEmailOrgBranding } from '../api/_lib/emailOrgBranding.ts';
import { resolveOrgEmailReplyTo } from '../api/_lib/orgEmailReplyTo.ts';
import { getFromEmail, getResendApiKey } from '../api/_lib/resendConfig.ts';
import { retrieveConnectCheckoutSessionWithScope } from '../api/_lib/stripeDirectCharge.ts';
import { formatInvoiceDownloadFilename } from '../src/lib/invoiceDownloadFilename.ts';

const MODE = process.argv[2] || 'plan';
assert(['plan', 'apply', 'send', 'verify'].includes(MODE));
const ROOT = process.cwd();
const OUT = join(ROOT, 'output', 'pdf', 'mano-september-correction-20261009');
const PLAN_PATH = join(OUT, 'plan.json');
const JOURNAL_PATH = join(OUT, 'journal.json');
const REVIEW_PATH = join(OUT, 'review-ok.json');
const env = parseEnv(readFileSync(join(ROOT, '.env'), 'utf8'));
for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'RESEND_API_KEY_STAGE', 'FROM_EMAIL']) {
  if (env[name]) process.env[name] = env[name];
}
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
assert.equal(new URL(url).hostname, 'cuhciqwmqfuajeeqjjbm.supabase.co');
assert(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Supabase service key required');
assert(/^sk_live_|^rk_live_/.test(process.env.STRIPE_SECRET_KEY || ''), 'Live Stripe key required');
assert(getResendApiKey(), 'Configured mail provider required');
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const resend = new Resend(getResendApiKey());

function checked<T>(result: { data: T; error: any }, context: string): T {
  if (result.error) throw new Error(context + ': ' + result.error.message);
  assert(result.data !== null, context + ': no data');
  return result.data;
}
function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}
function save(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}
function readJson(path: string): any { return JSON.parse(readFileSync(path, 'utf8')); }
const pause = () => new Promise(resolve => setTimeout(resolve, 650));
async function row(id: string): Promise<any> {
  return checked(await db.from('invoices').select('*').eq('organization_id', ORG_ID).eq('id', id).single(), 'invoice read');
}
async function items(id: string): Promise<any[]> {
  return checked(await db.from('invoice_line_items').select('*').eq('invoice_id', id)
    .order('created_at').order('id'), 'invoice items');
}
function financialHash(invoice: any, lineItems: any[]): string {
  const meta = { ...invoice.pdf_meta };
  delete meta[CORRECTION_META_KEY];
  return hash(JSON.stringify({ id: invoice.id, organization_id: invoice.organization_id,
    seller_user_id: invoice.seller_user_id, issued_by_user_id: invoice.issued_by_user_id,
    seller_snapshot: invoice.seller_snapshot, buyer_snapshot: invoice.buyer_snapshot,
    period_start: invoice.period_start, period_end: invoice.period_end,
    subtotal: invoice.subtotal, total_amount: invoice.total_amount,
    billing_batch_id: invoice.billing_batch_id, origin: invoice.origin, pdf_meta: meta, lineItems }));
}
async function blob(path: string): Promise<Buffer> {
  const file = checked(await db.storage.from('invoices').download(path), 'PDF download');
  return Buffer.from(await file.arrayBuffer());
}
async function batchFor(invoice: any): Promise<any> {
  assert(invoice.billing_batch_id, 'Customer invoice needs an existing batch');
  const batch: any = checked(await db.from('billing_batches').select('*')
    .eq('id', invoice.billing_batch_id).single(), 'billing batch');
  assert.equal(batch.period_start_date, '2026-09-01');
  assert.equal(batch.period_end_date, '2026-09-30');
  assert.notEqual(batch.payment_status, 'cancelled');
  assert(/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(batch.payer_email || ''), 'Valid original payer email required');
  const tutor: any = checked(await db.from('profiles').select('organization_id')
    .eq('id', batch.tutor_id).single(), 'batch tutor');
  assert.equal(tutor.organization_id, ORG_ID);
  return batch;
}
async function paidState(invoice: any, batch: any, organization: any) {
  if (invoice.status === 'paid' || batch.paid === true || batch.payment_status === 'paid') return true;
  if (batch.stripe_checkout_session_id) {
    const lookup = await retrieveConnectCheckoutSessionWithScope(stripe, batch.stripe_checkout_session_id,
      organization.stripe_account_id);
    assert(lookup.session.livemode, 'Only live payment sessions allowed');
    if (lookup.session.payment_status === 'paid' || lookup.session.payment_status === 'no_payment_required') return true;
    // An in-flight asynchronous payment must not receive another request.
    assert.notEqual(lookup.session.status, 'complete', 'Payment may be processing; review this payer');
  }
  return false;
}
async function organization() {
  const org: any = checked(await db.from('organizations').select('*').eq('id', ORG_ID).single(), 'organization');
  assert.equal(org.slug, 'mb-mano-korepetitorius');
  assert(org.stripe_onboarding_complete && org.stripe_account_id, 'Existing payment account required');
  return org;
}
function emailOptions(org: any, batch: any, paid: boolean) {
  const branding = resolveEmailOrgBranding(ORG_ID, org);
  return { organizationName: branding.publicName || org.name,
    signature: branding.emailTeamSignature || org.name + ' komanda',
    recipientName: String(batch.payer_name || ''), paid, billingBatchId: batch.id,
    contactEmail: branding.emailContactEmail || org.email,
    brandColor: branding.branding?.brand_color || org.brand_color };
}

async function plan() {
  assert(!existsSync(PLAN_PATH), 'Plan already exists; reuse it with apply/send/verify');
  for (const directory of ['before', 'after', 'mail', 'outgoing']) mkdirSync(join(OUT, directory), { recursive: true });
  const org = await organization();
  const replyTo = await resolveOrgEmailReplyTo(db, ORG_ID, org);
  assert(replyTo?.length, 'Organization Reply-To required');
  const branding = await resolveInvoiceBranding(db, ORG_ID);
  const invoices: any[] = checked(await db.from('invoices').select('*').eq('organization_id', ORG_ID)
    .eq('period_start', '2026-09-01').eq('period_end', '2026-09-30').order('id'), 'invoice scope');
  assert.equal(invoices.length, 39);
  assert.equal(invoices.filter(inv => inv.pdf_meta?.invoiceKind === 'tutor_pay').length, 4);
  assert.equal(new Set(invoices.filter(inv => inv.pdf_meta?.invoiceKind !== 'tutor_pay')
    .map(inv => inv.billing_batch_id)).size, 35);
  const entries = [];
  for (const invoice of invoices) {
    const lineItems = await items(invoice.id);
    assert(lineItems.length);
    const corrected = correctedManoInvoice(invoice);
    assert(invoice.pdf_storage_path, 'Existing PDF storage path required');
    const oldPdf = await blob(invoice.pdf_storage_path);
    writeFileSync(join(OUT, 'before', invoice.id + '.pdf'), oldPdf);
    save(join(OUT, 'before', invoice.id + '.json'), { invoice, lineItems });
    const rendered = await correctedManoPdf(invoice, lineItems, branding);
    const filename = formatInvoiceDownloadFilename({ invoiceNumber: corrected.invoice_number,
      issueDate: corrected.issue_date, organizationId: ORG_ID });
    writeFileSync(join(OUT, 'after', filename), rendered.bytes);
    const tutor = invoice.pdf_meta?.invoiceKind === 'tutor_pay';
    let batch: any = null;
    let paid: boolean | null = null;
    if (!tutor) {
      batch = await batchFor(invoice);
      paid = await paidState(invoice, batch, org);
      const email = correctedManoEmail(emailOptions(org, batch, paid));
      writeFileSync(join(OUT, 'mail', batch.id + '.html'), email.html);
      writeFileSync(join(OUT, 'mail', batch.id + '.txt'), email.text);
    } else {
      const conflicts: any[] = checked(await db.from('invoices').select('id').eq('seller_user_id', invoice.seller_user_id)
        .eq('invoice_number', corrected.invoice_number).neq('id', invoice.id), 'invoice number uniqueness');
      assert.equal(conflicts.length, 0);
    }
    entries.push({ id: invoice.id, tutor, original: invoice, batch, paid,
      afterNumber: corrected.invoice_number, afterDate: corrected.issue_date, filename,
      financialHash: financialHash(invoice, lineItems), beforePdfHash: hash(oldPdf),
      afterPdfHash: hash(rendered.bytes) });
    console.log(JSON.stringify({ prepared: entries.length, total: invoices.length, kind: tutor ? 'tutor' : 'customer' }));
  }
  const manifest = { correctionId: MANO_SEPTEMBER_CORRECTION, organizationId: ORG_ID,
    preparedAt: new Date().toISOString(), entries, replyTo };
  save(PLAN_PATH, manifest);
  save(JOURNAL_PATH, { applied: {}, sent: {}, attempts: {} });
  console.log(JSON.stringify({ mode: MODE, invoices: entries.length, tutors: 4,
    paidCustomers: entries.filter(e => !e.tutor && e.paid).length,
    unpaidCustomers: entries.filter(e => !e.tutor && !e.paid).length, output: OUT, planHash: hash(readFileSync(PLAN_PATH)) }));
}

async function apply(manifest: any, journal: any) {
  const review = readJson(REVIEW_PATH);
  assert.equal(review.planHash, hash(readFileSync(PLAN_PATH)), 'Reviewed PDF manifest required');
  assert.equal(review.validatedPdfCount, 39);
  for (const entry of manifest.entries) {
    const invoice = await row(entry.id);
    assert.equal(financialHash(invoice, await items(entry.id)), entry.financialHash, 'Financial content changed');
    const pdf = readFileSync(join(OUT, 'after', entry.filename));
    assert.equal(hash(pdf), entry.afterPdfHash);
    assert(['issued', 'paid'].includes(invoice.status));
    const alreadyCorrected = invoice.issue_date === entry.afterDate && invoice.invoice_number === entry.afterNumber;
    if (!alreadyCorrected) {
      assert.equal(invoice.issue_date, entry.original.issue_date);
      assert.equal(invoice.invoice_number, entry.original.invoice_number);
    }
    // A new object key avoids the CDN serving the old date after an in-place upsert.
    assert(entry.original.pdf_storage_path.startsWith(entry.original.issued_by_user_id + '/'));
    const storagePath = entry.original.pdf_storage_path.replace(/\.pdf$/, '-mano-202609-date-v1.pdf');
    assert.notEqual(storagePath, entry.original.pdf_storage_path);
    assert([entry.original.pdf_storage_path, storagePath].includes(invoice.pdf_storage_path));
    checked(await db.storage.from('invoices').upload(storagePath, pdf,
      { contentType: 'application/pdf', cacheControl: '0', upsert: true }), 'PDF replacement');
    assert.equal(hash(await blob(storagePath)), entry.afterPdfHash, 'Stored PDF verification');
    const priorMarker = invoice.pdf_meta[CORRECTION_META_KEY] || {};
    if (alreadyCorrected) assert.equal(priorMarker.correctionId, MANO_SEPTEMBER_CORRECTION);
    const meta = { ...invoice.pdf_meta, [CORRECTION_META_KEY]: {
      ...priorMarker, correctionId: MANO_SEPTEMBER_CORRECTION,
      originalIssueDate: entry.original.issue_date, originalInvoiceNumber: entry.original.invoice_number,
      correctedAt: priorMarker.correctedAt || new Date().toISOString(),
      beforePdfHash: entry.beforePdfHash, afterPdfHash: entry.afterPdfHash,
    } };
    const updated: any[] = checked(await db.from('invoices').update({ issue_date: entry.afterDate,
      invoice_number: entry.afterNumber, pdf_meta: meta, pdf_storage_path: storagePath }).eq('organization_id', ORG_ID)
      .eq('id', entry.id).eq('issue_date', invoice.issue_date).eq('invoice_number', invoice.invoice_number)
      .eq('pdf_storage_path', invoice.pdf_storage_path).select('id'), 'invoice correction');
    assert.equal(updated.length, 1, 'Concurrent invoice metadata change');
    journal.applied[entry.id] = { at: new Date().toISOString(), hash: entry.afterPdfHash };
    save(JOURNAL_PATH, journal);
    console.log(JSON.stringify({ corrected: Object.keys(journal.applied).length, total: 39 }));
  }
}

async function send(manifest: any, journal: any) {
  assert.equal(Object.keys(journal.applied).length, 39, 'All invoice corrections must be verified before mail');
  const org = await organization();
  const replyTo = await resolveOrgEmailReplyTo(db, ORG_ID, org);
  assert(replyTo?.length);
  const branding = resolveEmailOrgBranding(ORG_ID, org);
  const baseAddress = getFromEmail().match(/<([^>]+)>/)?.[1] || getFromEmail();
  assert(/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(baseAddress));
  const senderName = branding.emailSenderName || branding.publicName || org.name;
  assert(!/[<>\r\n]/.test(senderName));
  for (const entry of manifest.entries.filter((entry: any) => !entry.tutor)) {
    const invoice = await row(entry.id);
    const marker = invoice.pdf_meta?.[CORRECTION_META_KEY];
    assert.equal(marker?.correctionId, MANO_SEPTEMBER_CORRECTION);
    if (marker.emailId || journal.sent[entry.id]) continue;
    assert.equal(invoice.issue_date, entry.afterDate);
    assert.equal(invoice.invoice_number, entry.afterNumber);
    assert.equal(financialHash(invoice, await items(entry.id)), entry.financialHash);
    assert.equal(hash(await blob(invoice.pdf_storage_path)), entry.afterPdfHash);
    const batch = await batchFor(invoice);
    assert.equal(batch.payer_email, entry.batch.payer_email, 'Original recipient changed');
    assert.equal(Number(batch.total_amount), Number(entry.batch.total_amount), 'Payment amount changed');
    const paid = await paidState(invoice, batch, org);
    const frozenPath = join(OUT, 'outgoing', batch.id + '.json');
    let payload: any;
    if (existsSync(frozenPath)) {
      assert(Date.now() - Date.parse(journal.attempts[entry.id]?.at) < 23 * 60 * 60 * 1000,
        'Older ambiguous mail attempt needs provider verification');
      payload = readJson(frozenPath);
      assert.equal(payload.paid, paid, 'Payment changed after uncertain delivery; verify provider before retry');
    } else {
      const email = correctedManoEmail(emailOptions(org, batch, paid));
      payload = { paid, email: { from: senderName + ' <' + baseAddress + '>', to: [batch.payer_email],
        replyTo, subject: email.subject, html: email.html, text: email.text,
        attachments: [{ filename: entry.filename, content: readFileSync(join(OUT, 'after', entry.filename)).toString('base64') }] } };
      save(frozenPath, payload);
    }
    journal.attempts[entry.id] ||= { at: new Date().toISOString(), paid };
    save(JOURNAL_PATH, journal);
    const result = await resend.emails.send({ ...payload.email,
      attachments: payload.email.attachments.map((a: any) => ({ ...a, content: Buffer.from(a.content, 'base64') })) },
      { idempotencyKey: MANO_SEPTEMBER_CORRECTION + '/' + batch.id });
    if (result.error) throw new Error('Mail provider: ' + result.error.message);
    assert(result.data?.id, 'Mail provider did not acknowledge delivery request');
    const sent = { at: new Date().toISOString(), emailId: result.data.id, paid, batchId: batch.id };
    journal.sent[entry.id] = sent;
    save(JOURNAL_PATH, journal);
    const fresh = await row(entry.id);
    const updated: any[] = checked(await db.from('invoices').update({
      pdf_meta: { ...fresh.pdf_meta, [CORRECTION_META_KEY]: { ...fresh.pdf_meta[CORRECTION_META_KEY],
        emailId: sent.emailId, emailSentAt: sent.at, emailPaymentState: paid ? 'paid' : 'unpaid' } },
    }).eq('organization_id', ORG_ID).eq('id', entry.id).select('id'), 'Mail audit marker');
    assert.equal(updated.length, 1);
    console.log(JSON.stringify({ sent: Object.keys(journal.sent).length, total: 35, paid }));
    await pause();
  }
}

async function verify(manifest: any, journal: any) {
  const report: any = { capturedAt: new Date().toISOString(), correctedInvoices: 0,
    customerEmails: Object.keys(journal.sent).length, paidEmails: 0, unpaidEmails: 0, providerEvents: {} };
  for (const entry of manifest.entries) {
    const invoice = await row(entry.id);
    assert.equal(invoice.issue_date, entry.afterDate);
    assert.equal(invoice.invoice_number, entry.afterNumber);
    assert.equal(financialHash(invoice, await items(entry.id)), entry.financialHash);
    assert.equal(hash(await blob(invoice.pdf_storage_path)), entry.afterPdfHash);
    assert.equal(invoice.pdf_meta[CORRECTION_META_KEY].correctionId, MANO_SEPTEMBER_CORRECTION);
    report.correctedInvoices++;
    const sent = journal.sent[entry.id];
    if (sent) {
      assert.equal(invoice.pdf_meta[CORRECTION_META_KEY].emailId, sent.emailId);
      if (sent.paid) report.paidEmails++; else report.unpaidEmails++;
      const result = await resend.emails.get(sent.emailId);
      const event = result.error ? 'read_unavailable' : result.data?.last_event || 'accepted';
      report.providerEvents[event] = (report.providerEvents[event] || 0) + 1;
      await pause();
    }
  }
  save(join(OUT, 'verification.json'), report);
  console.log(JSON.stringify(report));
}

try {
  if (MODE === 'plan') await plan();
  else {
    const manifest = readJson(PLAN_PATH);
    assert.equal(manifest.correctionId, MANO_SEPTEMBER_CORRECTION);
    assert.equal(manifest.organizationId, ORG_ID);
    assert.equal(manifest.entries.length, 39);
    const journal = readJson(JOURNAL_PATH);
    if (MODE === 'apply') await apply(manifest, journal);
    if (MODE === 'send') await send(manifest, journal);
    if (MODE === 'verify') await verify(manifest, journal);
  }
} catch (error: any) {
  console.error(JSON.stringify({ mode: MODE, error: error.message || 'Operation failed' }));
  process.exitCode = 1;
}
