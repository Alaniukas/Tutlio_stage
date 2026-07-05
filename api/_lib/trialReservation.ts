// Shared helpers for the trial reservation (pay-to-confirm) flow — Pro Klase
// intake funnel, Phase 1, req 2. Kept pure where possible so the deadline and
// flag logic can be unit-tested without Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertParentInviteAndSendEmail } from './parentInvite.js';
import { isOrgTutor } from './isOrgTutor.js';

export const TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS = 24;
const MAX_DEADLINE_HOURS = 24 * 30; // 30 days

type Features = Record<string, unknown> | null | undefined;

function asFeatureObject(features: Features): Record<string, unknown> {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return {};
  return features as Record<string, unknown>;
}

/** Whether the org has the trial reservation (pay-to-confirm) flow enabled. */
export function isTrialReservationFlowEnabled(features: Features): boolean {
  return asFeatureObject(features).trial_reservation_flow === true;
}

/** Admin-configurable payment deadline (hours) for a held trial; defaults to 24. */
export function getTrialReservationDeadlineHours(features: Features): number {
  const raw = asFeatureObject(features).trial_reservation_deadline_hours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0 && n <= MAX_DEADLINE_HOURS) return n;
  return TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS;
}

/** ISO timestamp `hours` from `now` — when an unpaid hold auto-releases. */
export function trialReservationExpiryIso(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────
// Package reservation (pay-by-deadline) — Pro Klase intake funnel, Phase 2,
// req 3 + req 5. Generalizes the trial hold so a package can pre-book lesson
// slots that are held until paid by a deadline computed from the first meeting.
// ─────────────────────────────────────────────────────────────────────────

export const PACKAGE_PAYMENT_DEFAULT_DEADLINE_HOURS = 24;

/** Whether the org has the package reservation (pre-book + pay-by-deadline) flow enabled. */
export function isPackageReservationFlowEnabled(features: Features): boolean {
  return asFeatureObject(features).package_reservation_flow === true;
}

/** Admin-configurable package payment deadline (hours before the first lesson); defaults to 24. */
export function getPackagePaymentDeadlineHours(features: Features): number {
  const raw = asFeatureObject(features).package_payment_deadline_hours;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0 && n <= MAX_DEADLINE_HOURS) return n;
  return PACKAGE_PAYMENT_DEFAULT_DEADLINE_HOURS;
}

/**
 * Deadline for paying a pre-booked package: `firstStart - hours`. When the
 * first lesson is sooner than that (or already within the window), clamp to a
 * small floor (`now + 1h`) so the payer always has a little time to pay.
 */
export function packagePaymentDeadlineIso(
  firstStartIso: string,
  hours: number,
  now: Date = new Date(),
): string {
  const firstStart = new Date(firstStartIso);
  const floor = new Date(now.getTime() + 3_600_000); // now + 1h
  if (Number.isNaN(firstStart.getTime())) return floor.toISOString();
  const deadline = new Date(firstStart.getTime() - hours * 3_600_000);
  return (deadline.getTime() < floor.getTime() ? floor : deadline).toISOString();
}

export interface ReservedTrialHold {
  id: string;
  tutor_id: string;
  student_id: string;
  start_time: string;
  end_time?: string | null;
  topic?: string | null;
  meeting_link?: string | null;
}

function ltDate(d: Date): string {
  return d.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function ltTime(d: Date): string {
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

async function postInternalEmail(appUrl: string, payload: unknown): Promise<void> {
  const internalKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    const r = await fetch(`${appUrl.replace(/\/$/, '')}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': internalKey },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[trialReservation] send-email failed', r.status, txt);
    }
  } catch (e) {
    console.error('[trialReservation] send-email error', e);
  }
}

/**
 * After a trial payment is confirmed, notify the tutor (lesson_confirmed_tutor)
 * and send the student/parent platform invites. The invite is intentionally
 * deferred to payment time for the reservation flow ("login and the student
 * invitation start only after payment").
 */
export async function sendTrialReservationConfirmedNotifications(
  supabase: SupabaseClient,
  opts: { appUrl: string; holds: ReservedTrialHold[] },
): Promise<void> {
  const { appUrl, holds } = opts;
  if (!holds || holds.length === 0) return;
  const baseUrl = appUrl.replace(/\/$/, '');

  const tutorIds = [...new Set(holds.map((h) => h.tutor_id).filter(Boolean))];
  const studentIds = [...new Set(holds.map((h) => h.student_id).filter(Boolean))];

  const [{ data: tutorRows }, { data: studentRows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, organization_id').in('id', tutorIds),
    supabase
      .from('students')
      .select('id, full_name, email, payer_email, payer_name, payment_payer, invite_code, organization_id, linked_user_id')
      .in('id', studentIds),
  ]);
  const tutorById = new Map<string, any>((tutorRows || []).map((t: any) => [t.id, t]));
  const studentById = new Map<string, any>((studentRows || []).map((s: any) => [s.id, s]));

  // Tutor confirmation email (one per held session).
  for (const h of holds) {
    const tutor = tutorById.get(h.tutor_id);
    if (!tutor?.email || !isOrgTutor(tutor.organization_id)) continue;
    const student = studentById.get(h.student_id);
    const start = new Date(h.start_time);
    await postInternalEmail(baseUrl, {
      type: 'lesson_confirmed_tutor',
      to: tutor.email,
      data: {
        studentName: student?.full_name || '',
        tutorName: tutor.full_name || 'Korepetitorius',
        date: ltDate(start),
        time: ltTime(start),
        subject: h.topic || '',
        sessionId: h.id,
        meetingLink: h.meeting_link || '',
        organizationId: tutor.organization_id,
      },
    });
  }

  // Student + parent platform invite (once per student).
  for (const sid of studentIds) {
    const student = studentById.get(sid);
    if (!student) continue;
    const tutorId = holds.find((h) => h.student_id === sid)?.tutor_id;
    const tutor = tutorId ? tutorById.get(tutorId) : null;

    // Skip the platform invite when the student already has an account
    // (post-trial package students are usually already registered).
    if (student.email && student.invite_code && !student.linked_user_id) {
      await postInternalEmail(baseUrl, {
        type: 'invite_email',
        to: student.email,
        data: {
          studentName: student.full_name,
          tutorName: tutor?.full_name || 'Korepetitorius',
          inviteCode: student.invite_code,
          bookingUrl: `${baseUrl}/book/${student.invite_code}`,
          ...(student.organization_id ? { organizationId: student.organization_id } : {}),
        },
      });
    }

    if (student.payment_payer === 'parent' && student.payer_email) {
      await insertParentInviteAndSendEmail({
        supabase,
        appUrl: baseUrl,
        parentEmail: student.payer_email,
        studentId: sid,
        studentFullName: student.full_name,
        parentName: student.payer_name,
        source: 'student_self',
      }).catch((e) => console.error('[trialReservation] parent invite failed', e));
    }
  }
}
