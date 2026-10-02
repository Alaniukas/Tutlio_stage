import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types';
import {
  assertSchoolMonthlyInvoiceEnabled,
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
import { groupOccurrenceKey, hasSchoolOccurrenceEvidence, schoolInvoiceDueDate } from '../src/lib/schoolCanonicalBilling.js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { wallClockToUtc } from './_lib/recurringOccurrences.js';
import { fetchAllRows } from '../src/lib/fetchAllRows.js';
import { latestSchoolBillingDecisions, resolveSchoolInvoiceUnitPrice, reviewSchoolInvoiceSession, schoolInvoiceSessionActivityName, schoolInvoiceSessionMatchesContract, type SchoolInvoiceReviewSession } from '../src/lib/schoolInvoiceSessionReview.js';
import { orgStudentIdentityGroupKey } from '../src/lib/orgStudentIdentity.js';
import { groupSchoolPayerInvoicePreviews, schoolPayerKey, schoolStudentInvoiceSendable } from '../src/lib/schoolPayerInvoiceGroups.js';
import { sessionYmdVilnius } from '../src/lib/schoolExtraLessonsBilling.js';

type RequestBody = {
  action?: 'options' | 'review' | 'billing-decision' | 'preview' | 'send' | 'batch-preview' | 'send-batch';
  organizationId?: string;
  studentId?: string;
  /** Optional multi-student review (legacy); batch send merges siblings by payer. */
  studentIds?: string[];
  payerKey?: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  previewToken?: string;
  previewTokens?: Record<string, string>;
  payerPreviewTokens?: Record<string, string>;
  sessionId?: string;
  excluded?: boolean;
  reason?: string;
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
  sessions: SchoolInvoiceReviewSession[];
  /** Sibling student ids included in one payer-level S.F. */
  payerStudentIds?: string[];
  payerChildNames?: string[];
};

const SESSION_DETAIL_SELECT = 'id, subject_id, tutor_id, start_time, end_time, status, price, class_group_id, school_billing_kind, student_joined_at, tutor_joined_at, status_confirmed_at, cancelled_by, cancelled_at, cancellation_reason_code, is_complimentary, paid, payment_status, lesson_package_id, credit_applied_amount, class_group:school_class_groups(name), subject:subjects(name, price), tutor:profiles!sessions_tutor_id_fkey!inner(full_name,organization_id)';

function composePayerDraft(drafts: DraftContext[]): DraftContext {
  const sorted = [...drafts].sort((a, b) => String(a.student.full_name || '').localeCompare(String(b.student.full_name || ''), 'lt'));
  const primary = sorted.find((row) => String(row.student.payer_email || '').trim()) || sorted[0];
  const lines = sorted.flatMap((row) => row.lines);
  const sessions = sorted.flatMap((row) => row.sessions);
  const reviewSessionIds = [...new Set(sorted.flatMap((row) => row.reviewSessionIds))];
  const payerChildNames = sorted.map((row) => String(row.student.full_name || '')).filter(Boolean);
  return {
    ...primary,
    lines,
    sessions,
    reviewSessionIds,
    subtotalEur: invoiceLinesSubtotal(lines),
    discountAmountEur: invoiceLinesDiscountTotal(lines),
    totalEur: invoiceLinesTotal(lines),
    payerStudentIds: sorted.map((row) => row.student.id),
    payerChildNames,
  };
}

function composeDraftContext(input: {
  organizationId: string;
  studentIds: string[];
  studentsById: Map<string, any>;
  org: any;
  profile: any;
  sessions: any[];
  savedDiscounts: any[];
  storedContracts: any[];
  decisions: any[];
  invoices: any[];
  liveIndividualSubjectIds: Set<string>;
  groupEvidence: Set<string>;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}): DraftContext | null {
  const {
    organizationId, studentIds, studentsById, org, profile, sessions, savedDiscounts,
    storedContracts, decisions, invoices, liveIndividualSubjectIds, groupEvidence,
    periodStart, periodEnd, dueDate,
  } = input;
  const studentRecords = studentIds.map((id) => studentsById.get(id)).filter(Boolean);
  if (!studentRecords.length || !org) return null;
  const uniqueSessions = [...new Map(sessions.map((session) => [String(session.id), session])).values()];
  const student = studentRecords.find((row) => String(row.payer_email || '').trim())
    || studentRecords.find((row) => uniqueSessions.some((session) => session.student_id === row.id))
    || studentRecords[0];
  const contracts = (storedContracts || []).map((contract: any) => ({ ...contract,
    missingIndividualSubject: contract.signing_status === 'signed'
      && contract.order_snapshot?.service_type === 'individual'
      && !liveIndividualSubjectIds.has(String(contract.order_snapshot?.subject_id || '')),
  }));
  const latestDecisions = latestSchoolBillingDecisions(decisions || []);
  const invoiced = new Set<string>((invoices || []).flatMap((invoice: any) => [
    ...(invoice.billed_session_ids || []), ...(invoice.extra_session_ids || []),
    ...(invoice.lines || []).flatMap((line: any) => [line.session_id, ...(line.session_ids || [])].filter(Boolean)),
  ]));
  const contractInvoices = (invoices || []).filter((invoice: any) => invoice.contract_id
    && (invoice.billing_model !== 'actual' || !(invoice.billed_session_ids || []).length));
  const reviewSessions = (uniqueSessions || []).map((session: any) => {
    const coveredByContractInvoice = contractInvoices.some((invoice: any) => {
      const contract = (contracts || []).find((row: any) => row.id === invoice.contract_id);
      const day = sessionYmdVilnius(session.start_time);
      return contract && schoolInvoiceSessionMatchesContract(session, contract)
        && day >= invoice.period_start && day <= invoice.period_end;
    });
    return reviewSchoolInvoiceSession({ ...session,
      group_occurred: Boolean(session.class_group_id) && groupEvidence.has(groupOccurrenceKey(session)),
    }, contracts || [], latestDecisions.get(session.id), invoiced.has(session.id) || coveredByContractInvoice, Date.now(), String(student.full_name || ''));
  });
  const reviewById = new Map(reviewSessions.map((row) => [row.id, row]));
  const reviewSessionIds: string[] = [];
  const billable = (uniqueSessions || []).flatMap((session: any) => {
    const review = reviewById.get(session.id);
    if (!review?.included) {
      if (review && ['unconfirmed', 'contract_review'].includes(review.reason)) reviewSessionIds.push(session.id);
      return [];
    }
    const sessionStudent = studentsById.get(String(session.student_id || '')) || student;
    const sessionContracts = contracts;
    const tutor = Array.isArray(session.tutor) ? session.tutor[0] : session.tutor;
    const subjectId = String(session.subject_id || session.class_group_id || '').trim();
    if (!subjectId) return [];
    return [{
      id: String(session.id),
      studentId: String(sessionStudent.id),
      studentName: String(sessionStudent.full_name || ''),
      classGroupId: session.class_group_id || null,
      subjectId,
      subjectName: schoolInvoiceSessionActivityName(session, sessionContracts, sessionStudent.full_name),
      tutorId: String(session.tutor_id || ''),
      tutorName: String(tutor?.full_name || 'mokytojas'),
      unitPriceEur: resolveSchoolInvoiceUnitPrice(session, sessionContracts),
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
  if (!reviewSessions.length) return null;
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
    sessions: reviewSessions,
    payerStudentIds: studentIds,
  };
}

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
  const organizationId = String(body.organizationId || '').trim();
  const periodStart = String(body.periodStart || '').slice(0, 10);
  const periodEnd = String(body.periodEnd || '').slice(0, 10);
  const studentIds = [...new Set([
    ...(body.studentIds || []).map(String).filter(Boolean),
    String(body.studentId || '').trim(),
  ].filter(Boolean))];
  if (!organizationId || !studentIds.length || !YMD.test(periodStart) || !YMD.test(periodEnd) || periodEnd < periodStart) {
    throw new Error('Pasirinkite mokinį ir teisingą sąskaitos laikotarpį.');
  }
  const { drafts } = await loadBatchDrafts(body, studentIds);
  const draft = drafts.find((row) => studentIds.some((id) => (
    id === row.student.id || (row.payerStudentIds || []).includes(id)
  )));
  if (!draft) throw new Error('Mokinys arba mokykla nerasta.');
  return draft;
}

const SESSION_SELECT = `${SESSION_DETAIL_SELECT.replace('subject_id,', 'student_id, subject_id,')}`;

async function loadBatchDrafts(body: RequestBody, onlyStudentIds?: string[]): Promise<{ drafts: DraftContext[] }> {
  const organizationId = String(body.organizationId || '').trim();
  const periodStart = String(body.periodStart || '').slice(0, 10);
  const periodEnd = String(body.periodEnd || '').slice(0, 10);
  if (!organizationId || !YMD.test(periodStart) || !YMD.test(periodEnd) || periodEnd < periodStart) {
    throw new Error('Pasirinkite teisingą sąskaitos laikotarpį.');
  }
  const dueDate = YMD.test(String(body.dueDate || ''))
    ? String(body.dueDate).slice(0, 10)
    : schoolInvoiceDueDate(new Date());
  const supabase = serviceSupabase();
  const fromIso = wallClockToUtc(periodStart, '00:00:00').toISOString();
  const untilIso = new Date(wallClockToUtc(periodEnd, '23:59:59').getTime() + 999).toISOString();

  const sessionQuery = (from: number, to: number) => {
    let query = supabase.from('sessions').select(SESSION_SELECT)
      .eq('tutor.organization_id', organizationId)
      .gte('start_time', fromIso).lte('start_time', untilIso)
      .order('start_time').order('id').range(from, to);
    if (onlyStudentIds?.length) query = query.in('student_id', onlyStudentIds);
    return query;
  };
  const [orgRes, profileRes, allSessions] = await Promise.all([
    supabase.from('organizations')
      .select('id, name, email, logo_url, brand_color, brand_color_secondary, features, stripe_account_id, stripe_onboarding_complete')
      .eq('id', organizationId).maybeSingle(),
    supabase.from('invoice_profiles')
      .select('id, business_name, company_code, address, contact_email, contact_phone, bank_name, iban, invoice_series')
      .eq('organization_id', organizationId).maybeSingle(),
    fetchAllRows<any>(sessionQuery),
  ]);
  if (orgRes.error) throw new Error(orgRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);
  const org = orgRes.data;
  const profile = profileRes.data;
  if (!org) throw new Error('Mokykla nerasta.');

  const studentIds = onlyStudentIds?.length
    ? onlyStudentIds
    : [...new Set((allSessions || []).map((row) => String(row.student_id || '')).filter(Boolean))];
  if (!studentIds.length) return { drafts: [] };

  const [studentsRes, discountsRes, contractsRes, decisionsRes, invoicesRes] = await Promise.all([
    supabase.from('students')
      .select('id, organization_id, full_name, grade, email, phone, payer_name, payer_email, payer_phone')
      .in('id', studentIds).eq('organization_id', organizationId),
    supabase.from('student_lesson_discounts')
      .select('student_id, subject_id, tutor_id, percent, discount_type, amount_eur, valid_from, valid_until, note, created_at')
      .in('student_id', studentIds).eq('organization_id', organizationId)
      .lte('valid_from', periodEnd)
      .or(`valid_until.is.null,valid_until.gte.${periodStart}`)
      .order('created_at', { ascending: false }),
    supabase.from('school_contracts')
      .select('id, student_id, class_group_id, signing_status, accepted_at, withdrawal_requested_at, terminated_at, start_within_14_status, start_within_14_days, unit_price_eur, order_snapshot, suspension_started_at, suspension_until, suspension_resumed_at')
      .in('student_id', studentIds).eq('organization_id', organizationId).eq('kind', 'extra_lessons'),
    supabase.from('school_session_billing_decisions')
      .select('id, student_id, session_reference_id, excluded, reason, created_at')
      .in('student_id', studentIds).eq('organization_id', organizationId).order('id', { ascending: false }),
    supabase.from('school_monthly_invoices')
      .select('id, student_id, contract_id, period_start, period_end, billing_model, billed_session_ids, extra_session_ids, lines:school_monthly_invoice_lines(session_id,session_ids)')
      .in('student_id', studentIds).eq('organization_id', organizationId).neq('payment_status', 'cancelled'),
  ]);
  for (const result of [studentsRes, discountsRes, contractsRes, decisionsRes, invoicesRes]) if (result.error) {
    throw new Error(result.error.message.includes('school_session_billing_decisions')
      ? 'Lankomumo ir sąskaitos peržiūrai pirmiausia reikia pritaikyti duomenų bazės migraciją.'
      : result.error.message);
  }

  const studentsById = new Map((studentsRes.data || []).map((row: any) => [String(row.id), row]));
  const allowedStudentIds = new Set(studentIds);
  const sessions = (allSessions || []).filter((row) => allowedStudentIds.has(String(row.student_id || '')));
  const discounts = discountsRes.data || [];
  const contracts = contractsRes.data || [];
  const decisions = decisionsRes.data || [];
  const invoices = invoicesRes.data || [];

  const individualSubjectIds = [...new Set(contracts
    .filter((contract: any) => contract.signing_status === 'signed' && contract.order_snapshot?.service_type === 'individual')
    .map((contract: any) => String(contract.order_snapshot?.subject_id || '')).filter(Boolean))];
  const liveIndividualSubjectIds = new Set<string>();
  if (individualSubjectIds.length) {
    const { data: subjects, error } = await supabase.from('subjects')
      .select('id, tutor:profiles!subjects_tutor_id_fkey!inner(organization_id)')
      .eq('tutor.organization_id', organizationId).in('id', individualSubjectIds);
    if (error) throw new Error(error.message);
    for (const subject of subjects || []) liveIndividualSubjectIds.add(subject.id);
  }

  const groupIds = [...new Set(sessions.map((session: any) => session.class_group_id).filter(Boolean))];
  let groupEvidence = new Set<string>();
  if (groupIds.length) {
    const groupSessions = await fetchAllRows<any>((from, to) => supabase.from('sessions')
      .select('id, class_group_id, start_time, status, student_joined_at, tutor_joined_at, status_confirmed_at, tutor:profiles!sessions_tutor_id_fkey!inner(organization_id)')
      .eq('tutor.organization_id', organizationId).in('class_group_id', groupIds)
      .gte('start_time', fromIso).lte('start_time', untilIso)
      .order('start_time').order('id').range(from, to));
    groupEvidence = new Set((groupSessions || []).filter(hasSchoolOccurrenceEvidence).map(groupOccurrenceKey));
  }

  const drafts = [...groupStudentIdsByIdentity(studentsById, studentIds).values()].map((ids) => composeDraftContext({
    organizationId,
    studentIds: ids,
    studentsById,
    org,
    profile,
    sessions: sessions.filter((row) => ids.includes(String(row.student_id || ''))),
    savedDiscounts: discounts.filter((row: any) => ids.includes(String(row.student_id || ''))),
    storedContracts: contracts.filter((row: any) => ids.includes(String(row.student_id || ''))),
    decisions: decisions.filter((row: any) => ids.includes(String(row.student_id || ''))),
    invoices: invoices.filter((row: any) => ids.includes(String(row.student_id || ''))),
    liveIndividualSubjectIds,
    groupEvidence,
    periodStart,
    periodEnd,
    dueDate,
  })).filter((draft): draft is DraftContext => Boolean(draft));

  return { drafts };
}

function groupStudentIdsByIdentity(studentsById: Map<string, any>, studentIds: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const id of studentIds) {
    const row = studentsById.get(id);
    if (!row) continue;
    const key = orgStudentIdentityGroupKey({
      id: row.id,
      organization_id: row.organization_id,
      full_name: row.full_name,
      payer_email: row.payer_email,
      email: row.email,
      linked_user_id: null,
    });
    const list = groups.get(key) || [];
    if (!list.includes(id)) list.push(id);
    groups.set(key, list);
  }
  return groups;
}

function digestPayload(draft: DraftContext, userId: string) {
  return {
    userId,
    organizationId: draft.organizationId,
    studentId: draft.student.id,
    payerStudentIds: draft.payerStudentIds || [draft.student.id],
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    dueDate: draft.dueDate,
    payerEmail: String(draft.student.payer_email || '').trim(),
    sessions: draft.sessions.map((session) => ({ id: session.id, status: session.status,
      statusConfirmedAt: session.statusConfirmedAt, reason: session.reason, decisionId: session.decisionId })),
    lines: draft.lines.map((line) => ({
      studentId: line.studentId,
      subjectId: line.subjectId,
      description: line.description,
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
    studentName: (draft.payerChildNames?.length ? draft.payerChildNames : [draft.student.full_name]).join(', '),
    grade: draft.payerChildNames?.length ? null : draft.student.grade,
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
      email: draft.student.payer_email || '',
      phone: draft.student.payer_phone || draft.student.phone,
    },
    lines: draft.lines.map((line) => pdfLine(line, line.studentName || draft.student.full_name)),
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

async function issueAndSendDraft(draft: DraftContext, userId: string, previewToken: string) {
  if (!draft.profile) throw new Error('Pirmiausia užpildykite mokyklos sąskaitų rekvizitus.');
  if (!draft.lines.length) throw new Error('Pasirinktu laikotarpiu nėra patvirtintų apmokestinamų užsiėmimų. Peržiūrėkite lankomumą.');
  if (draft.reviewSessionIds.length) {
    throw new Error('Prieš išsiunčiant patvirtinkite peržiūros laukiančių užsiėmimų įvykimą arba neįtraukite jų į sąskaitą ir nurodykite priežastį.');
  }
  if (!String(draft.student.payer_email || '').trim()) {
    throw new Error('Mokėtojo el. paštas nenurodytas. Pridėkite jį mokinio kortelėje; sąskaita vaikui nesiunčiama.');
  }
  const token = previewDigest(digestPayload(draft, userId));
  if (!safeTokenEqual(String(previewToken || ''), token)) {
    throw new Error('Sąskaitos duomenys pasikeitė. Peržiūrėkite ją dar kartą.');
  }
  const supabase = serviceSupabase();
  const invoiceStudentIds = draft.payerStudentIds?.length ? draft.payerStudentIds : [draft.student.id];
  const { data: existingRows, error: existingError } = await supabase.from('school_monthly_invoices')
    .select('id, invoice_number, student_id').in('student_id', invoiceStudentIds)
    .eq('organization_id', draft.organizationId).eq('period_start', draft.periodStart)
    .is('contract_id', null).neq('payment_status', 'cancelled');
  if (existingError) throw new Error(existingError.message);
  const existing = (existingRows || [])[0];
  if (existing) throw new Error(`Šio laikotarpio sąskaita jau suformuota (${existing.invoice_number || existing.id}).`);
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
    billing_model: 'actual',
    billed_session_ids: draft.lines.flatMap((line) => line.sessionIds),
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
  return {
    invoiceId: invoice.id,
    invoiceNumber,
    emailSent: Boolean(delivery.sent || delivery.alreadySent),
    deliveryReason: delivery.reason,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireConsultationsAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const body = (req.body || {}) as RequestBody;
  const organizationId = String(body.organizationId || '').trim();
  const gate = await assertSchoolMonthlyInvoiceEnabled(serviceSupabase(), organizationId);
  if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });
  const accessResult = await requireOrgAdminAccess(req, serviceSupabase(), 'finance.view');
  if (accessResult.ok === false) return res.status(accessResult.status).json({ error: accessResult.error });
  const access = accessResult.access;
  if (access.organizationId !== organizationId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const canEditBilling = hasOrgAdminPermission(access.role, access.permissions, 'finance.edit');
  const canEditAttendance = hasOrgAdminPermission(access.role, access.permissions, 'sessions.edit');
  if (['send', 'send-batch', 'billing-decision'].includes(body.action || '') && !canEditBilling) {
    return res.status(403).json({ error: 'Insufficient organization permission' });
  }

  try {
    if (body.action === 'batch-preview' || body.action === 'send-batch') {
      const { drafts } = await loadBatchDrafts(body);
      const students = drafts.map((draft) => {
        const alreadyIssued = draft.sessions.some((session) => session.alreadyInvoiced) && !draft.lines.length
          ? true
          : false;
        const issuedForPeriod = !draft.lines.length && draft.sessions.every((session) => session.alreadyInvoiced || session.reason === 'already_invoiced');
        const row = {
          studentId: draft.student.id,
          fullName: String(draft.student.full_name || ''),
          grade: draft.student.grade || null,
          totalEur: draft.totalEur,
          lessonCount: draft.lines.reduce((sum, line) => sum + line.quantity, 0),
          reviewSessionIds: draft.reviewSessionIds,
          reviewReasons: [...new Set(draft.sessions.flatMap((session) => (
            session.reason === 'unconfirmed' || session.reason === 'contract_review' ? [session.reason] : []
          )))],
          alreadyIssued: issuedForPeriod || alreadyIssued,
          payerEmail: String(draft.student.payer_email || '').trim(),
          payerName: String(draft.student.payer_name || draft.student.full_name || ''),
          previewToken: previewDigest(digestPayload(draft, auth.userId)),
        };
        return { draft, row };
      });
      const payers = groupSchoolPayerInvoicePreviews(students.map((item) => item.row)).map((group) => {
        const sendableDrafts = group.sendableStudentIds
          .map((studentId) => students.find((item) => item.row.studentId === studentId)?.draft)
          .filter((draft): draft is DraftContext => Boolean(draft));
        const payerPreviewToken = sendableDrafts.length
          ? previewDigest(digestPayload(composePayerDraft(sendableDrafts), auth.userId))
          : undefined;
        return { ...group, payerPreviewToken };
      });
      if (body.action === 'batch-preview') {
        return res.status(200).json({
          ok: true,
          organizationName: drafts[0]?.org.name || '',
          periodStart: drafts[0]?.periodStart || body.periodStart,
          periodEnd: drafts[0]?.periodEnd || body.periodEnd,
          dueDate: drafts[0]?.dueDate || body.dueDate,
          canEditBilling,
          payers,
        });
      }
      if (!drafts[0]?.profile) throw new Error('Pirmiausia užpildykite mokyklos sąskaitų rekvizitus.');
      const childTokens = body.previewTokens || {};
      const payerTokens = body.payerPreviewTokens || {};
      const payerKeyFilter = String(body.payerKey || '').trim();
      const targetPayers = payers.filter((group) => !payerKeyFilter || group.payerKey === payerKeyFilter);
      const sent: Array<{ payerKey: string; studentIds: string[]; invoiceNumber: string; emailSent: boolean; payerEmail: string }> = [];
      const skipped: Array<{ studentId: string; error: string }> = [];
      if (payerKeyFilter && !targetPayers.length) {
        for (const studentId of Object.keys(childTokens)) {
          skipped.push({
            studentId,
            error: 'Mokėtojas arba sąskaitos duomenys pasikeitė. Peržiūrėkite ją dar kartą.',
          });
        }
      }
      if (!targetPayers.length && !skipped.length) throw new Error('Nėra paruoštų sąskaitų siuntimui. Patikrinkite mokėtojus ir lankomumą.');
      for (const group of targetPayers) {
        const sendableItems = group.students
          .map((row) => ({ row, draft: students.find((item) => item.row.studentId === row.studentId)?.draft }))
          .filter((item): item is { row: typeof group.students[number]; draft: DraftContext } => Boolean(item.draft));
        const readyItems = sendableItems.filter((item) => (
          schoolStudentInvoiceSendable(item.row) && Boolean(childTokens[item.row.studentId])
        ));
        if (!readyItems.length) {
          for (const item of sendableItems) {
            const error = item.row.reviewSessionIds.length
              ? 'Prieš išsiunčiant patvirtinkite peržiūros laukiančių užsiėmimų įvykimą arba neįtraukite jų į sąskaitą ir nurodykite priežastį.'
              : item.row.alreadyIssued
                ? 'Šio laikotarpio sąskaita jau suformuota.'
                : !String(item.row.payerEmail || '').trim()
                  ? 'Mokėtojo el. paštas nenurodytas. Pridėkite jį mokinio kortelėje; sąskaita vaikui nesiunčiama.'
                  : 'Pasirinktu laikotarpiu nėra patvirtintų apmokestinamų užsiėmimų. Peržiūrėkite lankomumą.';
            skipped.push({ studentId: item.row.studentId, error });
          }
          continue;
        }
        const blockedItems = sendableItems.filter((item) => !schoolStudentInvoiceSendable(item.row));
        for (const item of blockedItems) {
          skipped.push({
            studentId: item.row.studentId,
            error: item.row.reviewSessionIds.length
              ? 'Prieš išsiunčiant patvirtinkite peržiūros laukiančių užsiėmimų įvykimą arba neįtraukite jų į sąskaitą ir nurodykite priežastį.'
              : item.row.alreadyIssued
                ? 'Šio laikotarpio sąskaita jau suformuota.'
                : 'Pasirinktu laikotarpiu nėra patvirtintų apmokestinamų užsiėmimų. Peržiūrėkite lankomumą.',
          });
        }
        for (const item of readyItems) {
          const childToken = String(childTokens[item.row.studentId] || '');
          if (!childToken || !safeTokenEqual(childToken, previewDigest(digestPayload(item.draft, auth.userId)))) {
            skipped.push({
              studentId: item.row.studentId,
              error: 'Sąskaitos duomenys pasikeitė. Peržiūrėkite ją dar kartą.',
            });
          }
        }
        if (readyItems.some((item) => skipped.some((row) => row.studentId === item.row.studentId))) continue;
        const mergedDraft = composePayerDraft(readyItems.map((item) => item.draft));
        const previewToken = String(payerTokens[group.payerKey] || group.payerPreviewToken || '');
        if (!previewToken) {
          for (const item of readyItems) {
            skipped.push({
              studentId: item.row.studentId,
              error: 'Sąskaitos duomenys pasikeitė. Peržiūrėkite ją dar kartą.',
            });
          }
          continue;
        }
        try {
          const result = await issueAndSendDraft(mergedDraft, auth.userId, previewToken);
          sent.push({
            payerKey: group.payerKey,
            studentIds: readyItems.map((item) => item.row.studentId),
            invoiceNumber: result.invoiceNumber,
            emailSent: result.emailSent,
            payerEmail: group.payerEmail,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Nepavyko išsiųsti sąskaitos.';
          for (const item of readyItems) skipped.push({ studentId: item.row.studentId, error: message });
        }
      }
      return res.status(sent.length ? 200 : 400).json({
        ok: sent.length > 0,
        sentCount: sent.length,
        skippedCount: skipped.length,
        sent,
        skipped,
      });
    }

    const draft = await loadDraft(body);
    const reviewData = (current: DraftContext) => ({
      ok: true,
      // Historical pre-service lessons do not need attendance decisions in this invoice.
      sessions: current.sessions.filter((session) => session.reason !== 'outside_contract'),
      payerEmail: String(current.student.payer_email || '').trim(),
      organizationName: current.org.name || '',
      canEditAttendance,
      canEditBilling,
      reviewSessionIds: current.reviewSessionIds,
    });
    if (body.action === 'billing-decision') {
      const reason = String(body.reason || '').trim();
      if (typeof body.excluded !== 'boolean' || reason.length < 3 || reason.length > 1000) {
        return res.status(400).json({ error: 'Nurodykite 3–1000 simbolių neįtraukimo arba grąžinimo priežastį.' });
      }
      const session = draft.sessions.find((row) => row.id === body.sessionId);
      if (!session) return res.status(404).json({ error: 'Užsiėmimas pasirinktam mokiniui ir laikotarpiui nerastas.' });
      if (session.alreadyInvoiced) return res.status(409).json({ error: 'Užsiėmimas jau įtrauktas į išrašytą sąskaitą. Reikia atskiro sąskaitos koregavimo.' });
      if (!Number.isFinite(Date.parse(session.endTime)) || Date.parse(session.endTime) > Date.now()) {
        return res.status(409).json({ error: 'Užsiėmimas dar nesibaigė.' });
      }
      const { error } = await serviceSupabase().from('school_session_billing_decisions').insert({
        organization_id: organizationId,
        student_id: draft.student.id,
        session_id: session.id,
        session_reference_id: session.id,
        session_start_time: session.startTime,
        excluded: body.excluded,
        reason,
        created_by: auth.userId,
      });
      if (error) throw new Error(error.message);
      return res.status(200).json(reviewData(await loadDraft(body)));
    }
    if (body.action === 'review') return res.status(200).json(reviewData(draft));
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
      return res.status(200).json({ ...reviewData(draft), activities });
    }
    if (!draft.profile) throw new Error('Pirmiausia užpildykite mokyklos sąskaitų rekvizitus.');
    if (!draft.lines.length) throw new Error('Pasirinktu laikotarpiu nėra patvirtintų apmokestinamų užsiėmimų. Peržiūrėkite lankomumą.');
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
        ...reviewData(draft),
      });
    }
    if (body.action !== 'send') return res.status(400).json({ error: 'Nežinomas veiksmas.' });
    try {
      const result = await issueAndSendDraft(draft, auth.userId, String(body.previewToken || ''));
      return res.status(result.emailSent ? 200 : 202).json({
        ok: true,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        emailSent: result.emailSent,
        deliveryReason: result.deliveryReason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nepavyko išsiųsti sąskaitos.';
      const conflict = /pasikeitė|jau suformuota|patvirtinkite/i.test(message);
      return res.status(conflict ? 409 : 400).json({ error: message });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nepavyko suformuoti sąskaitos.';
    return res.status(400).json({ error: message });
  }
}
