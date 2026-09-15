import { format, parseISO, getDay, addDays, isBefore } from 'date-fns';
import {
  advanceRecurringOccurrence,
  recurringMaterializeEndDate,
} from '@/lib/recurringSessions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { resolveStudentNotificationEmail } from '@/lib/studentNotifyEmail';
import { sessionCommentDeliveryRecipients } from '@/lib/sessionCommentDelivery';
import { isManoKorepetitoriusOrg, isMoksloVaisiaiOrg, isProKlaseOrg } from '@/lib/marketMoney';
import {
  countNonCancelledSessionsForPair,
  isFirstLessonForStudentTutorPair,
} from '@/lib/mvFirstLessonPlanned';
import { authHeaders } from '@/lib/apiHelpers';
import { findActivePackageForBooking } from '@/lib/lessonPackageBooking';
import { packageCoversLessonDate } from '@/lib/pooledPackageBookingWindow';
import { defaultSessionPaymentStatusForStudent } from '@/lib/studentPaymentModel';
import { ensureStudentPairedWithTutor } from '@/lib/orgStudentPairing';
import { consumeAvailabilityForCreatedSessions } from '@/lib/consumeSessionAvailability';
import {
  contractedLessonsPerWeek,
  resolveOrganizationLessonPrice,
  type OrganizationDynamicPricingRule,
} from '@/lib/organizationDynamicPricing';

type SubjectLite = {
  id: string;
  name?: string | null;
  price: number | null;
  duration_minutes?: number | null;
  is_group?: boolean | null;
  max_students?: number | null;
  is_trial?: boolean | null;
};

type PricingRow = { student_id: string; subject_id: string; price: number };

type TutorSubjectPriceRow = { tutor_id: string; org_subject_template_id: string; price: number; duration_minutes: number };

type CreatedSessionRow = {
  id: string;
  student_id: string;
  paid: boolean;
  payment_status?: string | null;
  price?: number | null;
  start_time: string;
  end_time: string;
};

type TrialSubjectMeta = {
  subject: SubjectLite;
  price: number;
  durationMinutes: number;
  topic: string;
};

/** Resolve org trial defaults and the tutor's trial subject (create if missing). */
export async function resolveOrCreateTrialSubject(
  supabase: SupabaseClient,
  tutorId: string,
  priceOverride?: number,
  options?: { useOrgPriceOnly?: boolean },
): Promise<TrialSubjectMeta> {
  const { data: tutorOrgRow } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', tutorId)
    .maybeSingle();
  let featObj: Record<string, unknown> = {};
  const trialOrgId = (tutorOrgRow as { organization_id?: string | null })?.organization_id;
  if (trialOrgId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('features')
      .eq('id', trialOrgId)
      .maybeSingle();
    const feat = (orgRow as { features?: unknown })?.features;
    if (feat && typeof feat === 'object' && !Array.isArray(feat)) featObj = feat as Record<string, unknown>;
  }
  const trialName =
    typeof featObj.trial_lesson_topic === 'string' && featObj.trial_lesson_topic.trim()
      ? String(featObj.trial_lesson_topic).trim()
      : 'Bandomoji pamoka';
  const trialDuration =
    typeof featObj.trial_lesson_duration_minutes === 'number'
      ? Math.max(15, Math.round(featObj.trial_lesson_duration_minutes as number))
      : 60;
  const trialPriceDefault =
    typeof featObj.trial_lesson_price_eur === 'number'
      ? Math.max(0, featObj.trial_lesson_price_eur as number)
      : 0;

  const { data: existingTrial } = await supabase
    .from('subjects')
    .select('id, name, price, duration_minutes, is_group, max_students, is_trial')
    .eq('tutor_id', tutorId)
    .eq('is_trial', true)
    .maybeSingle();

  let trialSubject = existingTrial as SubjectLite | null;
  if (!trialSubject) {
    const { data: createdTrial, error: trialErr } = await supabase
      .from('subjects')
      .insert({
        tutor_id: tutorId,
        name: trialName,
        duration_minutes: trialDuration,
        price: trialPriceDefault,
        color: '#fbbf24',
        is_trial: true,
      })
      .select('id, name, price, duration_minutes, is_group, max_students, is_trial')
      .single();
    if (trialErr || !createdTrial) {
      throw new Error(trialErr?.message || 'Nepavyko sukurti bandomosios pamokos dalyko.');
    }
    trialSubject = createdTrial as SubjectLite;
  }

  const requestedPrice = Number(priceOverride);
  const price =
    options?.useOrgPriceOnly
      ? trialPriceDefault
      : Number.isFinite(requestedPrice) && requestedPrice >= 0
        ? requestedPrice
        : Number(trialSubject.price ?? trialPriceDefault);

  return {
    subject: trialSubject,
    price,
    durationMinutes: trialDuration,
    topic: trialName,
  };
}

async function persistRecurringPlanFrequency(
  supabase: SupabaseClient,
  studentIds: string[],
  lessonsPerWeek: number,
): Promise<void> {
  if (!lessonsPerWeek || lessonsPerWeek < 1) return;
  for (const studentId of studentIds) {
    await supabase.rpc('set_student_pricing_frequency', {
      p_student_id: studentId,
      p_lessons_per_week: lessonsPerWeek,
    });
  }
}

function rawPaymentStatusForEmail(paid: boolean, payment_status?: string | null): string {
  if (!paid) return 'pending';
  if (payment_status === 'confirmed') return 'paid';
  return 'paid';
}

function normEmailAddr(e: string | null | undefined): string {
  return (e ?? '').trim().toLowerCase();
}

/** Excluding cancelled; only active sessions block the new slot. */
export async function assertTutorSlotsFree(
  supabase: SupabaseClient,
  tutorId: string,
  slots: Array<{ start: Date; end: Date }>,
  excludeSessionIds: string[] = [],
): Promise<void> {
  const uniqueSlots = new Map<string, { start: Date; end: Date }>();
  for (const slot of slots) {
    const key = `${slot.start.getTime()}_${slot.end.getTime()}`;
    if (!uniqueSlots.has(key)) uniqueSlots.set(key, slot);
  }
  const slotList = [...uniqueSlots.values()];
  if (slotList.length === 0) return;

  const earliest = new Date(Math.min(...slotList.map((s) => s.start.getTime())));
  const latest = new Date(Math.max(...slotList.map((s) => s.end.getTime())));
  const { data: existingBusy, error } = await supabase
    .from('sessions')
    .select('id, start_time, end_time')
    .eq('tutor_id', tutorId)
    .eq('status', 'active')
    .lt('start_time', latest.toISOString())
    .gt('end_time', earliest.toISOString());
  if (error) throw new Error(error.message);

  const excluded = new Set(excludeSessionIds.filter(Boolean));
  for (const slot of slotList) {
    const conflict = (existingBusy || []).some((row) => {
      if (excluded.has(String(row.id))) return false;
      const rowStart = new Date(row.start_time as string);
      const rowEnd = new Date(row.end_time as string);
      return rowStart < slot.end && slot.start < rowEnd;
    });
    if (conflict) {
      throw new Error(
        `Tutor already has a lesson at this time (${format(slot.start, 'yyyy-MM-dd')} ${format(slot.start, 'HH:mm')}–${format(slot.end, 'HH:mm')}). Choose a different time.`,
      );
    }
  }
}

/** Emails to tutor + student + payer (if parent) for created sessions. */
async function notifyAfterOrgAdminSessionsCreated(
  supabase: SupabaseClient,
  tutorId: string,
  sessionsForNotify: CreatedSessionRow[],
  subjectLabel: string,
  isRecurring = false,
  isOpenEnded = false,
) {
  if (sessionsForNotify.length === 0) return;

  const { data: tutorProfile } = await supabase
    .from('profiles')
    .select('full_name, email, stripe_account_id, cancellation_hours, cancellation_fee_percent, organization_id')
    .eq('id', tutorId)
    .single();

  const studentIds = [...new Set(sessionsForNotify.map(s => s.student_id))];
  const { data: studentRows } = await supabase
    .from('students')
    .select('id, full_name, email, payment_payer, payer_email, payer_name')
    .in('id', studentIds);

  const studentById = new Map(studentRows?.map(s => [s.id, s]) ?? []);

  const earliestStart = sessionsForNotify.reduce(
    (min, s) => (new Date(s.start_time) < new Date(min.start_time) ? s : min),
    sessionsForNotify[0],
  );
  const tutorStart = new Date(earliestStart.start_time);

  const studentNames = studentIds
    .map(id => studentById.get(id)?.full_name)
    .filter(Boolean) as string[];
  const tutorStudentLabel = studentNames.length === 1 ? studentNames[0]! : studentNames.join(', ');
  const tutorOrgId = (tutorProfile as any)?.organization_id as string | null | undefined;
  const orgIdPayload = tutorOrgId ? { organizationId: tutorOrgId } : {};
  const isMvOrg = isMoksloVaisiaiOrg(tutorOrgId);

  if (tutorProfile?.email) {
    if (isMvOrg) {
      for (const studentId of studentIds) {
        const batchCount = sessionsForNotify.filter((s) => s.student_id === studentId).length;
        try {
          const totalCount = await countNonCancelledSessionsForPair(supabase, studentId, tutorId);
          if (!isFirstLessonForStudentTutorPair(totalCount, batchCount)) continue;

          const st = studentById.get(studentId);
          const studentSessions = sessionsForNotify.filter((s) => s.student_id === studentId);
          const earliest = studentSessions.reduce(
            (min, s) => (new Date(s.start_time) < new Date(min.start_time) ? s : min),
            studentSessions[0],
          );
          const lessonStart = new Date(earliest.start_time);

          void sendEmail({
            type: 'mv_first_lesson_planned_tutor',
            to: tutorProfile.email,
            data: {
              scheduledByOrgAdmin: true,
              studentName: st?.full_name || '',
              tutorName: tutorProfile.full_name || '',
              date: format(lessonStart, 'yyyy-MM-dd'),
              time: format(lessonStart, 'HH:mm'),
              sessionId: earliest.id,
              ...orgIdPayload,
            },
          }).catch((err) => console.error('[OrgSchedule] MV first lesson notify', err));
        } catch (err) {
          console.error('[OrgSchedule] MV first lesson check', err);
        }
      }
    } else {
      void sendEmail({
        type: 'booking_notification',
        to: tutorProfile.email,
        data: {
          scheduledByOrgAdmin: true,
          studentName: tutorStudentLabel,
          tutorName: tutorProfile.full_name || '',
          date: format(tutorStart, 'yyyy-MM-dd'),
          time: format(tutorStart, 'HH:mm'),
          ...orgIdPayload,
        },
      }).catch(err => console.error('[OrgSchedule] tutor notify', err));
    }
  }

  if (isRecurring) {
    // Recurring: send one consolidated email per student with all lesson dates
    const sessionsByStudent = new Map<string, CreatedSessionRow[]>();
    for (const sess of sessionsForNotify) {
      const arr = sessionsByStudent.get(sess.student_id) || [];
      arr.push(sess);
      sessionsByStudent.set(sess.student_id, arr);
    }

    for (const [studentId, studentSessions] of sessionsByStudent) {
      const st = studentById.get(studentId);
      if (!st) continue;
      const firstSess = studentSessions[0];
      const sEnd = new Date(firstSess.end_time);
      const sStart = new Date(firstSess.start_time);
      const dur = Math.max(1, Math.round((sEnd.getTime() - sStart.getTime()) / 60000));
      const studentEm = normEmailAddr(st.email);
      const payerRaw = (st.payer_email || '').trim();
      const payerEm = normEmailAddr(payerRaw);
      const hasPayer = payerRaw.length > 0 && payerEm !== studentEm;

      const sessionDates = studentSessions.map(s => ({
        date: format(new Date(s.start_time), 'yyyy-MM-dd'),
        time: format(new Date(s.start_time), 'HH:mm'),
      }));
      const firstStart = new Date(firstSess.start_time);
      const recurringWeekday = getDay(firstStart);
      const recurringTime = format(firstStart, 'HH:mm');
      const schedule = Array.from(new Map(
        studentSessions.map((session) => {
          const start = new Date(session.start_time);
          const item = { weekday: getDay(start), time: format(start, 'HH:mm') };
          return [`${item.weekday}-${item.time}`, item] as const;
        }),
      ).values()).sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));

      if (st.email) {
        void sendEmail({
          type: 'recurring_booking_confirmation',
          to: st.email,
          data: {
            bookedBy: 'org_admin',
            studentName: st.full_name,
            tutorName: tutorProfile?.full_name || '',
            subject: subjectLabel,
            duration: dur,
            totalLessons: studentSessions.length,
            sessions: sessionDates,
            recurringWeekday,
            recurringTime,
            ongoingSchedule: isOpenEnded,
            schedule,
            ...orgIdPayload,
          },
        }).catch(err => console.error('[OrgSchedule] recurring student email', err));
      }

      if (hasPayer) {
        void sendEmail({
          type: 'recurring_booking_confirmation',
          to: payerRaw,
          data: {
            forPayer: true,
            bookedBy: 'org_admin',
            studentName: st.full_name,
            payerName: (st as any).payer_name || st.full_name,
            tutorName: tutorProfile?.full_name || '',
            subject: subjectLabel,
            duration: dur,
            totalLessons: studentSessions.length,
            sessions: sessionDates,
            recurringWeekday,
            recurringTime,
            ongoingSchedule: isOpenEnded,
            schedule,
            paymentReminderNote: true,
            ...orgIdPayload,
          },
        }).catch(err => console.error('[OrgSchedule] recurring payer email', err));
      }
    }
    return;
  }

  // Non-recurring: one email per session
  for (const sess of sessionsForNotify) {
    const st = studentById.get(sess.student_id);
    if (!st) continue;
    const sStart = new Date(sess.start_time);
    const sEnd = new Date(sess.end_time);
    const dur = Math.max(1, Math.round((sEnd.getTime() - sStart.getTime()) / 60000));
    const priceVal = sess.price ?? '';
    const studentEm = normEmailAddr(st.email);
    const payerRaw = (st.payer_email || '').trim();
    const payerEm = normEmailAddr(payerRaw);
    const hasPayer = payerRaw.length > 0 && payerEm !== studentEm;
    const sessionMeetingLink = (sess as any).meeting_link || null;

    if (st.email) {
      void sendEmail({
        type: 'booking_confirmation',
        to: st.email,
        data: {
          sessionId: sess.id,
          studentName: st.full_name,
          tutorName: tutorProfile?.full_name || '',
          date: format(sStart, 'yyyy-MM-dd'),
          time: format(sStart, 'HH:mm'),
          subject: subjectLabel,
          price: hasPayer ? null : priceVal,
          duration: dur,
          cancellationHours: hasPayer ? null : (tutorProfile?.cancellation_hours ?? 24),
          cancellationFeePercent: hasPayer ? null : (tutorProfile?.cancellation_fee_percent ?? 0),
          paymentStatus: hasPayer ? null : rawPaymentStatusForEmail(sess.paid, sess.payment_status),
          meetingLink: sessionMeetingLink,
          hidePaymentInfo: hasPayer,
          ...orgIdPayload,
        },
      }).catch(err => console.error('[OrgSchedule] student booking', err));
    }

    if (hasPayer) {
      void sendEmail({
        type: 'booking_confirmation',
        to: payerRaw,
        data: {
          sessionId: sess.id,
          forPayer: true,
          bookedBy: 'org_admin',
          studentName: st.full_name,
          tutorName: tutorProfile?.full_name || '',
          date: format(sStart, 'yyyy-MM-dd'),
          time: format(sStart, 'HH:mm'),
          subject: subjectLabel,
          price: priceVal,
          duration: dur,
          cancellationHours: tutorProfile?.cancellation_hours ?? 24,
          cancellationFeePercent: tutorProfile?.cancellation_fee_percent ?? 0,
          paymentStatus: rawPaymentStatusForEmail(sess.paid, sess.payment_status),
          meetingLink: sessionMeetingLink,
          ...orgIdPayload,
        },
      }).catch(err => console.error('[OrgSchedule] payer booking', err));
    } else if (!st.email && payerRaw) {
      void sendEmail({
        type: 'booking_confirmation',
        to: payerRaw,
        data: {
          sessionId: sess.id,
          forPayer: true,
          bookedBy: 'org_admin',
          studentName: st.full_name,
          tutorName: tutorProfile?.full_name || '',
          date: format(sStart, 'yyyy-MM-dd'),
          time: format(sStart, 'HH:mm'),
          subject: subjectLabel,
          price: priceVal,
          duration: dur,
          cancellationHours: tutorProfile?.cancellation_hours ?? 24,
          cancellationFeePercent: tutorProfile?.cancellation_fee_percent ?? 0,
          paymentStatus: rawPaymentStatusForEmail(sess.paid, sess.payment_status),
          meetingLink: sessionMeetingLink,
          ...orgIdPayload,
        },
      }).catch(err => console.error('[OrgSchedule] payer booking', err));
    }
  }
}

export interface OrgAdminCreateSessionInput {
  supabase: SupabaseClient;
  createTutorId: string;
  createSubjectId: string;
  createStudentId: string;
  createStudentIds: string[];
  createStartTime: string;
  createEndTime: string;
  createTopic: string;
  createMeetingLink: string;
  createIsRecurring: boolean;
  createRecurringEndDate: string;
  /** Same as tutor Calendar: weekly | biweekly | monthly */
  createRecurringFrequency?: 'weekly' | 'biweekly' | 'monthly';
  /** JS getDay() values (0=Sun..6=Sat); ignored when frequency is monthly */
  createRecurringWeekdays?: number[];
  createIsPaid: boolean;
  createPrice: number;
  /** Create as the tutor's trial subject (bandomoji pamoka) — one-off, individual only. */
  createIsTrial?: boolean;
  /** Recurring schedule where the chronologically first session is a trial lesson. */
  createFirstLessonIsTrial?: boolean;
  createTutorComment: string;
  createShowCommentToStudent: boolean;
  createShowCommentToParent?: boolean;
  /** Pro Klasė: compensation lesson — client not charged via package. */
  createIsMakeup?: boolean;
  subjects: SubjectLite[];
  individualPricing: PricingRow[];
  tutorSubjectPrices?: TutorSubjectPriceRow[];
  orgSubjectTemplateId?: string;
  /** Reusable multi-create dialogs render their own inline success state. */
  suppressSuccessAlert?: boolean;
  dynamicPricingRules?: OrganizationDynamicPricingRule[];
  /** School class group: tag sessions and book every selected member even if the subject is individual. */
  classGroupId?: string | null;
}

export interface OrgAdminCreateSessionResult {
  /** Ids of the sessions inserted by this call, earliest first. */
  createdSessionIds: string[];
}

/**
 * Org admin calendar: create one-off or recurring session(s) for an org tutor (same rules as tutor Calendar).
 */
export async function runOrgAdminCreateSession(p: OrgAdminCreateSessionInput): Promise<OrgAdminCreateSessionResult> {
  const {
    supabase,
    createTutorId,
    createStudentId,
    createStudentIds,
    createStartTime,
    createEndTime,
    createTopic,
    createMeetingLink,
    createIsRecurring,
    createRecurringEndDate,
    createRecurringFrequency = 'weekly',
    createRecurringWeekdays = [],
    createIsPaid,
    createIsTrial = false,
    createFirstLessonIsTrial = false,
    createTutorComment,
    createShowCommentToStudent,
    createShowCommentToParent = false,
    createIsMakeup = false,
    subjects,
    individualPricing,
    dynamicPricingRules = [],
    classGroupId = null,
  } = p;
  const schoolClassGroupId = classGroupId ? String(classGroupId).trim() : '';
  let { createSubjectId, createPrice } = p;

  let subj = subjects.find(s => s.id === createSubjectId);
  if (!subj) throw new Error('Dalykas nerastas.');

  if (createIsTrial && createIsRecurring) {
    throw new Error('Bandomoji pamoka negali būti pasikartojanti. Naudokite „Pirma pamoka bandomoji“.');
  }

  if (createIsTrial && !createIsRecurring) {
    const trialMeta = await resolveOrCreateTrialSubject(supabase, createTutorId, createPrice);
    createSubjectId = trialMeta.subject.id;
    subj = trialMeta.subject;
    createPrice = trialMeta.price;
  }
  let effectiveShowCommentToStudent = createShowCommentToStudent;
  let effectiveShowCommentToParent = false;
  if ((createTutorComment || '').trim()) {
    try {
      const { data: tutorOrg } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', createTutorId)
        .maybeSingle();
      const orgId = (tutorOrg as any)?.organization_id as string | null | undefined;
      if (orgId) {
        const [{ data: orgRow }, { data: subjRow }] = await Promise.all([
          supabase.from('organizations').select('features').eq('id', orgId).maybeSingle(),
          supabase.from('subjects').select('is_trial').eq('id', createSubjectId).maybeSingle(),
        ]);
        const feat = (orgRow as any)?.features;
        const featObj = feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {};
        if (featObj['trial_lesson_comment_mode'] === 'student_and_parent' && (subjRow as any)?.is_trial === true) {
          effectiveShowCommentToStudent = true;
        }
        if (isManoKorepetitoriusOrg(orgId) && createShowCommentToParent) {
          effectiveShowCommentToParent = true;
        }
      }
    } catch {
      // non-blocking: fallback to manual checkbox value
    }
  }
  const isGroupLesson = Boolean(subj.is_group);
  const requestedStudentIds = isGroupLesson || schoolClassGroupId
    ? (createStudentIds.length ? createStudentIds : (createStudentId ? [createStudentId] : []))
    : (createStudentId ? [createStudentId] : []);
  if (requestedStudentIds.length === 0) {
    throw new Error(isGroupLesson ? 'Select at least one student for a group lesson.' : 'Select a student.');
  }

  // Cross-tutor booking (e.g. free-time search from the student card) must
  // land on a students row paired with the booked tutor, so the tutor sees the
  // student on their pages and appears assigned on /students. No-op when the
  // selected row already belongs to the tutor.
  const studentIdsToCreate = [
    ...new Set(
      await Promise.all(
        requestedStudentIds.map((sid) => ensureStudentPairedWithTutor(supabase, sid, createTutorId)),
      ),
    ),
  ];

  const startDate = new Date(createStartTime);
  const endDate = new Date(createEndTime);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Neteisinga data ar laikas.');
  }
  if (format(startDate, 'yyyy-MM-dd') !== format(endDate, 'yyyy-MM-dd')) {
    throw new Error('Lesson must start and end on the same day.');
  }
  if (endDate.getTime() <= startDate.getTime()) {
    throw new Error('End time must be later than start time.');
  }

  if (createIsRecurring) {
    const endTrim = (createRecurringEndDate || '').trim();
    if (endTrim && isBefore(parseISO(endTrim), startDate)) {
      throw new Error('"Repeat until" date must not be earlier than the first lesson.');
    }
    if (createRecurringFrequency !== 'monthly' && createRecurringWeekdays.length === 0) {
      throw new Error('Pasirinkite bent vieną savaitės dieną.');
    }
  }

  const durationMs = endDate.getTime() - startDate.getTime();

  const { data: studentPaymentRows } = await supabase
    .from('students')
    .select('id, payment_model, grade, pricing_lessons_per_week')
    .in('id', studentIdsToCreate);
  const paymentModelByStudentId = new Map(
    (studentPaymentRows ?? []).map((row: { id: string; payment_model?: string | null }) => [
      row.id,
      row.payment_model ?? null,
    ]),
  );
  const pricingStudentById = new Map(
    (studentPaymentRows ?? []).map((row: {
      id: string;
      grade?: string | null;
      pricing_lessons_per_week?: number | null;
    }) => [row.id, row]),
  );
  const planFrequency = contractedLessonsPerWeek(
    createIsRecurring,
    createRecurringWeekdays,
    null,
  );
  const pricingRulesForSubject = subj.is_group || subj.is_trial ? [] : dynamicPricingRules;
  const priceByStudentId = new Map(
    studentIdsToCreate.map((studentId) => {
      const individualPrice = individualPricing.find(
        (row) => row.student_id === studentId && row.subject_id === createSubjectId,
      )?.price;
      const student = pricingStudentById.get(studentId);
      return [
        studentId,
        resolveOrganizationLessonPrice({
          rules: pricingRulesForSubject,
          student,
          lessonsPerWeek: createIsRecurring ? planFrequency : student?.pricing_lessons_per_week,
          individualPrice,
          fallbackPrice: createPrice,
        }),
      ];
    }),
  );

  const syncGoogle = (sessionId: string) => {
    void (async () => {
      await fetch('/api/google-calendar-sync', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: createTutorId, sessionId }),
      });
    })().catch(() => {});
  };

  if (createIsRecurring) {
    const freq = createRecurringFrequency;
    const daysToCreate =
      freq !== 'monthly' && createRecurringWeekdays.length > 0
        ? createRecurringWeekdays
        : [getDay(startDate)];
    const timeStr = format(startDate, 'HH:mm:ss');
    const endTimeStr = format(endDate, 'HH:mm:ss');

    type RecurringTpl = { id: string; student_id: string; firstOccurrence: Date };
    const recurringTemplates: RecurringTpl[] = [];

    for (const dayOfWeek of daysToCreate) {
      let firstOccurrence = new Date(startDate);
      const startDow = firstOccurrence.getDay();
      if (startDow !== dayOfWeek) {
        const diff = (dayOfWeek - startDow + 7) % 7;
        firstOccurrence = addDays(firstOccurrence, diff);
      }

      for (const studentId of studentIdsToCreate) {
        const { data: template, error: tErr } = await supabase
          .from('recurring_individual_sessions')
          .insert({
            tutor_id: createTutorId,
            student_id: studentId,
            subject_id: createSubjectId || null,
            day_of_week: dayOfWeek,
            start_time: timeStr,
            end_time: endTimeStr,
            start_date: format(firstOccurrence, 'yyyy-MM-dd'),
            end_date: (createRecurringEndDate || '').trim() || null,
            meeting_link: createMeetingLink || null,
            topic: createTopic || null,
            price: priceByStudentId.get(studentId) ?? createPrice,
            active: true,
            frequency: freq,
          })
          .select('id, student_id')
          .single();
        if (tErr) throw new Error(tErr.message);
        if (template) {
          recurringTemplates.push({
            id: template.id,
            student_id: template.student_id,
            firstOccurrence,
          });
        }
      }
    }

    type PackageForRecurring = {
      id: string;
      available_lessons: number;
      reserved_lessons: number;
      item_id: string;
      pool_organization_id?: string | null;
      billing_period_start?: string | null;
      billing_period_end?: string | null;
      item_available_lessons: number;
      item_reserved_lessons: number;
    };
    const packagesByStudent = new Map<string, PackageForRecurring>();
    if (!createIsPaid && createSubjectId) {
      const uniqueStudentIds = [...new Set(recurringTemplates.map(t => t.student_id))];
      for (const sid of uniqueStudentIds) {
        const match = await findActivePackageForBooking(supabase, { studentId: sid, subjectId: createSubjectId });
        if (match) {
          packagesByStudent.set(sid, {
            id: match.pkg.id,
            pool_organization_id: match.pkg.pool_organization_id,
            billing_period_start: match.pkg.billing_period_start,
            billing_period_end: match.pkg.billing_period_end,
            available_lessons: match.pkg.available_lessons,
            reserved_lessons: match.pkg.reserved_lessons,
            item_id: match.item.id,
            item_available_lessons: match.item.available_lessons,
            item_reserved_lessons: match.item.reserved_lessons,
          });
        }
      }
    }

    const sessionsRows: Record<string, unknown>[] = [];
    const packagesUsage = new Map<string, number>();
    const endLimit = recurringMaterializeEndDate(createRecurringEndDate, startDate);

    for (const template of recurringTemplates) {
      let current = new Date(template.firstOccurrence);
      while (!isBefore(endLimit, current)) {
        const sessionEnd = new Date(current.getTime() + durationMs);
        const studentPaymentModel = paymentModelByStudentId.get(template.student_id) ?? null;
        let sessionPaid = createIsPaid;
        let sessionPaymentStatus = defaultSessionPaymentStatusForStudent(studentPaymentModel, {
          paid: createIsPaid,
          hasPackage: false,
        });
        let lessonPackageId: string | null = null;
        if (!createIsPaid) {
          const pkg = packagesByStudent.get(template.student_id);
          if (pkg) {
            const used = packagesUsage.get(pkg.id) || 0;
            const remaining = Math.min(pkg.available_lessons, pkg.item_available_lessons) - used;
            if (remaining > 0 && packageCoversLessonDate(pkg, current)) {
              lessonPackageId = pkg.id;
              sessionPaid = true;
              sessionPaymentStatus = 'confirmed';
              packagesUsage.set(pkg.id, used + 1);
            } else {
              sessionPaymentStatus = defaultSessionPaymentStatusForStudent(studentPaymentModel, {
                paid: false,
                hasPackage: false,
              });
            }
          } else {
            sessionPaymentStatus = defaultSessionPaymentStatusForStudent(studentPaymentModel, {
              paid: false,
              hasPackage: false,
            });
          }
        }
        sessionsRows.push({
          tutor_id: createTutorId,
          student_id: template.student_id,
          subject_id: createSubjectId || null,
          start_time: current.toISOString(),
          end_time: sessionEnd.toISOString(),
          status: 'active',
          meeting_link: createMeetingLink || null,
          topic: createTopic || null,
          price: priceByStudentId.get(template.student_id) ?? createPrice,
          paid: sessionPaid,
          payment_status: sessionPaymentStatus,
          lesson_package_id: lessonPackageId,
          tutor_comment: createTutorComment || null,
          show_comment_to_student: effectiveShowCommentToStudent,
          show_comment_to_parent: effectiveShowCommentToParent,
          recurring_session_id: template.id,
          created_by_role: 'org_admin',
          available_spots: subj.is_group ? subj.max_students : null,
          ...(schoolClassGroupId
            ? { class_group_id: schoolClassGroupId, school_billing_kind: 'base' }
            : {}),
        });
        current = advanceRecurringOccurrence(current, freq);
      }
    }

    if (createFirstLessonIsTrial && sessionsRows.length > 0) {
      const trialMeta = await resolveOrCreateTrialSubject(supabase, createTutorId, undefined, {
        useOrgPriceOnly: true,
      });
      const firstRow = [...sessionsRows].sort(
        (a, b) => new Date(String(a.start_time)).getTime() - new Date(String(b.start_time)).getTime(),
      )[0];
      if (firstRow) {
        const firstStart = new Date(String(firstRow.start_time));
        firstRow.subject_id = trialMeta.subject.id;
        firstRow.price = trialMeta.price;
        firstRow.end_time = new Date(firstStart.getTime() + trialMeta.durationMinutes * 60 * 1000).toISOString();
        if (!String(firstRow.topic || '').trim()) {
          firstRow.topic = trialMeta.topic;
        }
      }
    }

    if (sessionsRows.length === 0) throw new Error('Failed to generate lessons.');
    try {
      await assertTutorSlotsFree(
        supabase,
        createTutorId,
        sessionsRows.map((row) => ({
          start: new Date(row.start_time as string),
          end: new Date(row.end_time as string),
        })),
      );
    } catch (overlapErr) {
      const tplIds = recurringTemplates.map((t) => t.id);
      if (tplIds.length) {
        await supabase.from('recurring_individual_sessions').delete().in('id', tplIds);
      }
      throw overlapErr;
    }
    const { data: inserted, error: insErr } = await supabase
      .from('sessions')
      .insert(sessionsRows)
      .select('id, student_id, paid, lesson_package_id, payment_status, price, start_time, end_time');
    if (insErr) throw new Error(insErr.message);

    await consumeAvailabilityForCreatedSessions(supabase, createTutorId, inserted || []);

    for (const [pkgId, usedCount] of packagesUsage.entries()) {
      const pkg = Array.from(packagesByStudent.values()).find((x) => x.id === pkgId);
      if (!pkg || pkg.pool_organization_id || usedCount <= 0) continue;
      const { error: itemErr } = await supabase
        .from('lesson_package_items')
        .update({
          available_lessons: pkg.item_available_lessons - usedCount,
          reserved_lessons: pkg.item_reserved_lessons + usedCount,
        })
        .eq('id', pkg.item_id);
      if (itemErr) {
        console.error('[OrgSchedule] item update failed:', itemErr);
        continue;
      }
      await supabase
        .from('lesson_packages')
        .update({
          available_lessons: pkg.available_lessons - usedCount,
          reserved_lessons: (pkg.reserved_lessons || 0) + usedCount,
        })
        .eq('id', pkgId);
    }

    const allCreated = ((inserted || []) as CreatedSessionRow[]).sort(
      (a, b) => new Date(String(a.start_time)).getTime() - new Date(String(b.start_time)).getTime(),
    );
    await notifyAfterOrgAdminSessionsCreated(
      supabase,
      createTutorId,
      allCreated,
      createTopic || subj.name || 'Pamoka',
      true,
      !(createRecurringEndDate || '').trim(),
    );

    for (const row of inserted || []) {
      syncGoogle((row as { id: string }).id);
    }

    await persistRecurringPlanFrequency(supabase, [...new Set(recurringTemplates.map((t) => t.student_id))], planFrequency);

    if (!p.suppressSuccessAlert) alert(`Created ${sessionsRows.length} recurring lessons.`);
    return { createdSessionIds: allCreated.map((row) => row.id) };
  }

  const sessionsToInsert: Record<string, unknown>[] = [];
  const packagesToUpdate: Array<{
    id: string;
    available_lessons: number;
    reserved_lessons: number;
    item_id: string;
    pool_organization_id?: string | null;
    billing_period_start?: string | null;
    billing_period_end?: string | null;
    item_available_lessons: number;
    item_reserved_lessons: number;
  }> = [];

  for (const studentId of studentIdsToCreate) {
    const studentPaymentModel = paymentModelByStudentId.get(studentId) ?? null;
    let sessionPaid = createIsPaid;
    let sessionPaymentStatus = defaultSessionPaymentStatusForStudent(studentPaymentModel, {
      paid: createIsPaid,
      hasPackage: false,
    });
    let lessonPackageId: string | null = null;

    if (!createIsMakeup && !createIsPaid && createSubjectId) {
      const match = await findActivePackageForBooking(supabase, {
        studentId,
        subjectId: createSubjectId,
        startIso: startDate.toISOString(),
      });
      if (match) {
        const { pkg, item } = match;
        lessonPackageId = pkg.id;
        sessionPaid = true;
        sessionPaymentStatus = 'confirmed';
        if (!pkg.pool_organization_id) packagesToUpdate.push({
          id: pkg.id,
          pool_organization_id: pkg.pool_organization_id,
          billing_period_start: pkg.billing_period_start,
          billing_period_end: pkg.billing_period_end,
          available_lessons: pkg.available_lessons - 1,
          reserved_lessons: pkg.reserved_lessons + 1,
          item_id: item.id,
          item_available_lessons: item.available_lessons - 1,
          item_reserved_lessons: item.reserved_lessons + 1,
        });
      } else {
        sessionPaymentStatus = defaultSessionPaymentStatusForStudent(studentPaymentModel, {
          paid: false,
          hasPackage: false,
        });
      }
    }

    if (createIsMakeup) {
      sessionPaid = true;
      sessionPaymentStatus = 'confirmed';
      lessonPackageId = null;
    }

    sessionsToInsert.push({
      tutor_id: createTutorId,
      student_id: studentId,
      subject_id: createSubjectId || null,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      status: 'active',
      meeting_link: createMeetingLink || null,
      topic: createTopic || null,
      price: priceByStudentId.get(studentId) ?? createPrice,
      paid: sessionPaid,
      payment_status: sessionPaymentStatus,
      lesson_package_id: lessonPackageId,
      tutor_comment: createTutorComment || null,
      show_comment_to_student: effectiveShowCommentToStudent,
      show_comment_to_parent: effectiveShowCommentToParent,
      created_by_role: 'org_admin',
      available_spots: subj.is_group ? subj.max_students : null,
      is_makeup: createIsMakeup,
      ...(schoolClassGroupId
        ? { class_group_id: schoolClassGroupId, school_billing_kind: 'base' }
        : {}),
    });
  }

  await assertTutorSlotsFree(supabase, createTutorId, [{ start: startDate, end: endDate }]);

  const { data: created, error } = await supabase.from('sessions').insert(sessionsToInsert).select();
  if (error) throw new Error(error.message);

  await consumeAvailabilityForCreatedSessions(supabase, createTutorId, created || []);

  for (const pkgUpdate of packagesToUpdate) {
    const { error: itemErr } = await supabase
      .from('lesson_package_items')
      .update({
        available_lessons: pkgUpdate.item_available_lessons,
        reserved_lessons: pkgUpdate.item_reserved_lessons,
      })
      .eq('id', pkgUpdate.item_id);
    if (itemErr) {
      console.error('[OrgSchedule] item update failed:', itemErr);
      continue;
    }
    await supabase
      .from('lesson_packages')
      .update({
        available_lessons: pkgUpdate.available_lessons,
        reserved_lessons: pkgUpdate.reserved_lessons,
      })
      .eq('id', pkgUpdate.id);
  }

  await notifyAfterOrgAdminSessionsCreated(
    supabase,
    createTutorId,
    (created || []) as CreatedSessionRow[],
    createTopic || subj.name || 'Pamoka',
  );

  const { data: tutorProfile } = await supabase
    .from('profiles')
    .select('full_name, stripe_account_id, organization_id')
    .eq('id', createTutorId)
    .single();

  const stripeIds = [...new Set((created || []).map(s => (s as { student_id: string }).student_id))];
  const { data: studentsStripe } = await supabase
    .from('students')
    .select('id, full_name, email, payment_payer, payer_email, parent_secondary_email, linked_user_id')
    .in('id', stripeIds);
  const studentByIdStripe = new Map(studentsStripe?.map(s => [s.id, s]) ?? []);

  for (const session of created || []) {
    const sess = session as { id: string; paid?: boolean; student_id: string };
    const studentData = studentByIdStripe.get(sess.student_id);

    if (
      !sess.paid &&
      studentData?.payment_payer === 'parent' &&
      studentData?.payer_email &&
      tutorProfile?.stripe_account_id
    ) {
      await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId: sess.id, payerEmail: studentData.payer_email }),
      });
    }

    if ((effectiveShowCommentToStudent || effectiveShowCommentToParent) && createTutorComment.trim()) {
      let showToParent = effectiveShowCommentToParent;
      if (!showToParent && effectiveShowCommentToStudent) {
        try {
          const orgId = (tutorProfile as any)?.organization_id as string | null | undefined;
          if (orgId) {
            const [{ data: orgRow }, { data: subjRow }] = await Promise.all([
              supabase.from('organizations').select('features').eq('id', orgId).maybeSingle(),
              supabase.from('subjects').select('is_trial').eq('id', createSubjectId).maybeSingle(),
            ]);
            const feat = (orgRow as any)?.features;
            const featObj = feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {};
            const mode = featObj['trial_lesson_comment_mode'];
            showToParent = mode === 'student_and_parent' && (subjRow as any)?.is_trial === true;
          }
        } catch {
          /* ignore trial parent auto-send errors */
        }
      }
      const studentEmail = await resolveStudentNotificationEmail(studentData);
      const recipients = sessionCommentDeliveryRecipients({
        nextComment: createTutorComment,
        showToStudent: effectiveShowCommentToStudent,
        showToParent,
        studentEmail,
        parentEmails: [studentData?.payer_email, studentData?.parent_secondary_email],
      });
      if (recipients.length > 0) {
        sendEmail({
          type: 'session_comment_added',
          to: recipients,
          data: {
            studentName: studentData?.full_name || '',
            tutorName: tutorProfile?.full_name || '',
            date: format(startDate, 'yyyy-MM-dd'),
            time: format(startDate, 'HH:mm'),
            comment: createTutorComment,
            ...((tutorProfile as any)?.organization_id ? { organizationId: (tutorProfile as any).organization_id } : {}),
          },
        }).catch(() => {});
      }
    }

    syncGoogle(sess.id);
  }

  if (!p.suppressSuccessAlert) {
    if (isGroupLesson && studentIdsToCreate.length > 1) {
      alert(`Created ${studentIdsToCreate.length} group lessons.`);
    } else {
      alert('Pamoka sukurta!');
    }
  }

  return {
    createdSessionIds: ((created || []) as Array<{ id: string; start_time: string }>)
      .slice()
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((row) => row.id),
  };
}

export type ConvertOrgAdminSessionToRecurringInput = {
  supabase: SupabaseClient;
  organizationId: string;
  sessionId: string;
  tutorId: string;
  studentId: string;
  subjectId: string | null;
  startTime: string;
  endTime: string;
  topic: string | null;
  meetingLink: string | null;
  price: number;
  paid: boolean;
  paymentStatus: string;
  lessonPackageId?: string | null;
  tutorComment: string | null;
  showCommentToStudent: boolean;
  showCommentToParent: boolean;
  status: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  weekdays: number[];
  recurringEndDate: string;
};

export interface ConvertOrgAdminSessionToRecurringResult {
  recurringSessionId: string;
  createdSessionIds: string[];
  updatedSessionId: string;
}

/** Pro Klasė: turn a one-off org-admin lesson into a recurring series (anchor row is updated, future rows inserted). */
export async function convertOrgAdminSessionToRecurring(
  p: ConvertOrgAdminSessionToRecurringInput,
): Promise<ConvertOrgAdminSessionToRecurringResult> {
  const {
    supabase,
    organizationId,
    sessionId,
    tutorId,
    studentId,
    subjectId,
    startTime,
    endTime,
    topic,
    meetingLink,
    price,
    paid,
    paymentStatus,
    lessonPackageId = null,
    tutorComment,
    showCommentToStudent,
    showCommentToParent,
    status,
    frequency,
    weekdays,
    recurringEndDate,
  } = p;

  if (!isProKlaseOrg(organizationId)) {
    throw new Error('Pasikartojančios pamokos redagavimas galimas tik Pro Klasė organizacijai.');
  }

  const newStart = new Date(startTime);
  const newEnd = new Date(endTime);
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
    throw new Error('Neteisinga data ar laikas.');
  }
  if (format(newStart, 'yyyy-MM-dd') !== format(newEnd, 'yyyy-MM-dd')) {
    throw new Error('Lesson must start and end on the same day.');
  }
  if (newEnd.getTime() <= newStart.getTime()) {
    throw new Error('End time must be later than start time.');
  }
  const endTrim = (recurringEndDate || '').trim();
  if (endTrim && isBefore(parseISO(endTrim), newStart)) {
    throw new Error('"Repeat until" date must not be earlier than the first lesson.');
  }
  if (frequency !== 'monthly' && weekdays.length === 0) {
    throw new Error('Pasirinkite bent vieną savaitės dieną.');
  }

  const durationMs = newEnd.getTime() - newStart.getTime();
  const timeStr = format(newStart, 'HH:mm:ss');
  const endTimeStr = format(newEnd, 'HH:mm:ss');
  const daysToCreate =
    frequency !== 'monthly' && weekdays.length > 0 ? weekdays : [getDay(newStart)];
  const anchorDay = getDay(newStart);
  const anchorMinute = Math.floor(newStart.getTime() / 60000);

  type RecurringTpl = { id: string; student_id: string; dayOfWeek: number; firstOccurrence: Date };
  const recurringTemplates: RecurringTpl[] = [];

  for (const dayOfWeek of daysToCreate) {
    let firstOccurrence = new Date(newStart);
    const startDow = firstOccurrence.getDay();
    if (startDow !== dayOfWeek) {
      const diff = (dayOfWeek - startDow + 7) % 7;
      firstOccurrence = addDays(firstOccurrence, diff);
    }

    const { data: template, error: tErr } = await supabase
      .from('recurring_individual_sessions')
      .insert({
        tutor_id: tutorId,
        student_id: studentId,
        subject_id: subjectId,
        day_of_week: dayOfWeek,
        start_time: timeStr,
        end_time: endTimeStr,
        start_date: format(firstOccurrence, 'yyyy-MM-dd'),
        end_date: endTrim || null,
        meeting_link: meetingLink || null,
        topic: topic || null,
        price,
        active: true,
        frequency,
      })
      .select('id, student_id')
      .single();
    if (tErr) throw new Error(tErr.message);
    if (template) {
      recurringTemplates.push({
        id: template.id as string,
        student_id: template.student_id as string,
        dayOfWeek,
        firstOccurrence,
      });
    }
  }

  const anchorTemplate =
    recurringTemplates.find((t) => t.dayOfWeek === anchorDay) ?? recurringTemplates[0];
  if (!anchorTemplate) throw new Error('Nepavyko sukurti pasikartojančio grafiko.');

  const updatePayload: Record<string, unknown> = {
    tutor_id: tutorId,
    student_id: studentId,
    subject_id: subjectId,
    start_time: newStart.toISOString(),
    end_time: newEnd.toISOString(),
    topic: topic || null,
    meeting_link: meetingLink || null,
    price,
    paid,
    payment_status: paymentStatus,
    lesson_package_id: lessonPackageId,
    status,
    tutor_comment: tutorComment || null,
    show_comment_to_student: showCommentToStudent,
    show_comment_to_parent: showCommentToParent,
    recurring_session_id: anchorTemplate.id,
    created_by_role: 'org_admin',
  };

  const { error: updateErr } = await supabase.from('sessions').update(updatePayload).eq('id', sessionId);
  if (updateErr) {
    const tplIds = recurringTemplates.map((t) => t.id);
    if (tplIds.length) await supabase.from('recurring_individual_sessions').delete().in('id', tplIds);
    throw new Error(updateErr.message);
  }

  await consumeAvailabilityForCreatedSessions(supabase, tutorId, [
    { start_time: newStart.toISOString(), end_time: newEnd.toISOString() },
  ]);

  const { data: studentRow } = await supabase
    .from('students')
    .select('payment_model')
    .eq('id', studentId)
    .maybeSingle();
  const studentPaymentModel = (studentRow as { payment_model?: string | null } | null)?.payment_model ?? null;

  type PackageForRecurring = {
    id: string;
    available_lessons: number;
    reserved_lessons: number;
    item_id: string;
    pool_organization_id?: string | null;
    billing_period_start?: string | null;
    billing_period_end?: string | null;
    item_available_lessons: number;
    item_reserved_lessons: number;
  };
  let pkg: PackageForRecurring | null = null;
  if (!paid && subjectId) {
    const match = await findActivePackageForBooking(supabase, { studentId, subjectId });
    if (match) {
      pkg = {
        id: match.pkg.id,
        pool_organization_id: match.pkg.pool_organization_id,
        billing_period_start: match.pkg.billing_period_start,
        billing_period_end: match.pkg.billing_period_end,
        available_lessons: match.pkg.available_lessons,
        reserved_lessons: match.pkg.reserved_lessons,
        item_id: match.item.id,
        item_available_lessons: match.item.available_lessons,
        item_reserved_lessons: match.item.reserved_lessons,
      };
    }
  }

  const sessionsRows: Record<string, unknown>[] = [];
  const packagesUsage = new Map<string, number>();
  const endLimit = recurringMaterializeEndDate(recurringEndDate, newStart);

  for (const template of recurringTemplates) {
    const isAnchorDay = template.dayOfWeek === anchorDay;
    let current = isAnchorDay
      ? advanceRecurringOccurrence(newStart, frequency)
      : new Date(template.firstOccurrence);
    if (!isAnchorDay && current.getTime() < newStart.getTime()) {
      while (current.getTime() < newStart.getTime() && !isBefore(endLimit, current)) {
        const next = advanceRecurringOccurrence(current, frequency);
        if (next.getTime() === current.getTime()) break;
        current = next;
      }
    }

    while (!isBefore(endLimit, current)) {
      if (Math.floor(current.getTime() / 60000) === anchorMinute) {
        current = advanceRecurringOccurrence(current, frequency);
        continue;
      }
      const sessionEnd = new Date(current.getTime() + durationMs);
      let sessionPaid = paid;
      let sessionPaymentStatus = paymentStatus;
      let rowPackageId: string | null = null;
      if (!paid && pkg) {
        const used = packagesUsage.get(pkg.id) || 0;
        const remaining = Math.min(pkg.available_lessons, pkg.item_available_lessons) - used;
        if (remaining > 0 && packageCoversLessonDate(pkg, current)) {
          rowPackageId = pkg.id;
          sessionPaid = true;
          sessionPaymentStatus = 'confirmed';
          packagesUsage.set(pkg.id, used + 1);
        } else {
          sessionPaymentStatus = defaultSessionPaymentStatusForStudent(studentPaymentModel, {
            paid: false,
            hasPackage: false,
          });
        }
      }
      sessionsRows.push({
        tutor_id: tutorId,
        student_id: studentId,
        subject_id: subjectId,
        start_time: current.toISOString(),
        end_time: sessionEnd.toISOString(),
        status: 'active',
        meeting_link: meetingLink || null,
        topic: topic || null,
        price,
        paid: sessionPaid,
        payment_status: sessionPaymentStatus,
        lesson_package_id: rowPackageId,
        tutor_comment: tutorComment || null,
        show_comment_to_student: showCommentToStudent,
        show_comment_to_parent: showCommentToParent,
        recurring_session_id: template.id,
        created_by_role: 'org_admin',
      });
      current = advanceRecurringOccurrence(current, frequency);
    }
  }

  let createdSessionIds: string[] = [];
  if (sessionsRows.length > 0) {
    try {
      await assertTutorSlotsFree(
        supabase,
        tutorId,
        sessionsRows.map((row) => ({
          start: new Date(String(row.start_time)),
          end: new Date(String(row.end_time)),
        })),
        [sessionId],
      );
    } catch (overlapErr) {
      const tplIds = recurringTemplates.map((t) => t.id);
      if (tplIds.length) await supabase.from('recurring_individual_sessions').delete().in('id', tplIds);
      await supabase.from('sessions').update({ recurring_session_id: null }).eq('id', sessionId);
      throw overlapErr;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('sessions')
      .insert(sessionsRows)
      .select('id, student_id, paid, lesson_package_id, payment_status, price, start_time, end_time');
    if (insErr) {
      const tplIds = recurringTemplates.map((t) => t.id);
      if (tplIds.length) await supabase.from('recurring_individual_sessions').delete().in('id', tplIds);
      await supabase.from('sessions').update({ recurring_session_id: null }).eq('id', sessionId);
      throw new Error(insErr.message);
    }

    await consumeAvailabilityForCreatedSessions(supabase, tutorId, inserted || []);
    createdSessionIds = ((inserted || []) as Array<{ id: string }>).map((row) => row.id);

    if (pkg && !pkg.pool_organization_id) {
      const usedCount = packagesUsage.get(pkg.id) || 0;
      if (usedCount > 0) {
        await supabase
          .from('lesson_package_items')
          .update({
            available_lessons: pkg.item_available_lessons - usedCount,
            reserved_lessons: pkg.item_reserved_lessons + usedCount,
          })
          .eq('id', pkg.item_id);
        await supabase
          .from('lesson_packages')
          .update({
            available_lessons: pkg.available_lessons - usedCount,
            reserved_lessons: (pkg.reserved_lessons || 0) + usedCount,
          })
          .eq('id', pkg.id);
      }
    }

    const allCreated = ([{ id: sessionId, student_id: studentId, paid, payment_status: paymentStatus, price, start_time: startTime, end_time: endTime }] as CreatedSessionRow[])
      .concat((inserted || []) as CreatedSessionRow[])
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    await notifyAfterOrgAdminSessionsCreated(
      supabase,
      tutorId,
      allCreated,
      topic || 'Pamoka',
      true,
      !endTrim,
    );
  }

  await persistRecurringPlanFrequency(
    supabase,
    [studentId],
    contractedLessonsPerWeek(true, weekdays, null),
  );

  return {
    recurringSessionId: anchorTemplate.id,
    createdSessionIds,
    updatedSessionId: sessionId,
  };
}
