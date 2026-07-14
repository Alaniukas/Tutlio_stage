import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import {
  endOfMonthYmd,
  lessonsForMonthlyPeriod,
  nextMonthFirstYmd,
} from '../src/lib/monthlyPackagePlan.js';
import { resolveOrganizationLessonPrice } from '../src/lib/organizationDynamicPricing.js';

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
  const today = ymdInVilnius();

  const { data, error } = await supabase
    .from('recurring_monthly_package_plans')
    .select('id, organization_id, tutor_id, student_id, subject_id, grade, lessons_per_week, payment_method, attach_sales_invoice, next_generation_date')
    .eq('active', true)
    .lte('next_generation_date', today)
    .order('next_generation_date', { ascending: true })
    .limit(250);
  if (error) return res.status(500).json({ error: error.message });

  let generated = 0;
  let advanced = 0;
  const failures: Array<{ planId: string; error: string }> = [];
  const origin = apiOrigin(req);

  for (const plan of data || []) {
    const periodStart = String(plan.next_generation_date);
    const periodEnd = endOfMonthYmd(periodStart);
    const nextGenerationDate = nextMonthFirstYmd(periodStart);

    const { data: existing } = await supabase
      .from('lesson_packages')
      .select('id')
      .eq('recurring_plan_id', plan.id)
      .eq('billing_period_start', periodStart)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('recurring_monthly_package_plans')
        .update({
          last_generated_period_start: periodStart,
          last_generated_period_end: periodEnd,
          next_generation_date: nextGenerationDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.id);
      advanced += 1;
      continue;
    }

    const [{ data: subject }, { data: student }, { data: individual }, { data: rules }] = await Promise.all([
      supabase.from('subjects').select('id, price, is_group, is_trial').eq('id', plan.subject_id).maybeSingle(),
      supabase.from('students').select('id, grade, pricing_lessons_per_week').eq('id', plan.student_id).maybeSingle(),
      supabase
        .from('student_individual_pricing')
        .select('price')
        .eq('student_id', plan.student_id)
        .eq('subject_id', plan.subject_id)
        .maybeSingle(),
      supabase
        .from('organization_dynamic_pricing')
        .select('grade_min, grade_max, lessons_per_week, price')
        .eq('organization_id', plan.organization_id),
    ]);
    if (!subject || !student) {
      failures.push({ planId: plan.id, error: 'Subject or student no longer exists.' });
      continue;
    }

    const lessonsPerWeek = Number(plan.lessons_per_week);
    const price = resolveOrganizationLessonPrice({
      rules: subject.is_group || subject.is_trial ? [] : (rules || []).map((rule: any) => ({
        ...rule,
        grade_min: Number(rule.grade_min),
        grade_max: Number(rule.grade_max),
        lessons_per_week: Number(rule.lessons_per_week),
        price: Number(rule.price),
      })),
      student: { grade: String(plan.grade), pricing_lessons_per_week: lessonsPerWeek },
      lessonsPerWeek,
      individualPrice: individual ? Number(individual.price) : null,
      fallbackPrice: Number(subject.price || 0),
    });
    const totalLessons = lessonsForMonthlyPeriod(periodStart, periodEnd, lessonsPerWeek);

    const endpoint = plan.payment_method === 'manual'
      ? '/api/create-manual-package'
      : '/api/create-package-checkout';
    try {
      const response = await fetch(`${origin}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': serviceRoleKey,
        },
        body: JSON.stringify({
          tutorId: plan.tutor_id,
          studentId: plan.student_id,
          items: [{ subjectId: plan.subject_id, totalLessons, pricePerLesson: price }],
          expiresAt: periodEnd,
          attachSalesInvoice: plan.attach_sales_invoice,
          recurringPlanId: plan.id,
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        failures.push({ planId: plan.id, error: String((result as any).error || response.status) });
        continue;
      }

      await supabase
        .from('recurring_monthly_package_plans')
        .update({
          last_generated_period_start: periodStart,
          last_generated_period_end: periodEnd,
          next_generation_date: nextGenerationDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.id);
      generated += 1;
    } catch (generationError) {
      failures.push({
        planId: plan.id,
        error: generationError instanceof Error ? generationError.message : String(generationError),
      });
    }
  }

  return res.status(failures.length > 0 ? 207 : 200).json({
    success: failures.length === 0,
    generated,
    advanced,
    failures,
  });
}
