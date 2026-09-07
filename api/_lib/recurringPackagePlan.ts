import type { SupabaseClient } from '@supabase/supabase-js';
import { nextMonthFirstYmd } from '../../src/lib/monthlyPackagePlan.js';
import { getOrgAdminAccessByUserId } from './orgAdminAccess.js';
import { hasOrgAdminPermission } from '../../src/lib/orgAdminPermissions.js';

export type MonthlyPlanInput = {
  grade?: number;
  lessonsPerWeek?: number;
  periodStart?: string;
  periodEnd?: string;
};

type ResolveArgs = {
  supabase: SupabaseClient;
  organizationId: string | null;
  createdBy: string | null;
  tutorId: string;
  studentId: string;
  subjectId: string | null;
  paymentMethod: 'manual' | 'stripe';
  attachSalesInvoice: boolean;
  monthlyPlan?: MonthlyPlanInput | null;
  recurringPlanId?: string | null;
  billingPeriodStart?: string | null;
  billingPeriodEnd?: string | null;
};

export type ResolvedRecurringPlan = {
  planId: string | null;
  planCreatedBy: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
};

function validYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function resolveRecurringPackagePlan(args: ResolveArgs): Promise<{
  data: ResolvedRecurringPlan | null;
  error: string | null;
}> {
  const {
    supabase,
    tutorId,
    studentId,
    subjectId,
    paymentMethod,
    recurringPlanId,
    billingPeriodStart,
    billingPeriodEnd,
  } = args;

  if (recurringPlanId) {
    if (!validYmd(billingPeriodStart) || !validYmd(billingPeriodEnd)) {
      return { data: null, error: 'Missing recurring package billing period.' };
    }
    const { data: plan, error } = await supabase
      .from('recurring_monthly_package_plans')
      .select('id, created_by, tutor_id, student_id, subject_id, payment_method, active, auto_from_schedule')
      .eq('id', recurringPlanId)
      .maybeSingle();
    if (error || !plan || plan.active !== true) {
      return { data: null, error: error?.message || 'Recurring package plan not found.' };
    }
    // Auto (schedule-derived) plans are multi-subject: subject_id is NULL and
    // items are rebuilt from the recurring templates each period — skip the
    // single-subject equality check for them.
    const subjectMatches = plan.auto_from_schedule === true || plan.subject_id === subjectId;
    if (
      plan.tutor_id !== tutorId ||
      plan.student_id !== studentId ||
      !subjectMatches ||
      plan.payment_method !== paymentMethod
    ) {
      return { data: null, error: 'Recurring package plan does not match this package.' };
    }
    return {
      data: {
        planId: plan.id,
        planCreatedBy: plan.created_by,
        billingPeriodStart,
        billingPeriodEnd,
      },
      error: null,
    };
  }

  if (!args.monthlyPlan) {
    return {
      data: { planId: null, planCreatedBy: args.createdBy, billingPeriodStart: null, billingPeriodEnd: null },
      error: null,
    };
  }
  if (!args.organizationId || !args.createdBy || !subjectId) {
    return { data: null, error: 'Monthly packages require an organization, creator, and one subject.' };
  }

  const admin = await getOrgAdminAccessByUserId(supabase, args.createdBy);
  if (
    !admin
    || admin.organizationId !== args.organizationId
    || !hasOrgAdminPermission(admin.role, admin.permissions, 'finance.edit')
  ) {
    return { data: null, error: 'Only an organization administrator can create a monthly package plan.' };
  }

  const grade = Number(args.monthlyPlan.grade);
  const lessonsPerWeek = Number(args.monthlyPlan.lessonsPerWeek);
  const periodStart = args.monthlyPlan.periodStart;
  const periodEnd = args.monthlyPlan.periodEnd;
  if (
    !Number.isInteger(grade) || grade < 1 || grade > 12 ||
    !Number.isInteger(lessonsPerWeek) || lessonsPerWeek < 1 || lessonsPerWeek > 7 ||
    !validYmd(periodStart) || !validYmd(periodEnd)
  ) {
    return { data: null, error: 'Invalid grade, weekly frequency, or monthly billing period.' };
  }

  const { error: studentUpdateError } = await supabase
    .from('students')
    .update({ grade: String(grade), pricing_lessons_per_week: lessonsPerWeek })
    .eq('id', studentId);
  if (studentUpdateError) return { data: null, error: studentUpdateError.message };

  const { data: plan, error: planError } = await supabase
    .from('recurring_monthly_package_plans')
    .insert({
      organization_id: args.organizationId,
      created_by: args.createdBy,
      tutor_id: tutorId,
      student_id: studentId,
      subject_id: subjectId,
      grade,
      lessons_per_week: lessonsPerWeek,
      payment_method: paymentMethod,
      attach_sales_invoice: args.attachSalesInvoice,
      next_generation_date: nextMonthFirstYmd(periodStart),
      last_generated_period_start: periodStart,
      last_generated_period_end: periodEnd,
    })
    .select('id, created_by')
    .single();
  if (planError || !plan) return { data: null, error: planError?.message || 'Failed to create monthly package plan.' };

  return {
    data: {
      planId: plan.id,
      planCreatedBy: plan.created_by,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
    },
    error: null,
  };
}

export function recurringPlanPackageFields(plan: ResolvedRecurringPlan): Record<string, string> {
  if (!plan.planId || !plan.billingPeriodStart || !plan.billingPeriodEnd) return {};
  return {
    recurring_plan_id: plan.planId,
    billing_period_start: plan.billingPeriodStart,
    billing_period_end: plan.billingPeriodEnd,
  };
}
