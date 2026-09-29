import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchOrgStudentDynamicPrice } from '../../src/lib/orgStudentPricing.js';
import { endOfMonthYmd, nextMonthFirstYmd } from '../../src/lib/monthlyPackagePlan.js';
import { wallClockToUtc } from './recurringOccurrences.js';

export type MonthlySession = {
  id: string; student_id: string; tutor_id: string; subject_id: string | null;
  start_time: string; status: string; paid: boolean; lesson_package_id: string | null;
  is_complimentary?: boolean; is_makeup?: boolean;
  subjects: { name: string; is_trial?: boolean } | null;
};

type MonthlyPackageItem = ReturnType<typeof monthlyPackageBreakdown>[number] & {
  pricePerLesson: number;
  itemTotalPrice: number;
};

function eligibleMonthlySession(session: MonthlySession): boolean {
  return Boolean(session.subject_id && ['active', 'completed'].includes(session.status) && !session.paid &&
    !session.lesson_package_id && !session.is_complimentary && !session.is_makeup && !session.subjects?.is_trial);
}

/** Count actual calendar rows, never extrapolate a weekly frequency into credits. */
export function monthlyPackageBreakdown(sessions: MonthlySession[]) {
  const items = new Map<string, { subjectId: string; subjectName: string; totalLessons: number }>();
  const seen = new Set<string>();
  for (const session of sessions) {
    if (seen.has(session.id) || !eligibleMonthlySession(session)) continue;
    seen.add(session.id);
    const subjectId = session.subject_id!;
    const item = items.get(subjectId) || { subjectId, subjectName: session.subjects?.name || 'Pamoka', totalLessons: 0 };
    item.totalLessons++;
    items.set(subjectId, item);
  }
  return [...items.values()].sort((a, b) => a.subjectId.localeCompare(b.subjectId));
}
export async function previewMonthlyStudentPackage(db: SupabaseClient, studentId: string, organizationId: string, periodStart: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || new Date(`${periodStart}T12:00:00Z`).toISOString().slice(0, 10) !== periodStart) throw new Error('Invalid period start');
  if (!periodStart.endsWith('-01')) throw new Error('Monthly packages cover the full calendar month; select its first day');
  const periodEnd = endOfMonthYmd(periodStart);
  const nextGenerationDate = nextMonthFirstYmd(periodStart);
  const pricing = await fetchOrgStudentDynamicPrice(db, studentId);
  if (!pricing.studentIds.length) throw new Error('No student pricing identity found');
  const sessions = await db.from('sessions')
    .select('id, student_id, tutor_id, subject_id, start_time, status, paid, lesson_package_id, is_complimentary, is_makeup, subjects(name,is_trial)')
    .in('student_id', pricing.studentIds)
    .gte('start_time', wallClockToUtc(periodStart, '00:00').toISOString())
    .lt('start_time', wallClockToUtc(nextGenerationDate, '00:00').toISOString());
  if (sessions.error) throw new Error(sessions.error.message);
  const rows = sessions.data as unknown as MonthlySession[];
  const tutorIds = [...new Set(rows.map(row => row.tutor_id))];
  if (tutorIds.length) {
    const tutors = await db.from('profiles').select('id').eq('organization_id', organizationId).in('id', tutorIds);
    if (tutors.error || tutors.data?.length !== tutorIds.length) throw new Error('Schedule contains a tutor outside this organization');
  }
  const breakdown = monthlyPackageBreakdown(rows);
  const totalLessons = breakdown.reduce((n, item) => n + item.totalLessons, 0);
  if (totalLessons < 1 || totalLessons > 100) throw new Error('The selected month must contain 1–100 unpaid scheduled lessons');
  const subjectIds = breakdown.map(item => item.subjectId);
  const individualPrices = await db.from('student_individual_pricing')
    .select('student_id,tutor_id,subject_id,price')
    .in('student_id', pricing.studentIds)
    .in('subject_id', subjectIds);
  if (individualPrices.error) throw new Error(individualPrices.error.message);
  const overrides = new Map<string, number>();
  for (const row of individualPrices.data || []) {
    const price = Number(row.price);
    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid individual lesson price');
    overrides.set(`${row.student_id}:${row.tutor_id}:${row.subject_id}`, price);
  }
  const eligible = rows.filter(eligibleMonthlySession);
  const items: MonthlyPackageItem[] = breakdown.map(item => {
    const rates = new Set(eligible.filter(row => row.subject_id === item.subjectId).map(row =>
      overrides.get(`${row.student_id}:${row.tutor_id}:${row.subject_id}`) ?? pricing.price));
    if (rates.size !== 1) throw new Error(`Conflicting individual prices for ${item.subjectName}; align the student pricing before sending a package`);
    const rate = [...rates][0];
    if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0 ||
      Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-8) {
      throw new Error(`No valid lesson price configured for ${item.subjectName}`);
    }
    const cents = Math.round(rate * 100);
    return { ...item, pricePerLesson: cents / 100, itemTotalPrice: cents * item.totalLessons / 100 };
  });
  const totalPrice = Math.round(items.reduce((total, item) => total + item.itemTotalPrice, 0) * 100) / 100;
  const result = { items, totalLessons, pricePerLesson: pricing.price, totalPrice,
    lessonsPerWeek: pricing.lessonsPerWeek, periodStart, periodEnd, nextGenerationDate };
  const previewToken = createHash('sha256').update(JSON.stringify({ ...result, organizationId, studentIds: pricing.studentIds.slice().sort(), sessions: rows.map(row => [row.id, row.start_time, row.status, row.paid, row.lesson_package_id]).sort() })).digest('hex');
  const sessionIds = eligible.map(row => row.id).sort();
  return { ...result, previewToken, studentIds: pricing.studentIds, sessionIds };
}
