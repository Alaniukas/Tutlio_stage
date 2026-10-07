/**
 * Seeds a few fake payer S.F. for local ZIP / checkbox download QA.
 *
 *   npx tsx scripts/seed-invoice-download-qa.ts          # DEMO MK (numatyta)
 *   npx tsx scripts/seed-invoice-download-qa.ts --proklase
 *
 * **Tik QA demo org** — niekada prod MK/Laisvi vaikai.
 * Removes prior rows tagged with buyer name prefix "[ZIP-QA]".
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateInvoicePdf } from '../api/_lib/invoicePdf.ts';
import { formatInvoiceSeriesHeading } from '../api/_lib/invoiceNumber.ts';
import { buildEducationNotes } from '../api/_lib/pvmEducationInvoice.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const QA_BUYER_PREFIX = '[ZIP-QA]';
const PASSWORD_HINT = 'TutlioQaDemo2026!';

const PRO_KLASE_QA_ORG_ID = 'b0a00000-7e57-4000-8000-000000000001';
const PRO_KLASE_QA_ADMIN_EMAIL = 'proklase.qa.admin@tutlio.lt';
const PLAIN_COMPANY_QA_ORG_ID = 'c1a00000-7e57-4000-8000-000000000001';
const PLAIN_COMPANY_QA_ADMIN_EMAIL = 'manokorepetitorius.demo.admin@tutlio.lt';
const ALLOWED_ORG_IDS = new Set([PRO_KLASE_QA_ORG_ID, PLAIN_COMPANY_QA_ORG_ID]);

const MK_SELLER = {
  name: 'MB "Mano korepetitorius"',
  entityType: 'mb' as const,
  companyCode: '305621035',
  vatCode: 'LT100018853316',
  address: 'Žirmūnų g. 100-63, Vilnius',
  contactEmail: 'info@manokorepetitorius.lt',
  bankName: 'Luminor bank AS',
  iban: 'LT574010051005439130',
};

const SAMPLES = [
  {
    invoiceNumber: 'MK-01649',
    issueDate: '2026-08-31',
    buyerName: `${QA_BUYER_PREFIX} Greta Bespalovaitė`,
    grade: '11 klasė',
    total: 88,
    lessons: [
      { subject: 'Matematika', price: 22, datetime: '2026-08-05 16:00' },
      { subject: 'Anglų k.', price: 22, datetime: '2026-08-12 17:30' },
      { subject: 'Matematika', price: 22, datetime: '2026-08-19 16:00' },
      { subject: 'Anglų k.', price: 22, datetime: '2026-08-26 17:30' },
    ],
  },
  {
    invoiceNumber: 'MK-01650',
    issueDate: '2026-08-31',
    buyerName: `${QA_BUYER_PREFIX} Pijus Oželis`,
    grade: '9 klasė',
    total: 52,
    lessons: [
      { subject: 'Fizika', price: 26, datetime: '2026-08-07 15:00' },
      { subject: 'Fizika', price: 26, datetime: '2026-08-21 15:00' },
    ],
  },
  {
    invoiceNumber: 'MK-01651',
    issueDate: '2026-09-30',
    buyerName: `${QA_BUYER_PREFIX} Lukas Petraitis`,
    grade: '8 klasė',
    total: 44,
    lessons: [
      { subject: 'Matematika', price: 22, datetime: '2026-09-04 16:00' },
      { subject: 'Matematika', price: 22, datetime: '2026-09-18 16:00' },
    ],
  },
  {
    invoiceNumber: 'MK-01652',
    issueDate: '2026-09-30',
    buyerName: `${QA_BUYER_PREFIX} Gabija Kazlauskaitė`,
    grade: '10 klasė',
    total: 48,
    lessons: [
      { subject: 'Chemija', price: 24, datetime: '2026-09-10 18:00' },
      { subject: 'Chemija', price: 24, datetime: '2026-09-24 18:00' },
    ],
  },
];

function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Reikia .env su VITE_SUPABASE_URL ir SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log('[seed-invoice-download-qa] Supabase:', url);

  const useProklase = process.argv.includes('--proklase');
  let orgId = useProklase ? PRO_KLASE_QA_ORG_ID : PLAIN_COMPANY_QA_ORG_ID;
  let loginEmail = useProklase ? PRO_KLASE_QA_ADMIN_EMAIL : PLAIN_COMPANY_QA_ADMIN_EMAIL;
  const loginHint = `Demo slaptažodis: ${PASSWORD_HINT} (node scripts/seed-qa-demo-orgs.mjs jei dar neįkelta)`;

  const { data: orgRow } = await supabase.from('organizations').select('id, name').eq('id', orgId).maybeSingle();
  if (!orgRow) {
    throw new Error(`QA org ${orgId} nerasta. Paleiskite: node scripts/seed-qa-demo-orgs.mjs`);
  }

  if (!useProklase) {
    const { data: orgFeatures } = await supabase.from('organizations').select('features').eq('id', orgId).single();
    const features = (orgFeatures?.features && typeof orgFeatures.features === 'object')
      ? { ...(orgFeatures.features as Record<string, unknown>) }
      : {};
    if (features.pvm_education_invoice !== true) {
      features.pvm_education_invoice = true;
      await supabase.from('organizations').update({ features }).eq('id', orgId);
      console.log('[seed-invoice-download-qa] Įjungta pvm_education_invoice DEMO org');
    }
  }
  if (!ALLOWED_ORG_IDS.has(orgId)) {
    throw new Error(`Seed leidžiamas tik QA demo org: ${[...ALLOWED_ORG_IDS].join(', ')}`);
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, pdf_storage_path')
    .eq('organization_id', orgId)
    .ilike('buyer_snapshot->>name', `${QA_BUYER_PREFIX}%`);
  const existingIds = (existing || []).map((row) => row.id);
  const existingPaths = (existing || []).map((row) => row.pdf_storage_path).filter(Boolean) as string[];
  if (existingPaths.length) {
    await supabase.storage.from('invoices').remove(existingPaths);
  }
  if (existingIds.length) {
    await supabase.from('invoice_line_items').delete().in('invoice_id', existingIds);
    await supabase.from('invoices').delete().in('id', existingIds);
    console.log(`[seed-invoice-download-qa] Ištrinta senų QA įrašų: ${existingIds.length}`);
  }

  const { data: tutor } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();

  const { data: orgAdmin } = await supabase
    .from('organization_admins')
    .select('user_id')
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle();

  const issuedByUserId = tutor?.id || orgAdmin?.user_id;
  if (!issuedByUserId) {
    throw new Error(`Nerastas tutor/admin org ${orgId}. Paleiskite node scripts/seed-qa-demo-orgs.mjs`);
  }

  const created: string[] = [];

  for (const sample of SAMPLES) {
    const studentName = sample.buyerName.replace(QA_BUYER_PREFIX, '').trim();
    const pdfMeta = {
      layout: 'pvm_education',
      notes: buildEducationNotes(studentName, sample.grade),
      lessonDetails: sample.lessons,
      hidePlatformFooter: true,
    };

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: sample.invoiceNumber,
        issued_by_user_id: issuedByUserId,
        organization_id: orgId,
        seller_snapshot: MK_SELLER,
        buyer_snapshot: { name: sample.buyerName, email: 'alaniukasa@gmail.com' },
        issue_date: sample.issueDate,
        period_start: `${sample.issueDate.slice(0, 7)}-01`,
        period_end: sample.issueDate,
        grouping_type: 'single',
        subtotal: sample.total,
        total_amount: sample.total,
        status: 'issued',
        origin: 'generated',
        pdf_meta: pdfMeta,
      })
      .select('id')
      .single();

    if (invErr || !invoice) {
      console.error('[seed-invoice-download-qa] insert failed:', sample.invoiceNumber, invErr?.message);
      continue;
    }

    await supabase.from('invoice_line_items').insert({
      invoice_id: invoice.id,
      description: 'Mokymo paslaugos',
      quantity: 1,
      unit_price: sample.total,
      total_price: sample.total,
      session_ids: [],
    });

    const pdfBytes = await generateInvoicePdf({
      invoiceNumber: sample.invoiceNumber,
      invoiceNumberLabel: formatInvoiceSeriesHeading(sample.invoiceNumber),
      issueDate: new Date(sample.issueDate).toLocaleDateString('lt-LT'),
      periodStart: new Date(`${sample.issueDate.slice(0, 7)}-01`).toLocaleDateString('lt-LT'),
      periodEnd: new Date(sample.issueDate).toLocaleDateString('lt-LT'),
      seller: MK_SELLER,
      buyer: { name: sample.buyerName },
      lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: sample.total, totalPrice: sample.total }],
      totalAmount: sample.total,
      layout: 'pvm_education',
      isVatInvoice: true,
      hidePlatformFooter: true,
      notes: pdfMeta.notes,
      lessonDetails: pdfMeta.lessonDetails,
    });

    const storagePath = `${issuedByUserId}/${invoice.id}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('invoices')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) {
      console.warn('[seed-invoice-download-qa] PDF upload warning:', uploadErr.message);
    } else {
      await supabase.from('invoices').update({ pdf_storage_path: storagePath }).eq('id', invoice.id);
    }

    created.push(sample.invoiceNumber);
    console.log(`[seed-invoice-download-qa] + ${sample.invoiceNumber} (${sample.issueDate})`);
  }

  const appUrl = (process.env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SĄSKAITŲ ZIP QA — paruošta');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Org ID:     ${orgId}`);
  console.log(`  Sąskaitos:  ${created.join(', ') || '(nėra)'}`);
  console.log(`  UI:         ${appUrl}/company/invoices`);
  console.log(`  Login:      ${appUrl}/company/login?org=manokorepetitorius`);
  if (loginEmail) console.log(`  Admin:      ${loginEmail}`);
  console.log(`  Pastaba:    ${loginHint}`);
  console.log('  Filtruokite pagal 2026-08 arba 2026-09 ir ieškokite "[ZIP-QA]" mokėtojo varduose.');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('[seed-invoice-download-qa] Failed:', err?.message || err);
  process.exit(1);
});
