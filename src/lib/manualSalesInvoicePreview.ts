import type { SupabaseClient } from '@supabase/supabase-js';

export type ManualPackageInvoiceRow = {
  invoice_row_kind: 'package';
  id: string;
  tutor_id: string;
  student_id: string;
  start_time: string;
  price: number;
  students: unknown;
  subjects: unknown;
  payment_status: string;
  total_lessons: number;
};

export type SalesInvoicePreviewMode = 'manual_org' | 'stripe';

const SESSION_SELECT = `
  *,
  students!inner(full_name, email, payer_email, payer_name),
  subjects(name),
  lesson_packages!left(id, paid, payment_method, paid_at, manual_sales_invoice_id, total_price, total_lessons)
`;

function getLp(s: Record<string, unknown>) {
  const lp = Array.isArray(s.lesson_packages) ? s.lesson_packages[0] : s.lesson_packages;
  return lp as { paid?: boolean; payment_method?: string } | null | undefined;
}

function inPaidWindow(
  periodStart: string,
  periodEnd: string,
  p: { paid_at?: string | null; created_at?: string | null }
) {
  const startMs = new Date(periodStart + 'T00:00:00').getTime();
  const endMs = new Date(periodEnd + 'T23:59:59').getTime();
  const t = new Date(p.paid_at || p.created_at || 0).getTime();
  return t >= startMs && t <= endMs;
}

function mapPackageRow(p: Record<string, unknown>): ManualPackageInvoiceRow {
  return {
    invoice_row_kind: 'package',
    id: p.id as string,
    tutor_id: p.tutor_id as string,
    student_id: p.student_id as string,
    start_time: (p.paid_at || p.created_at) as string,
    price: Number(p.total_price) || 0,
    students: p.students,
    subjects: p.subjects,
    payment_status: 'paid',
    total_lessons: p.total_lessons as number,
  };
}

/**
 * Paid items for S.F. preview: manual org vs Stripe (per-lesson + prepaid packages).
 */
export async function fetchPaidSalesInvoiceCandidates(
  supabase: SupabaseClient,
  opts: {
    tutorIds: string[];
    periodStart: string;
    periodEnd: string;
    studentId?: string;
    mode: SalesInvoicePreviewMode;
  }
): Promise<{ rows: unknown[]; error: Error | null }> {
  const { tutorIds, periodStart, periodEnd, studentId, mode } = opts;

  let sessionQuery = supabase
    .from('sessions')
    .select(SESSION_SELECT)
    .in('tutor_id', tutorIds)
    .neq('status', 'cancelled')
    .gte('start_time', periodStart + 'T00:00:00')
    .lte('start_time', periodEnd + 'T23:59:59')
    .neq('payment_status', 'invoiced')
    .order('start_time', { ascending: false });

  if (studentId) sessionQuery = sessionQuery.eq('student_id', studentId);

  const { data: sessionData, error: sessionError } = await sessionQuery;
  if (sessionError) return { rows: [], error: new Error(sessionError.message) };

  let sessionRows: Record<string, unknown>[] = [];

  if (mode === 'manual_org') {
    const manualPaidSession = (s: Record<string, unknown>) => {
      if (s.paid === true) return true;
      const lp = getLp(s);
      return !!(lp && lp.paid === true && lp.payment_method === 'manual');
    };
    sessionRows = (sessionData || []).filter(manualPaidSession);
  } else {
    const stripePaidSession = (s: Record<string, unknown>) => {
      if (s.paid !== true) return false;
      const lp = getLp(s);
      if (lp && lp.payment_method === 'manual' && lp.paid) return false;
      return true;
    };
    sessionRows = (sessionData || []).filter(stripePaidSession);
  }

  const sessionPackageIds = new Set(
    sessionRows.map((s: { lesson_package_id?: string | null }) => s.lesson_package_id).filter(Boolean) as string[]
  );

  const paymentMethod = mode === 'manual_org' ? 'manual' : 'stripe';

  let pkgQuery = supabase
    .from('lesson_packages')
    .select(
      `
      id, tutor_id, student_id, subject_id, total_price, total_lessons, paid_at, created_at,
      paid, payment_method, manual_sales_invoice_id,
      students!inner(full_name, email, payer_email, payer_name),
      subjects(name)
    `
    )
    .in('tutor_id', tutorIds)
    .eq('paid', true)
    .eq('payment_method', paymentMethod)
    .is('manual_sales_invoice_id', null);

  if (studentId) pkgQuery = pkgQuery.eq('student_id', studentId);

  const { data: pkgData, error: pkgError } = await pkgQuery;
  if (pkgError) return { rows: [], error: new Error(pkgError.message) };

  const packageRows = (pkgData || [])
    .filter(p => inPaidWindow(periodStart, periodEnd, p) && !sessionPackageIds.has(p.id))
    .map(p => mapPackageRow(p as Record<string, unknown>));

  const merged = [...sessionRows, ...packageRows].sort(
    (a: { start_time?: string }, b: { start_time?: string }) =>
      new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime()
  );

  return { rows: merged, error: null };
}

/** @deprecated use fetchPaidSalesInvoiceCandidates(..., { mode: 'manual_org' }) */
export async function fetchPaidManualSalesInvoiceCandidates(
  supabase: SupabaseClient,
  opts: {
    tutorIds: string[];
    periodStart: string;
    periodEnd: string;
    studentId?: string;
  }
): Promise<{ rows: unknown[]; error: Error | null }> {
  return fetchPaidSalesInvoiceCandidates(supabase, { ...opts, mode: 'manual_org' });
}
