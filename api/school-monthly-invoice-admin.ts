import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types';
import {
  assertOrgConsultationsEnabled,
  isOrgAdminForOrg,
  requireConsultationsAuth,
  serviceSupabase,
} from './_lib/schoolConsultationsAccess.js';
import { allocateInvoiceNumber } from './_lib/invoiceNumber.js';
import { resolveInvoiceBranding } from './_lib/invoiceBranding.js';
import { generateSchoolMonthlyInvoicePdf } from './_lib/schoolMonthlyInvoicePdf.js';
import { sendSchoolMonthlyInvoiceEmail } from './_lib/schoolMonthlyInvoiceEmail.js';
import { publicAppOrigin } from './_lib/publicLinkToken.js';
import {
  buildSchoolLessonInvoiceLines,
  invoiceLinesDiscountTotal,
  invoiceLinesSubtotal,
  invoiceLinesTotal,
  type SchoolLessonDiscountInput,
  type SchoolLessonInvoiceLine,
} from '../src/lib/schoolMonthlyInvoiceLines.js';
import { canonicalSessionCharge, schoolInvoiceDueDate } from '../src/lib/schoolCanonicalBilling.js';

type RequestBody = {
  action?: 'options' | 'preview' | 'send';
  organizationId?: string;
  studentId?: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  previewToken?: string;
};

type DraftContext = {
  organizationId: string;
  student: any;
  org: any;
  profile: any;
  lines: SchoolLessonInvoiceLine[];
  subtotalEur: number;
  discountAmountEur: number;
  totalEur: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  reviewSessionIds: string[];
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function previewDigest(payload: Record<string, unknown>): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret) throw new Error('Server misconfigured');
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

function safeTokenEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function pdfLine(line: SchoolLessonInvoiceLine, studentName: string) {
  const label = line.discountType === 'percent'
    ? `${Number(line.discountValue || 0).toLocaleString('lt-LT')} %`
    : line.discountType === 'amount'
      ? `${Number(line.discountValue || 0).toFixed(2).replace('.', ',')} €`
      : null;
  return {
    studentName,
    activity: line.description,
    quantity: line.quantity,
    unitPriceEur: line.unitPriceEur,
    originalAmountEur: line.originalAmountEur,
    discountLabel: label,
    discountAmountEur: line.discountAmountEur,
    amountEur: line.amountEur,
  };
}

function periodLabel(start: string): string {
  const months = ['sausis', 'vasaris', 'kovas', 'balandis', 'gegužė', 'birželis', 'liepa', 'rugpjūtis', 'rugsėjis', 'spalis', 'lapkritis', 'gruodis'];
  const [year, month] = start.split('-').map(Number);
  return Number.isFinite(year) && months[month - 1] ? `${months[month - 1]} ${year}` : start;
}

function discountNotesForInvoice(lines: SchoolLessonInvoiceLine[]): string | null {
  const notes = [...new Set(lines.map((line) => line.discountNote).filter(Boolean))];
  return String(notes.join('; ') || '').trim() || null;
}

async function loadDraft(body: RequestBody): Promise<DraftContext> {
  const supabase = serviceSupabase();
  const organizationId = String(body.organizationId || '').trim();
  const studentId = String(body.studentId || '').trim();
  const periodStart = String(body.periodStart || '').slice(0, 10);
  const periodEnd = String(body.periodEnd || '').slice(0, 10);
  if (!organizationId || !studentId || !YMD.test(periodStart) || !YMD.test(periodEnd) || periodEnd < periodStart) {
    throw new Error('Pasirinkite mokinį ir teisingą sąskaitos laikotarpį.');
  }
  const dueDate = YMD.test(String(body.dueDate || ''))
    ? String(body.dueDate).slice(0, 10)
    : schoolInvoiceDueDate(new Date());

  const [{ data: student }, { data: org }, { data: profile }, { data: sessions }, { data: savedDiscounts }] = await Promise.all([
    supabase.from('students')
      .select('id, organization_id, full_name, grade, email, phone, payer_name, payer_email, payer_phone')
      .eq('id', studentId).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('organizations')
      .select('id, name, email, logo_url, brand_color, brand_color_secondary, features, stripe_account_id, stripe_onboarding_complete')
      .eq('id', organizationId).maybeSingle(),
    supabase.from('invoice_profiles')
      .select('id, business_name, company_code, address, contact_email, contact_phone, bank_name, iban, invoice_series')
      .eq('organization_id', organizationId).maybeSingle(),
    supabase.from('sessions')
      .select('id, subject_id, tutor_id, start_time, end_time, status, price, class_group_id, school_billing_kind, tutor_joined_at, status_confirmed_at, cancelled_by, cancelled_at, cancellation_reason_code, is_complimentary, paid, payment_status, lesson_package_id, credit_applied_amount, subject:subjects(name, price), tutor:profiles!sessions_tutor_id_fkey(full_name)')
      .eq('student_id', studentId)
      .gte('start_time', `${periodStart}T00:00:00.000Z`)
      .lte('start_time', `${periodEnd}T23:59:59.999Z`)
      .in('status', ['completed', 'no_show'])
      .order('start_time', { ascending: true }),
    supabase.from('student_lesson_discounts')
      .select('subject_id, tutor_id, percent, discount_type, amount_eur, valid_from, valid_until, note, created_at')
      .eq('student_id', studentId).eq('organization_id', organizationId)
      .lte('valid_from', periodEnd)
      .or(`valid_until.is.null,valid_until.gte.${periodStart}`)
      .order('created_at', { ascending: false }),
  ]);
  if (!student || !org) throw new Error('Mokinys arba mokykla nerasta.');
  if (!profile) throw new Error('Pirmiausia užpildykite mokyklos sąskaitų rekvizitus.');

  const reviewSessionIds: string[] = [];
  const billable = (sessions || []).flatMap((session: any) => {
    const charge = canonicalSessionCharge(session, session.class_group_id ? 'group' : 'individual');
    if (charge !== 'payable') {
      if (charge === 'review') reviewSessionIds.push(session.id);
      return [];
    }
    const subject = Array.isArray(session.subject) ? session.subject[0] : session.subject;
    const tutor = Array.isArray(session.tutor) ? session.tutor[0] : session.tutor;
    const subjectId = String(session.subject_id || '').trim();
    if (!subjectId) return [];
    return [{
      id: String(session.id),
      subjectId,
      subjectName: String(subject?.name || 'Užsiėmimas'),
      tutorId: String(session.tutor_id || ''),
      tutorName: String(tutor?.full_name || 'mokytojas'),
      unitPriceEur: Number(session.price ?? subject?.price ?? 0),
    }];
  });

  const persistent: SchoolLessonDiscountInput[] = (savedDiscounts || []).map((row: any) => ({
    type: row.discount_type === 'amount' ? 'amount' : 'percent',
    value: row.discount_type === 'amount' ? Number(row.amount_eur || 0) : Number(row.percent || 0),
    subjectId: String(row.subject_id),
    tutorId: row.tutor_id ? String(row.tutor_id) : null,
    note: row.note || null,
  }));
  const lines = buildSchoolLessonInvoiceLines(billable, persistent);
  if (!lines.length) throw new Error('Pasirinktu laikotarpiu nėra patvirtintų apmokestinamų užsiėmimų.');

  return {
    organizationId,
    student,
    org,
    profile,
    lines,
    subtotalEur: invoiceLinesSubtotal(lines),
    discountAmountEur: invoiceLinesDiscountTotal(lines),
    totalEur: invoiceLinesTotal(lines),
    periodStart,
    periodEnd,
    dueDate,
    reviewSessionIds,
  };
}

function digestPayload(draft: DraftContext, userId: string) {
  return {
    userId,
    organizationId: draft.organizationId,
    studentId: draft.student.id,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    dueDate: draft.dueDate,
    lines: draft.lines.map((line) => ({
      subjectId: line.subjectId,
      tutorId: line.tutorId,
      unitPriceEur: line.unitPriceEur,
      quantity: line.quantity,
      originalAmountEur: line.originalAmountEur,
      discountAmountEur: line.discountAmountEur,
      amountEur: line.amountEur,
      sessionIds: line.sessionIds,
    })),
  };
}

async function renderDraftPdf(draft: DraftContext, invoiceNumber: string, preview: boolean) {
  const branding = await resolveInvoiceBranding(serviceSupabase(), draft.organizationId);
  const features = (draft.org.features || {}) as Record<string, unknown>;
  return generateSchoolMonthlyInvoicePdf({
    preview,
    invoiceNumber,
    issueDate: new Date().toLocaleDateString('lt-LT'),
    periodLabel: periodLabel(draft.periodStart),
    studentName: draft.student.full_name,
    grade: draft.student.grade,
    dueDate: draft.dueDate,
    seller: {
      name: draft.profile.business_name || draft.org.name,
      companyCode: draft.profile.company_code,
      address: draft.profile.address,
      contactEmail: draft.profile.contact_email || draft.org.email,
      contactPhone: draft.profile.contact_phone,
      bankName: draft.profile.bank_name,
      iban: draft.profile.iban,
    },
    buyer: {
      name: draft.student.payer_name || draft.student.full_name,
      email: draft.student.payer_email || draft.student.email,
      phone: draft.student.payer_phone || draft.student.phone,
    },
    lines: draft.lines.map((line) => pdfLine(line, draft.student.full_name)),
    subtotalEur: draft.subtotalEur,
    discountAmountEur: draft.discountAmountEur,
    totalEur: draft.totalEur,
    discountNote: discountNotesForInvoice(draft.lines),
    issuedByName: typeof features.school_invoice_issued_by_name === 'string'
      ? features.school_invoice_issued_by_name
      : `${draft.org.name} administracija`,
    branding,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireConsultationsAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const body = (req.body || {}) as RequestBody;
  const organizationId = String(body.organizationId || '').trim();
  const gate = await assertOrgConsultationsEnabled(serviceSupabase(), organizationId);
  if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });
  if (!(await isOrgAdminForOrg(serviceSupabase(), auth.userId, organizationId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const draft = await loadDraft(body);
    const token = previewDigest(digestPayload(draft, auth.userId));
    const activities = draft.lines.map((line) => ({
      subjectId: line.subjectId,
      tutorId: line.tutorId,
      label: line.description,
      quantity: line.quantity,
      unitPriceEur: line.unitPriceEur,
      originalAmountEur: line.originalAmountEur,
    }));

    if (body.action === 'options') {
      return res.status(200).json({ ok: true, activities, reviewSessionIds: draft.reviewSessionIds });
    }
    if (body.action === 'preview') {
      const pdf = await renderDraftPdf(draft, 'PAM-PERŽIŪRA', true);
      return res.status(200).json({
        ok: true,
        previewToken: token,
        pdfBase64: Buffer.from(pdf).toString('base64'),
        student: { id: draft.student.id, fullName: draft.student.full_name, grade: draft.student.grade },
        periodLabel: periodLabel(draft.periodStart),
        dueDate: draft.dueDate,
        lines: draft.lines,
        activities,
        subtotalEur: draft.subtotalEur,
        discountAmountEur: draft.discountAmountEur,
        totalEur: draft.totalEur,
        reviewSessionIds: draft.reviewSessionIds,
      });
    }
    if (body.action !== 'send') return res.status(400).json({ error: 'Nežinomas veiksmas.' });
    if (!safeTokenEqual(String(body.previewToken || ''), token)) {
      return res.status(409).json({ error: 'Sąskaitos duomenys pasikeitė. Peržiūrėkite ją dar kartą.' });
    }

    const supabase = serviceSupabase();
    const { data: existing } = await supabase.from('school_monthly_invoices')
      .select('id, invoice_number').eq('student_id', draft.student.id)
      .eq('period_start', draft.periodStart).is('contract_id', null).maybeSingle();
    if (existing) return res.status(409).json({ error: `Šio laikotarpio sąskaita jau suformuota (${existing.invoice_number || existing.id}).` });

    const invoiceNumber = await allocateInvoiceNumber(supabase, draft.profile.id);
    const pdf = await renderDraftPdf(draft, invoiceNumber, false);
    const { data: invoice, error: invoiceError } = await supabase.from('school_monthly_invoices').insert({
      organization_id: draft.organizationId,
      contract_id: null,
      student_id: draft.student.id,
      period_start: draft.periodStart,
      period_end: draft.periodEnd,
      unit_price_eur: 0,
      base_lessons: 0,
      base_amount_eur: 0,
      extra_lessons: 0,
      extra_amount_eur: 0,
      subtotal_eur: draft.subtotalEur,
      discount_amount_eur: draft.discountAmountEur,
      discount_note: discountNotesForInvoice(draft.lines),
      total_eur: draft.totalEur,
      extra_session_ids: [],
      payment_status: 'pending',
      due_date: draft.dueDate,
      invoice_number: invoiceNumber,
    }).select('*').single();
    if (invoiceError || !invoice) throw new Error(invoiceError?.message || 'Nepavyko sukurti sąskaitos.');

    const lineRows = draft.lines.map((line, index) => ({
      invoice_id: invoice.id,
      sort_order: index,
      description: line.description,
      unit_price_eur: line.unitPriceEur,
      quantity: line.quantity,
      original_amount_eur: line.originalAmountEur,
      discount_type: line.discountType,
      discount_value: line.discountValue,
      discount_amount_eur: line.discountAmountEur,
      discount_note: line.discountNote,
      amount_eur: line.amountEur,
      source: line.source,
      consultation_id: null,
      session_id: line.sessionIds[0] || null,
      session_ids: line.sessionIds,
    }));
    const { error: lineError } = await supabase.from('school_monthly_invoice_lines').insert(lineRows);
    if (lineError) throw new Error(lineError.message);

    const storagePath = `school-monthly/${draft.organizationId}/${invoice.id}.pdf`;
    const { error: uploadError } = await supabase.storage.from('invoices')
      .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    await supabase.from('school_monthly_invoices').update({ pdf_path: storagePath }).eq('id', invoice.id);
    invoice.pdf_path = storagePath;

    const apiOrigin = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');
    const delivery = await sendSchoolMonthlyInvoiceEmail(supabase, invoice, {
      apiOrigin,
      publicOrigin: publicAppOrigin(),
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      student: draft.student,
      org: draft.org,
      contract: {},
      lines: lineRows,
    });
    return res.status(delivery.sent || delivery.alreadySent ? 200 : 202).json({
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber,
      emailSent: Boolean(delivery.sent || delivery.alreadySent),
      deliveryReason: delivery.reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nepavyko suformuoti sąskaitos.';
    return res.status(400).json({ error: message });
  }
}
