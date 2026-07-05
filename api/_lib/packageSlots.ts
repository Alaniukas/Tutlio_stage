// Shared helper for pre-booking package lesson slots — Pro Klase intake funnel,
// Phase 2, req 3 + req 5. Generalizes the trial hold: when a package is sent
// with chosen times, the slots are held (status='active', payment_status=
// 'reserved') and the credits moved available->reserved. The holds auto-release
// via the expire-trial-reservations cron if unpaid by the package deadline.
import type { SupabaseClient } from '@supabase/supabase-js';
import { packagePaymentDeadlineIso } from './trialReservation.js';

export interface PackageSlotInput {
  subjectId: string;
  startIso: string;
  endIso: string;
}

export interface PackageReservableItem {
  subjectId: string;
  subjectName: string;
  pricePerLesson: number;
  totalLessons: number;
}

export interface ReservePackageSlotsParams {
  tutorId: string;
  studentId: string;
  packageId: string;
  slots: PackageSlotInput[];
  items: PackageReservableItem[];
  deadlineHours: number;
  now?: Date;
}

export interface ReservePackageSlotsResult {
  error?: string;
  status?: number;
  reservedCount?: number;
  /** ISO deadline applied to every hold (first meeting - deadlineHours). */
  reservationExpiresAt?: string;
}

/**
 * Validate, conflict-check and create reserved holds for the given package
 * slots, then move the matching credits available->reserved. Does NOT delete
 * the package on failure — the caller owns rollback (mirrors create-trial-package).
 */
export async function reservePackageSlots(
  supabase: SupabaseClient,
  params: ReservePackageSlotsParams,
): Promise<ReservePackageSlotsResult> {
  const { tutorId, studentId, packageId, slots, items, deadlineHours } = params;
  if (!slots || slots.length === 0) return { reservedCount: 0 };

  const itemBySubject = new Map(items.map((it) => [it.subjectId, it]));

  // 1. Validate slot shape + subject membership + per-subject counts.
  const slotsBySubject = new Map<string, number>();
  let earliestStartMs = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const item = itemBySubject.get(slot.subjectId);
    if (!item) {
      return { error: 'Pasirinktas laikas neatitinka paketo dalyko', status: 400 };
    }
    const start = new Date(slot.startIso);
    const end = new Date(slot.endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      return { error: 'Netinkamas pamokos laikas', status: 400 };
    }
    earliestStartMs = Math.min(earliestStartMs, start.getTime());
    slotsBySubject.set(slot.subjectId, (slotsBySubject.get(slot.subjectId) || 0) + 1);
  }
  for (const [subjectId, count] of slotsBySubject) {
    const item = itemBySubject.get(subjectId)!;
    if (count > item.totalLessons) {
      return { error: 'Rezervuojama daugiau laikų nei pamokų pakete', status: 400 };
    }
  }

  // 2. Conflict-check every slot against the tutor's active calendar.
  for (const slot of slots) {
    const { data: conflicts } = await supabase
      .from('sessions')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('status', 'active')
      .lt('start_time', new Date(slot.endIso).toISOString())
      .gt('end_time', new Date(slot.startIso).toISOString())
      .limit(1);
    if (conflicts && conflicts.length > 0) {
      return { error: 'Korepetitorius šiuo metu jau turi pamoką', status: 409 };
    }
  }

  // 3. Single deadline for all holds: first meeting - deadlineHours.
  const reservationExpiresAt = packagePaymentDeadlineIso(
    new Date(earliestStartMs).toISOString(),
    deadlineHours,
    params.now,
  );

  const holdRows = slots.map((slot) => {
    const item = itemBySubject.get(slot.subjectId)!;
    return {
      tutor_id: tutorId,
      student_id: studentId,
      subject_id: slot.subjectId,
      start_time: new Date(slot.startIso).toISOString(),
      end_time: new Date(slot.endIso).toISOString(),
      status: 'active',
      paid: false,
      payment_status: 'reserved',
      reservation_expires_at: reservationExpiresAt,
      lesson_package_id: packageId,
      topic: item.subjectName,
      price: item.pricePerLesson,
      created_by_role: 'org_admin',
    };
  });

  const { error: holdErr } = await supabase.from('sessions').insert(holdRows);
  if (holdErr) {
    return { error: holdErr.message, status: 500 };
  }

  // 4. Move credits available->reserved per item, then aggregate on the package.
  for (const [subjectId, count] of slotsBySubject) {
    const item = itemBySubject.get(subjectId)!;
    await supabase
      .from('lesson_package_items')
      .update({
        available_lessons: Math.max(0, item.totalLessons - count),
        reserved_lessons: count,
      })
      .eq('package_id', packageId)
      .eq('subject_id', subjectId);
  }
  const totalLessons = items.reduce((sum, it) => sum + it.totalLessons, 0);
  const totalReserved = slots.length;
  await supabase
    .from('lesson_packages')
    .update({
      available_lessons: Math.max(0, totalLessons - totalReserved),
      reserved_lessons: totalReserved,
    })
    .eq('id', packageId);

  return { reservedCount: totalReserved, reservationExpiresAt };
}
