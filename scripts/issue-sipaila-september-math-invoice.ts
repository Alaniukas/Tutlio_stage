/**
 * One-off: Šipaila Benediktas September math sessions missed by PAM-800.
 *   npx tsx scripts/issue-sipaila-september-math-invoice.ts plan
 *   npx tsx scripts/issue-sipaila-september-math-invoice.ts apply
 *   npx tsx scripts/issue-sipaila-september-math-invoice.ts send
 */
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { allocateInvoiceNumber } from '../api/_lib/invoiceNumber.ts';
import { resolveInvoiceBranding } from '../api/_lib/invoiceBranding.ts';
import { generateSchoolMonthlyInvoicePdf } from '../api/_lib/schoolMonthlyInvoicePdf.ts';
import { buildSchoolMonthlyInvoiceEmailData } from '../api/_lib/schoolMonthlyInvoiceEmail.ts';
import { publicAppOrigin } from '../api/_lib/publicLinkToken.ts';
import { schoolMonthlyInvoiceIdempotencyKey } from '../api/_lib/schoolMonthlyInvoiceDelivery.ts';
import { schoolInvoiceDueDate } from '../src/lib/schoolCanonicalBilling.ts';
import { schoolMonthlySupplementalInvoiceNote } from '../src/lib/schoolMonthlyInvoiceIssuance.ts';
import handler from '../api/send-email.ts';

function loadEnvFile(file: string) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const i = line.indexOf('=');
        let value = line.slice(i + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, i), value];
      }),
  );
}

for (const [key, value] of Object.entries({ ...loadEnvFile('.env'), ...loadEnvFile('.env.local') })) {
  if (value && process.env[key] == null) process.env[key] = value;
}

const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const STUDENT_ID = 'e4a0df75-c21f-4bdf-970b-652ba0026423';
const PROFILE_ID = '9f49cb99-926c-47da-a764-16207ecc8718';
const PERIOD_START = '2026-09-01';
const PERIOD_END = '2026-09-30';
const MATH_SESSION_IDS = [
  '4e142a78-6439-4654-987b-073f6390a0fd',
  'f256535e-8c96-4541-81c2-530bbacb6c22',
  '3a99dc9a-6ca9-4e72-a9dc-036461ace594',
  'd396735e-0419-4f94-b6f6-dc24af20f522',
  '393ea12b-22d6-4856-aabb-7766c58132a6',
  '3990944d-fa91-4bbd-9ba2-5b27b565225c',
  '7576b52c-3d75-4f12-8b8e-c12efafd8df5',
  '4bf3380a-1d01-4948-aae5-b233c1f2a41b',
] as const;

const NOTE = schoolMonthlySupplementalInvoiceNote([{ invoice_number: 'PAM-800', total_eur: 96 }])!;

function db() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase URL or service role key');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function existingSupplemental(supabase: ReturnType<typeof db>) {
  const { data, error } = await supabase.from('school_monthly_invoices')
    .select('id, invoice_number, invoice_email_sent_at, billed_session_ids, total_eur, payment_status, pdf_path')
    .eq('organization_id', ORG_ID)
    .eq('student_id', STUDENT_ID)
    .eq('period_start', PERIOD_START)
    .neq('payment_status', 'cancelled');
  if (error) throw new Error(error.message);
  return (data || []).find((row) => MATH_SESSION_IDS.every((id) => (row.billed_session_ids || []).includes(id)));
}

async function apply() {
  const supabase = db();
  const already = await existingSupplemental(supabase);
  if (already) {
    console.log(`Already issued ${already.invoice_number} (${already.id})`);
    return already;
  }
  const dueDate = schoolInvoiceDueDate(new Date());
  const invoiceNumber = await allocateInvoiceNumber(supabase, PROFILE_ID);
  const { data: profile, error: profileError } = await supabase.from('invoice_profiles')
    .select('*').eq('id', PROFILE_ID).single();
  if (profileError || !profile) throw new Error(profileError?.message || 'Missing invoice profile');
  const { data: org, error: orgError } = await supabase.from('organizations')
    .select('id, name, email, features, stripe_account_id, stripe_onboarding_complete')
    .eq('id', ORG_ID).single();
  if (orgError || !org) throw new Error(orgError?.message || 'Missing organization');
  const { data: student, error: studentError } = await supabase.from('students')
    .select('id, full_name, grade, payer_name, payer_email, payer_phone')
    .eq('id', STUDENT_ID).single();
  if (studentError || !student) throw new Error(studentError?.message || 'Missing student');

  const { data: invoice, error: invoiceError } = await supabase.from('school_monthly_invoices').insert({
    organization_id: ORG_ID,
    contract_id: null,
    student_id: STUDENT_ID,
    period_start: PERIOD_START,
    period_end: PERIOD_END,
    unit_price_eur: 0,
    base_lessons: 0,
    base_amount_eur: 0,
    extra_lessons: 0,
    extra_amount_eur: 0,
    subtotal_eur: 160,
    discount_amount_eur: 0,
    total_eur: 160,
    payer_student_ids: [STUDENT_ID],
    extra_session_ids: [],
    billing_model: 'actual',
    billed_session_ids: [...MATH_SESSION_IDS],
    payment_status: 'pending',
    due_date: dueDate,
    invoice_number: invoiceNumber,
    issuer_note: NOTE,
  }).select('*').single();
  if (invoiceError || !invoice) throw new Error(invoiceError?.message || 'Invoice insert failed');

  const { error: lineError } = await supabase.from('school_monthly_invoice_lines').insert({
    invoice_id: invoice.id,
    sort_order: 0,
    description: 'Natalija Naidionova Matematika individuali Benediktas Šipaila - mokytojas Natalija Naidionova',
    unit_price_eur: 20,
    quantity: 8,
    original_amount_eur: 160,
    amount_eur: 160,
    source: 'lesson',
    session_id: MATH_SESSION_IDS[0],
    session_ids: [...MATH_SESSION_IDS],
  });
  if (lineError) throw new Error(lineError.message);

  const branding = await resolveInvoiceBranding(supabase, ORG_ID);
  const pdf = await generateSchoolMonthlyInvoicePdf({
    invoiceNumber,
    issueDate: new Date().toLocaleDateString('lt-LT'),
    periodLabel: 'rugsėjis 2026',
    studentName: student.full_name,
    grade: student.grade,
    dueDate,
    seller: {
      name: profile.business_name || org.name,
      companyCode: profile.company_code,
      address: profile.address,
      contactEmail: profile.contact_email || org.email,
      contactPhone: profile.contact_phone,
      bankName: profile.bank_name,
      iban: profile.iban,
    },
    buyer: {
      name: student.payer_name || student.full_name,
      email: student.payer_email,
      phone: student.payer_phone,
    },
    lines: [{
      studentName: student.full_name,
      activity: 'Natalija Naidionova Matematika individuali Benediktas Šipaila - mokytojas Natalija Naidionova',
      quantity: 8,
      unitPriceEur: 20,
      originalAmountEur: 160,
      amountEur: 160,
    }],
    subtotalEur: 160,
    discountAmountEur: 0,
    totalEur: 160,
    issuerNote: NOTE,
    issuedByName: `${org.name} administracija`,
    branding,
  });
  const storagePath = `school-monthly/${ORG_ID}/${invoice.id}.pdf`;
  const { error: uploadError } = await supabase.storage.from('invoices')
    .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error(uploadError.message);
  await supabase.from('school_monthly_invoices').update({ pdf_path: storagePath }).eq('id', invoice.id);
  console.log(`Issued ${invoiceNumber} ${invoice.id}`);
  return { ...invoice, pdf_path: storagePath, invoice_number: invoiceNumber };
}

async function send(invoiceId?: string) {
  const supabase = db();
  const invoice = invoiceId
    ? (await supabase.from('school_monthly_invoices').select('*').eq('id', invoiceId).single()).data
    : await existingSupplemental(supabase);
  if (!invoice) throw new Error('Issue the invoice with apply first');
  const { data: org } = await supabase.from('organizations')
    .select('id, name, email, features, stripe_account_id, stripe_onboarding_complete')
    .eq('id', ORG_ID).single();
  const { data: student } = await supabase.from('students')
    .select('full_name, payer_name, payer_email').eq('id', STUDENT_ID).single();
  const { data: lines } = await supabase.from('school_monthly_invoice_lines')
    .select('*').eq('invoice_id', invoice.id).order('sort_order');
  const data = buildSchoolMonthlyInvoiceEmailData(invoice, {
    publicOrigin: publicAppOrigin(),
    student: student || {},
    org: org || { id: ORG_ID },
    contract: {},
    lines: lines || [],
  });
  let attachments: { filename: string; content: string }[] | undefined;
  if (invoice.pdf_path) {
    const { data: blob, error } = await supabase.storage.from('invoices').download(invoice.pdf_path);
    if (error) throw new Error(error.message);
    if (blob) {
      attachments = [{
        filename: `${invoice.invoice_number || 'saskaita'}.pdf`,
        content: Buffer.from(await blob.arrayBuffer()).toString('base64'),
      }];
    }
  }
  let statusCode = 500;
  let body: unknown = null;
  await handler({
    method: 'POST',
    body: {
        type: 'school_monthly_invoice',
        to: student?.payer_email,
        locale: 'lt',
        data,
        attachments,
        idempotencyKey: schoolMonthlyInvoiceIdempotencyKey(invoice.id),
    },
    headers: { 'content-type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY },
    query: {},
  } as never, {
    status(code: number) { statusCode = code; return this; },
    json(payload: unknown) { body = payload; return this; },
    setHeader() { return this; },
  } as never);
  if (statusCode !== 200) throw new Error(`send-email ${statusCode}: ${JSON.stringify(body)}`);
  console.log('Sent', body);
}

const mode = process.argv[2] || 'plan';
async function main() {
  if (mode === 'plan') {
    console.log({ studentId: STUDENT_ID, sessions: MATH_SESSION_IDS.length, amount: 160, note: NOTE });
    const already = await existingSupplemental(db());
    console.log('existing', already || null);
    return;
  }
  if (mode === 'apply') {
    await apply();
    return;
  }
  if (mode === 'send') {
    await send();
    return;
  }
  if (mode === 'apply-send') {
    const invoice = await apply();
    await send(invoice.id);
    return;
  }
  throw new Error('Use plan | apply | send | apply-send');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
