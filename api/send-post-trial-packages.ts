// GET|POST /api/send-post-trial-packages (cron)
//
// Org feature post_trial_auto_package: after a trial lesson completes, build
// the student's monthly package from their recurring schedule (per-subject
// lesson counts × dynamic pricing) and email the payer the payment link. The
// created recurring_monthly_package_plans row (auto_from_schedule=true) then
// keeps generating subsequent months via /api/generate-monthly-packages; the
// admin can annul/edit/stop it from the student card.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { buildRollingOccurrenceDates } from './_lib/recurringOccurrences.js';
import { endOfMonthYmd, nextMonthFirstYmd } from '../src/lib/monthlyPackagePlan.js';
import { resolveOrganizationLessonPrice } from '../src/lib/organizationDynamicPricing.js';
import { getOrgOwnerUserId } from './_lib/orgAdminAccess.js';
import { proKlaseFeatureEnabledForOrgRecord } from '../src/lib/orgIntakeMode.js';

const TRIAL_LOOKBACK_DAYS = 14;

function ymdInVilnius(value = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function apiOrigin(req: VercelRequest): string {
  const vercelUrl = String(process.env.VERCEL_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (vercelUrl) return `https://${vercelUrl}`;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/$/, '') : '';
  return origin || String(process.env.APP_URL || process.env.VITE_APP_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
}

function parseGrade(raw: unknown): number | null {
  const num = parseInt(String(raw ?? ''), 10);
  if (!Number.isInteger(num) || num < 1 || num > 12) return null;
  return num;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase server configuration' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const origin = apiOrigin(req);

  const since = new Date(Date.now() - TRIAL_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: trialRows, error } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, end_time, subjects!inner(is_trial)')
    .eq('subjects.is_trial', true)
    .eq('status', 'completed')
    .gte('end_time', since)
    .lte('end_time', new Date().toISOString())
    .order('end_time', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  // One candidate per (tutor, student) pair — most recent trial wins.
  const candidateByPair = new Map<string, { sessionId: string; tutorId: string; studentId: string; endTime: string }>();
  for (const row of trialRows || []) {
    const key = `${row.tutor_id}|${row.student_id}`;
    if (!candidateByPair.has(key)) {
      candidateByPair.set(key, {
        sessionId: row.id as string,
        tutorId: row.tutor_id as string,
        studentId: row.student_id as string,
        endTime: String(row.end_time),
      });
    }
  }
  if (candidateByPair.size === 0) {
    return res.status(200).json({ success: true, sent: 0, skipped: 0 });
  }

  // Resolve tutor orgs + org features once.
  const tutorIds = [...new Set([...candidateByPair.values()].map((c) => c.tutorId))];
  const { data: tutorRows } = await supabase
    .from('profiles')
    .select('id, organization_id')
    .in('id', tutorIds);
  const orgByTutor = new Map((tutorRows || []).map((t: any) => [t.id as string, (t.organization_id as string | null) ?? null]));
  const orgIds = [...new Set([...orgByTutor.values()].filter(Boolean))] as string[];
  const { data: orgRows } = orgIds.length > 0
    ? await supabase.from('organizations').select('id, features, entity_type').in('id', orgIds)
    : { data: [] as any[] };
  const orgFeatures = new Map<string, Record<string, unknown>>();
  const orgEntityType = new Map<string, string | null>();
  for (const org of orgRows || []) {
    const feat = (org as any).features;
    orgFeatures.set(
      (org as any).id as string,
      feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {},
    );
    orgEntityType.set((org as any).id as string, (org as any).entity_type ?? null);
  }

  let sent = 0;
  let skipped = 0;
  const failures: Array<{ pair: string; error: string }> = [];
  const todayYmd = ymdInVilnius();

  for (const candidate of candidateByPair.values()) {
    const pairLabel = `${candidate.tutorId}|${candidate.studentId}`;
    const orgId = orgByTutor.get(candidate.tutorId) ?? null;
    const features = orgId ? orgFeatures.get(orgId) : undefined;
    const entityType = orgId ? orgEntityType.get(orgId) : null;
    if (!orgId || !features || !proKlaseFeatureEnabledForOrgRecord(orgId, orgEntityType.get(orgId), features, 'post_trial_auto_package')) {
      skipped += 1;
      continue;
    }

    try {
      const [{ data: student }, { data: existingPlan }, { data: templates }] = await Promise.all([
        supabase
          .from('students')
          .select('id, grade, pricing_lessons_per_week, detached_at')
          .eq('id', candidate.studentId)
          .maybeSingle(),
        supabase
          .from('recurring_monthly_package_plans')
          .select('id')
          .eq('tutor_id', candidate.tutorId)
          .eq('student_id', candidate.studentId)
          .eq('active', true)
          .eq('auto_from_schedule', true)
          .maybeSingle(),
        supabase
          .from('recurring_individual_sessions')
          .select('id, subject_id, start_date, end_date, start_time, end_time, frequency')
          .eq('tutor_id', candidate.tutorId)
          .eq('student_id', candidate.studentId)
          .eq('active', true),
      ]);

      if (!student || student.detached_at || existingPlan) {
        skipped += 1;
        continue;
      }

      // Already offered/bought a real package after the trial? Leave it to the
      // admin (trial_followup_alert covers the manual path).
      const { data: laterPackage } = await supabase
        .from('lesson_packages')
        .select('id, subject_id, subjects(is_trial)')
        .eq('student_id', candidate.studentId)
        .gte('created_at', candidate.endTime)
        .neq('payment_status', 'cancelled')
        .limit(10);
      const hasRealPackage = (laterPackage || []).some((pkg: any) => {
        const subj = Array.isArray(pkg.subjects) ? pkg.subjects[0] : pkg.subjects;
        return subj?.is_trial !== true;
      });
      if (hasRealPackage) {
        skipped += 1;
        continue;
      }

      const periodStart = todayYmd;
      const periodEnd = endOfMonthYmd(periodStart);
      const activeTemplates = (templates || []).filter((tpl: any) =>
        tpl.subject_id &&
        String(tpl.start_date) <= periodEnd &&
        (!tpl.end_date || String(tpl.end_date) >= periodStart),
      );
      if (activeTemplates.length === 0) {
        skipped += 1;
        continue;
      }

      const countBySubject = new Map<string, number>();
      for (const tpl of activeTemplates) {
        const dates = buildRollingOccurrenceDates(tpl as any, periodStart, periodEnd);
        countBySubject.set(
          tpl.subject_id as string,
          (countBySubject.get(tpl.subject_id as string) || 0) + dates.length,
        );
      }

      const subjectIds = [...countBySubject.keys()];
      const [{ data: subjectRows }, { data: indivRows }, { data: rules }] = await Promise.all([
        supabase.from('subjects').select('id, price, is_group, is_trial').in('id', subjectIds),
        supabase
          .from('student_individual_pricing')
          .select('subject_id, price')
          .eq('student_id', candidate.studentId)
          .in('subject_id', subjectIds),
        supabase
          .from('organization_dynamic_pricing')
          .select('grade_min, grade_max, lessons_per_week, price')
          .eq('organization_id', orgId),
      ]);
      const subjectById = new Map((subjectRows || []).map((s: any) => [s.id as string, s]));
      const indivBySubject = new Map((indivRows || []).map((r: any) => [r.subject_id as string, Number(r.price)]));
      const normalizedRules = (rules || []).map((rule: any) => ({
        ...rule,
        grade_min: Number(rule.grade_min),
        grade_max: Number(rule.grade_max),
        lessons_per_week: Number(rule.lessons_per_week),
        price: Number(rule.price),
      }));

      const items: Array<{ subjectId: string; totalLessons: number; pricePerLesson: number }> = [];
      for (const [subjectId, count] of countBySubject) {
        if (count <= 0) continue;
        const subj = subjectById.get(subjectId);
        if (!subj || subj.is_group || subj.is_trial) continue;
        const pricePerLesson = resolveOrganizationLessonPrice({
          rules: normalizedRules,
          student: {
            grade: student.grade == null ? null : String(student.grade),
            pricing_lessons_per_week: student.pricing_lessons_per_week,
          },
          lessonsPerWeek: student.pricing_lessons_per_week ?? undefined,
          individualPrice: indivBySubject.get(subjectId) ?? null,
          fallbackPrice: Number(subj.price || 0),
        });
        items.push({ subjectId, totalLessons: count, pricePerLesson });
      }
      if (items.length === 0) {
        skipped += 1;
        continue;
      }

      const grade = parseGrade(student.grade);
      if (!grade) {
        failures.push({ pair: pairLabel, error: 'Student grade missing/unparseable — set the class first.' });
        continue;
      }
      const lessonsPerWeek = Math.min(7, Math.max(1, Number(student.pricing_lessons_per_week) || activeTemplates.length || 1));

      const ownerUserId = await getOrgOwnerUserId(supabase, orgId);
      if (!ownerUserId) {
        failures.push({ pair: pairLabel, error: 'Organization has no admin to own the plan.' });
        continue;
      }

      const manualPayments =
        features.manual_payments === true || features.enable_manual_student_payments === true;
      const paymentMethod: 'manual' | 'stripe' = manualPayments ? 'manual' : 'stripe';

      const { data: plan, error: planErr } = await supabase
        .from('recurring_monthly_package_plans')
        .insert({
          organization_id: orgId,
          created_by: ownerUserId,
          tutor_id: candidate.tutorId,
          student_id: candidate.studentId,
          subject_id: null,
          grade,
          lessons_per_week: lessonsPerWeek,
          payment_method: paymentMethod,
          attach_sales_invoice: true,
          active: true,
          auto_from_schedule: true,
          created_from_trial_session_id: candidate.sessionId,
          next_generation_date: nextMonthFirstYmd(periodStart),
          last_generated_period_start: periodStart,
          last_generated_period_end: periodEnd,
        })
        .select('id')
        .single();
      if (planErr || !plan) {
        // Unique index race = another run already created it.
        skipped += 1;
        continue;
      }

      const endpoint = paymentMethod === 'manual'
        ? '/api/create-manual-package'
        : '/api/create-package-checkout';
      const response = await fetch(`${origin}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': serviceRoleKey,
        },
        body: JSON.stringify({
          tutorId: candidate.tutorId,
          studentId: candidate.studentId,
          items,
          expiresAt: periodEnd,
          attachSalesInvoice: true,
          recurringPlanId: plan.id,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Roll the plan back so tomorrow's run retries cleanly.
        await supabase.from('recurring_monthly_package_plans').delete().eq('id', plan.id);
        failures.push({ pair: pairLabel, error: String((result as any).error || response.status) });
        continue;
      }

      sent += 1;
    } catch (err) {
      failures.push({ pair: pairLabel, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return res.status(failures.length > 0 ? 207 : 200).json({
    success: failures.length === 0,
    sent,
    skipped,
    failures,
  });
}
