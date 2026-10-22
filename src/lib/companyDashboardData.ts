import { addDays, endOfMonth, format, isAfter, isBefore, startOfMonth, subDays, type Locale } from 'date-fns';
import { supabase } from './supabase';
import { authHeaders } from './apiHelpers';
import { getOrgVisibleTutorsDeduped } from './orgVisibleTutors';
import { ORG_ADMIN_ORGANIZATION_SELECT, type OrgAdminOrganization } from './orgLookup';
import { orgDashboardMonthMetrics } from './orgDashboardMetrics';
import { allowsPerLessonPaymentForStudent } from './studentPaymentModel';
import { isProKlaseOrg } from './marketMoney';
import { isProKlaseAwaitingOutcomeConfirmation } from './proKlaseTutorPay';
import { isAttendanceFlagged } from './attendance';

export type TutorPay = { payment_timing: string; payment_deadline_hours: number | null; full_name: string };
export interface OrgSessionRow {
  id: string; tutor_id: string; student_id?: string; subject_id?: string | null; tutor_name?: string;
  start_time: string; end_time: string; status: string; paid: boolean; price: number | null; topic: string | null;
  payment_status?: string | null; meeting_link?: string | null; tutor_joined_at?: string | null;
  student_joined_at?: string | null; status_confirmed_at?: string | null;
  status_reminder_last_sent_at?: string | null; tutor_comment?: string | null;
  student?: { full_name: string; payment_model?: string | null } | null;
}
export interface OrgAttentionRow extends OrgSessionRow { reasons: Array<'payment' | 'attendance' | 'trial_no_package'> }
export interface RecentOrgPayment {
  id: string; type: 'lesson' | 'package' | 'invoice' | 'school_installment';
  title: string; subtitle: string; amount: number; paidAt: string;
}
export interface OverduePackage {
  id: string; studentId: string; studentName: string; totalPrice: number;
  billingPeriodStart: string | null; billingPeriodEnd: string | null;
}
export interface DashboardOverview {
  organizationId: string; orgIdForDismiss: string; orgName: string; entityType: 'company' | 'school';
  tutorLicenseCap: number; licensedTutors: number; activeTutors: number; pendingInvites: number;
  sessionsThisMonth: number; upcomingSessions: number; earningsThisMonth: number; earningsTotal: number;
  upcomingList: OrgSessionRow[]; cancelledList: OrgSessionRow[]; tutorPayEntries: Array<[string, TutorPay]>;
}
export interface DashboardSnapshot extends DashboardOverview {
  complete: true; financeTotalsAccess: boolean;
  attentionList: OrgAttentionRow[]; overduePackages: OverduePackage[]; recentPayments: RecentOrgPayment[];
}
type Translate = (key: string, params?: Record<string, string>) => string;
export interface DashboardLoadContext {
  overview: DashboardOverview; org: OrgAdminOrganization; tutorIds: string[]; rows: OrgSessionRow[];
  tutorMap: Map<string, TutorPay>; now: Date; t: Translate; dateFnsLocale: Locale;
}

/** Never turn a failed read into a successful zero/empty dashboard. */
async function read(query: any, signal: AbortSignal): Promise<any> {
  const result = await query.abortSignal(signal);
  signal.throwIfAborted();
  if (result.error) throw new Error(result.error.message || 'dashboard_read_failed');
  return result;
}
async function rowsByIds(table: 'students' | 'subjects', columns: string, ids: Array<string | null | undefined>, signal: AbortSignal) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return [];
  const { data } = await read(supabase.from(table).select(columns).in('id', unique), signal);
  return data || [];
}
async function packageSummary(kind: string, signal: AbortSignal) {
  const response = await fetch(`/api/proklase-student-packages?summary=${kind}`, { headers: await authHeaders(), signal });
  const result = await response.json();
  signal.throwIfAborted();
  if (!response.ok) throw new Error('dashboard_summary_failed');
  return result;
}

export async function loadDashboardOverview(
  organizationId: string, knownOrganization: OrgAdminOrganization | null | undefined,
  t: Translate, dateFnsLocale: Locale, signal: AbortSignal,
): Promise<DashboardLoadContext> {
  const [org, tutors, invites] = await Promise.all([
    knownOrganization ? Promise.resolve(knownOrganization) : read(supabase.from('organizations')
      .select(ORG_ADMIN_ORGANIZATION_SELECT).eq('id', organizationId).maybeSingle(), signal).then(result => {
        if (!result.data) throw new Error('dashboard_organization_missing');
        return result.data as OrgAdminOrganization;
      }),
    getOrgVisibleTutorsDeduped(supabase, organizationId,
      'id, full_name, email, has_active_license, payment_timing, payment_deadline_hours', { strict: true }),
    read(supabase.from('tutor_invites').select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId).eq('used', false), signal),
  ]);
  signal.throwIfAborted();
  const tutorIds = tutors.map(tutor => tutor.id);
  const tutorMap = new Map<string, TutorPay>(tutors.map(tutor => {
    const settings = tutor as typeof tutor & Partial<TutorPay>;
    return [tutor.id, { full_name: tutor.full_name || t('common.tutor'),
      payment_timing: settings.payment_timing || 'before_lesson', payment_deadline_hours: settings.payment_deadline_hours ?? 24 }];
  }));
  const now = new Date();
  const [metrics, sessions] = tutorIds.length ? await Promise.all([
    read(supabase.from('sessions')
      .select('price, status, payment_status, paid, start_time, end_time, is_complimentary, exclude_from_lesson_count')
      .in('tutor_id', tutorIds).gte('start_time', subDays(now, 730).toISOString()).neq('status', 'cancelled').limit(5000), signal),
    read(supabase.from('sessions')
      .select('id, tutor_id, student_id, subject_id, start_time, end_time, status, paid, price, topic, payment_status, meeting_link, tutor_joined_at, student_joined_at, status_confirmed_at, status_reminder_last_sent_at, tutor_comment')
      .in('tutor_id', tutorIds).gte('start_time', subDays(now, 30).toISOString()).order('start_time', { ascending: true }).limit(500), signal),
  ]) : [{ data: [] }, { data: [] }];
  // Separate reads avoid re-running nested profile/student RLS for every lesson.
  const students = await rowsByIds('students', 'id, full_name, payment_model',
    (sessions.data || []).map((row: OrgSessionRow) => row.student_id), signal);
  const studentMap = new Map(students.map((student: any) => [student.id, student]));
  const rows: OrgSessionRow[] = (sessions.data || []).map((row: OrgSessionRow) => ({ ...row,
    tutor_name: tutorMap.get(row.tutor_id)?.full_name || t('common.tutor'),
    student: studentMap.get(row.student_id) || null,
  }));
  const monthStart = startOfMonth(now).toISOString(), monthEnd = endOfMonth(now).toISOString();
  const month = orgDashboardMonthMetrics((metrics.data || []).filter((row: OrgSessionRow) => row.start_time >= monthStart && row.start_time <= monthEnd), now);
  const allowsIndividualPayment = (row: OrgSessionRow) => !!row.student && allowsPerLessonPaymentForStudent(
    row.student.payment_model, org.enable_per_lesson === true, org.enable_monthly_billing === true);
  return { org, tutorIds, tutorMap, rows, now, t, dateFnsLocale, overview: {
    organizationId, orgIdForDismiss: organizationId, orgName: org.name || '', entityType: org.entity_type === 'school' ? 'school' : 'company',
    tutorLicenseCap: Number(org.tutor_license_count) || 0, licensedTutors: tutors.filter(tutor => tutor.has_active_license !== false).length,
    activeTutors: tutorIds.length, pendingInvites: invites.count || 0,
    sessionsThisMonth: month.occurredCount, upcomingSessions: month.plannedCount, earningsThisMonth: month.paidRevenueEur,
    earningsTotal: orgDashboardMonthMetrics(metrics.data || [], now).paidRevenueEur,
    upcomingList: rows.filter(row => row.status === 'active' && (row.paid || !allowsIndividualPayment(row))
      && isAfter(new Date(row.end_time), now) && isBefore(new Date(row.start_time), addDays(now, 7)))
      .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time)).slice(0, 5),
    cancelledList: rows.filter(row => row.status === 'cancelled' && row.paid)
      .sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time)).slice(0, 5),
    tutorPayEntries: [...tutorMap.entries()],
  } };
}

export async function loadDashboardAttention(context: DashboardLoadContext, financeTotals: boolean, signal: AbortSignal) {
  const { overview, org, tutorIds, tutorMap, rows, now, t } = context;
  const proKlase = isProKlaseOrg(overview.organizationId);
  const trialEnabled = overview.entityType !== 'school' && proKlase && org.features?.trial_followup_alert === true;
  const [trialSummary, overdueSummary] = await Promise.all([
    trialEnabled ? packageSummary('trial-followup', signal) : null,
    proKlase && financeTotals ? packageSummary('overdue-packages', signal) : null,
  ]);
  if (trialSummary && !Array.isArray(trialSummary.studentIds)) throw new Error('dashboard_invalid_trial_summary');
  if (overdueSummary && !Array.isArray(overdueSummary.packages)) throw new Error('dashboard_invalid_overdue_summary');
  const attention = new Map<string, OrgAttentionRow>();
  const add = (row: OrgSessionRow, reason: OrgAttentionRow['reasons'][number]) => {
    const current = attention.get(row.id);
    if (current) { if (!current.reasons.includes(reason)) current.reasons.push(reason); }
    else attention.set(row.id, { ...row, reasons: [reason] });
  };
  for (const row of rows) {
    const recent = isAfter(new Date(row.start_time), subDays(now, 30));
    const pay = tutorMap.get(row.tutor_id);
    if (recent && pay && !row.paid && row.status !== 'cancelled' && row.student
      && allowsPerLessonPaymentForStudent(row.student.payment_model, org.enable_per_lesson === true, org.enable_monthly_billing === true)) {
      const deadline = pay.payment_timing === 'before_lesson'
        ? Date.parse(row.start_time) - (pay.payment_deadline_hours ?? 24) * 3600000
        : Date.parse(row.end_time) + (pay.payment_deadline_hours ?? 24) * 3600000;
      if (deadline <= now.getTime() + 6 * 3600000 || row.payment_status === 'paid_by_student') add(row, 'payment');
    }
    if (recent && (proKlase ? isProKlaseAwaitingOutcomeConfirmation(row, now) : isAttendanceFlagged(row, now))) add(row, 'attendance');
  }
  const needsPackage = new Set<string>(trialSummary?.studentIds || []);
  if (needsPackage.size && tutorIds.length) {
    const { data: subjects } = await read(supabase.from('subjects').select('id').in('tutor_id', tutorIds).eq('is_trial', true), signal);
    if (subjects?.length) {
      const { data: trials } = await read(supabase.from('sessions')
        .select('id, tutor_id, student_id, start_time, end_time, status, paid, price, topic, payment_status, meeting_link, tutor_joined_at, student_joined_at, status_confirmed_at, tutor_comment')
        .in('tutor_id', tutorIds).in('subject_id', subjects.map((subject: any) => subject.id)).eq('status', 'completed')
        .gte('start_time', subDays(now, 30).toISOString()).order('start_time', { ascending: false }).limit(200), signal);
      const students = await rowsByIds('students', 'id, full_name', (trials || []).map((row: OrgSessionRow) => row.student_id), signal);
      const names = new Map(students.map((student: any) => [student.id, student]));
      const seen = new Set<string>();
      for (const trial of trials || []) {
        if (!trial.student_id || seen.has(trial.student_id) || !needsPackage.has(trial.student_id)) continue;
        seen.add(trial.student_id);
        add({ ...trial, tutor_name: tutorMap.get(trial.tutor_id)?.full_name || t('common.tutor'), student: names.get(trial.student_id) || null }, 'trial_no_package');
      }
    }
  }
  return {
    overduePackages: (overdueSummary?.packages || []) as OverduePackage[],
    attentionList: [...attention.values()].sort((a, b) =>
      Number(!a.reasons.includes('attendance')) - Number(!b.reasons.includes('attendance'))
      || Number(!a.reasons.includes('trial_no_package')) - Number(!b.reasons.includes('trial_no_package'))
      || Number(b.payment_status === 'paid_by_student') - Number(a.payment_status === 'paid_by_student')
      || Date.parse(b.start_time) - Date.parse(a.start_time)).slice(0, 5),
  };
}

export async function loadDashboardPayments(context: DashboardLoadContext, financeTotals: boolean, signal: AbortSignal): Promise<RecentOrgPayment[]> {
  if (!financeTotals) return [];
  const { tutorIds, tutorMap, overview, t, dateFnsLocale } = context;
  const [lessons, packages, batches] = tutorIds.length ? await Promise.all([
    read(supabase.from('sessions').select('id, student_id, start_time, price, topic, tutor_id, subject_id, is_complimentary')
      .in('tutor_id', tutorIds).eq('paid', true).eq('is_complimentary', false).is('lesson_package_id', null)
      .is('payment_batch_id', null).neq('status', 'cancelled').order('start_time', { ascending: false }).limit(20), signal),
    read(supabase.from('lesson_packages').select('id, paid_at, price_per_lesson, total_price, total_lessons, tutor_id, student_id, subject_id')
      .in('tutor_id', tutorIds).eq('paid', true).not('paid_at', 'is', null).order('paid_at', { ascending: false }).limit(20), signal),
    read(supabase.from('billing_batches').select('id, paid_at, total_amount, period_start_date, period_end_date, payer_name, tutor_id')
      .in('tutor_id', tutorIds).eq('paid', true).not('paid_at', 'is', null).order('paid_at', { ascending: false }).limit(20), signal),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const { data: items } = packages.data?.length ? await read(supabase.from('lesson_package_items')
    .select('package_id, subject_id, position').in('package_id', packages.data.map((row: any) => row.id)).order('position'), signal) : { data: [] };
  const [students, subjects] = await Promise.all([
    rowsByIds('students', 'id, full_name', [...(lessons.data || []), ...(packages.data || [])].map(row => row.student_id), signal),
    rowsByIds('subjects', 'id, name, is_trial', [...(lessons.data || []), ...(packages.data || []), ...(items || [])].map(row => row.subject_id), signal),
  ]);
  const names = new Map<string, any>(students.map((row: any) => [row.id, row]));
  const topics = new Map<string, any>(subjects.map((row: any) => [row.id, row]));
  const result: RecentOrgPayment[] = [
    ...(lessons.data || []).map((row: any): RecentOrgPayment => ({
      id: `lesson_${row.id}`, type: 'lesson', title: `${names.get(row.student_id)?.full_name || t('common.student')} · ${tutorMap.get(row.tutor_id)?.full_name || ''}`.trim(),
      subtitle: `${format(new Date(row.start_time), 'd MMM', { locale: dateFnsLocale })}${topics.get(row.subject_id)?.is_trial ? ` · ${t('common.lesson')}` : ''}${row.topic ? ` · ${row.topic}` : ''}`,
      amount: Number(row.price || 0), paidAt: row.start_time,
    })),
    ...(packages.data || []).map((row: any): RecentOrgPayment => {
      const packageItems = (items || []).filter((item: any) => item.package_id === row.id);
      const subject = topics.get(row.subject_id);
      const label = packageItems.length > 1 ? packageItems.map((item: any) => topics.get(item.subject_id)?.name).filter(Boolean).join(', ')
        : subject?.name || topics.get(packageItems[0]?.subject_id)?.name || t('common.lesson');
      return { id: `package_${row.id}`, type: 'package',
        title: `${names.get(row.student_id)?.full_name || t('common.student')} · ${tutorMap.get(row.tutor_id)?.full_name || ''}`.trim(),
        subtitle: `${subject?.is_trial ? t('common.lesson') : `${row.total_lessons || 0} ${t('common.lessons').toLowerCase().slice(0, 4)}.`} · ${label}`,
        amount: Number(row.total_price || 0) || Number(row.price_per_lesson || 0) * Number(row.total_lessons || 0), paidAt: row.paid_at };
    }),
    ...(batches.data || []).map((row: any): RecentOrgPayment => ({ id: `invoice_${row.id}`, type: 'invoice', title: row.payer_name || t('common.student'),
      subtitle: `${t('invoice.invoiceTitle') || 'Invoice'} · ${row.period_start_date} – ${row.period_end_date}`, amount: Number(row.total_amount || 0), paidAt: row.paid_at })),
  ];
  // A company overview has no school installment section. Avoid its unrelated
  // nested RLS query entirely; school reads remain scoped to this organization.
  if (overview.entityType === 'school') {
    const { data: contracts } = await read(supabase.from('school_contracts').select('id, student_id').eq('organization_id', overview.organizationId), signal);
    if (contracts?.length) {
      const { data: installments } = await read(supabase.from('school_payment_installments').select('id, amount, paid_at, installment_number, contract_id')
        .in('contract_id', contracts.map((row: any) => row.id)).eq('payment_status', 'paid').not('paid_at', 'is', null).order('paid_at', { ascending: false }).limit(30), signal);
      const childIds = new Map(contracts.map((row: any) => [row.id, row.student_id]));
      const children = await rowsByIds('students', 'id, full_name', (installments || []).map((row: any) => childIds.get(row.contract_id) as string), signal);
      const childNames = new Map(children.map((row: any) => [row.id, row.full_name]));
      for (const row of installments || []) result.push({ id: `school_installment_${row.id}`, type: 'school_installment',
        title: childNames.get(childIds.get(row.contract_id)) as string || t('common.student'),
        subtitle: `${t('companyDash.recentSchoolInstallment')} · ${t('school.installments')} #${row.installment_number}`, amount: Number(row.amount || 0), paidAt: row.paid_at });
    }
  }
  return result.sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt)).slice(0, 5);
}
