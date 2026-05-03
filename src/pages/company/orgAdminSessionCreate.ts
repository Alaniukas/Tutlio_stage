import { format, parseISO, getDay, addWeeks, addDays, addMonths, isBefore } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { authHeaders } from '@/lib/apiHelpers';

type SubjectLite = {
  id: string;
  name?: string | null;
  price: number | null;
  duration_minutes?: number | null;
  is_group?: boolean | null;
  max_students?: number | null;
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
): Promise<void> {
  const seen = new Set<string>();
  for (const { start, end } of slots) {
    const key = `${start.getTime()}_${end.getTime()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { data, error } = await supabase
      .from('sessions')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('status', 'active')
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
      .limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) {
      throw new Error(
        `Tutor already has a lesson at this time (${format(start, 'yyyy-MM-dd')} ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}). Choose a different time.`,
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
) {
  if (sessionsForNotify.length === 0) return;

  const { data: tutorProfile } = await supabase
    .from('profiles')
    .select('full_name, email, stripe_account_id, cancellation_hours, cancellation_fee_percent')
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

  if (tutorProfile?.email) {
    void sendEmail({
      type: 'booking_notification',
      to: tutorProfile.email,
      data: {
        scheduledByOrgAdmin: true,
        studentName: tutorStudentLabel,
        tutorName: tutorProfile.full_name || '',
        date: format(tutorStart, 'yyyy-MM-dd'),
        time: format(tutorStart, 'HH:mm'),
      },
    }).catch(err => console.error('[OrgSchedule] tutor notify', err));
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
            paymentReminderNote: true,
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
        },
      }).catch(err => console.error('[OrgSchedule] student booking', err));
    }

    if (hasPayer) {
      void sendEmail({
        type: 'booking_confirmation',
        to: payerRaw,
        data: {
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
        },
      }).catch(err => console.error('[OrgSchedule] payer booking', err));
    } else if (!st.email && payerRaw) {
      void sendEmail({
        type: 'booking_confirmation',
        to: payerRaw,
        data: {
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
  createTutorComment: string;
  createShowCommentToStudent: boolean;
  subjects: SubjectLite[];
  individualPricing: PricingRow[];
  tutorSubjectPrices?: TutorSubjectPriceRow[];
  orgSubjectTemplateId?: string;
}

/**
 * Org admin calendar: create one-off or recurring session(s) for an org tutor (same rules as tutor Calendar).
 */
export async function runOrgAdminCreateSession(p: OrgAdminCreateSessionInput): Promise<void> {
  const {
    supabase,
    createTutorId,
    createSubjectId,
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
    createPrice,
    createTutorComment,
    createShowCommentToStudent,
    subjects,
    individualPricing,
    tutorSubjectPrices,
    orgSubjectTemplateId,
  } = p;

  const subj = subjects.find(s => s.id === createSubjectId);
  if (!subj) throw new Error('Dalykas nerastas.');
  const tutorSubjPrice = (tutorSubjectPrices || []).find(
    t => t.tutor_id === createTutorId && t.org_subject_template_id === (orgSubjectTemplateId || ''),
  );
  let effectiveShowCommentToStudent = createShowCommentToStudent;
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
      }
    } catch {
      // non-blocking: fallback to manual checkbox value
    }
  }
  const isGroupLesson = Boolean(subj.is_group);
  const studentIdsToCreate = isGroupLesson
    ? createStudentIds
    : (createStudentId ? [createStudentId] : []);
  if (studentIdsToCreate.length === 0) {
    throw new Error(isGroupLesson ? 'Select at least one student for a group lesson.' : 'Select a student.');
  }

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
    if (!createRecurringEndDate) {
      throw new Error('Specify the last date for the recurring lesson.');
    }
    if (isBefore(parseISO(createRecurringEndDate), startDate)) {
      throw new Error('"Repeat until" date must not be earlier than the first lesson.');
    }
    if (createRecurringFrequency !== 'monthly' && createRecurringWeekdays.length === 0) {
      throw new Error('Pasirinkite bent vieną savaitės dieną.');
    }
  }

  const durationMs = endDate.getTime() - startDate.getTime();

  const syncGoogle = (sessionId: string) => {
    void (async () => {
      await fetch('/api/google-calendar-sync', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: createTutorId, sessionId }),
      });
    })().catch(() => {});
  };

  if (createIsRecurring && createRecurringEndDate) {
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
        const pricing = individualPricing.find(
          row => row.student_id === studentId && row.subject_id === createSubjectId,
        );
        const studentPrice = pricing?.price ?? tutorSubjPrice?.price ?? subj.price ?? createPrice;
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
            end_date: createRecurringEndDate,
            meeting_link: createMeetingLink || null,
            topic: createTopic || null,
            price: studentPrice,
            active: true,
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

    const packagesByStudent = new Map<string, any>();
    if (!createIsPaid && createSubjectId) {
      const uniqueStudentIds = [...new Set(recurringTemplates.map(t => t.student_id))];
      for (const sid of uniqueStudentIds) {
        const { data: packages } = await supabase
          .from('lesson_packages')
          .select('*')
          .eq('student_id', sid)
          .eq('subject_id', createSubjectId)
          .eq('active', true)
          .eq('paid', true)
          .gt('available_lessons', 0)
          .order('created_at', { ascending: true })
          .limit(1);
        if (packages?.[0]) packagesByStudent.set(sid, packages[0]);
      }
    }

    const sessionsRows: Record<string, unknown>[] = [];
    const packagesUsage = new Map<string, number>();
    const endLimit = parseISO(createRecurringEndDate);

    const advanceCurrent = (d: Date): Date => {
      switch (freq) {
        case 'biweekly':
          return addWeeks(d, 2);
        case 'monthly':
          return addMonths(d, 1);
        default:
          return addWeeks(d, 1);
      }
    };

    for (const template of recurringTemplates) {
      let current = new Date(template.firstOccurrence);
      while (!isBefore(endLimit, current)) {
        const sessionEnd = new Date(current.getTime() + durationMs);
        const pricing = individualPricing.find(
          row => row.student_id === template.student_id && row.subject_id === createSubjectId,
        );
        const studentPrice = pricing?.price ?? tutorSubjPrice?.price ?? subj.price ?? createPrice;
        let sessionPaid = createIsPaid;
        let sessionPaymentStatus = createIsPaid ? 'paid' : 'pending';
        let lessonPackageId: string | null = null;
        if (!createIsPaid) {
          const pkg = packagesByStudent.get(template.student_id);
          if (pkg) {
            const used = packagesUsage.get(pkg.id) || 0;
            if (pkg.available_lessons - used > 0) {
              lessonPackageId = pkg.id;
              sessionPaid = true;
              sessionPaymentStatus = 'confirmed';
              packagesUsage.set(pkg.id, used + 1);
            }
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
          price: studentPrice,
          paid: sessionPaid,
          payment_status: sessionPaymentStatus,
          lesson_package_id: lessonPackageId,
          tutor_comment: createTutorComment || null,
          show_comment_to_student: effectiveShowCommentToStudent,
          recurring_session_id: template.id,
          created_by_role: 'org_admin',
          available_spots: subj.is_group ? subj.max_students : null,
        });
        current = advanceCurrent(current);
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

    for (const [pkgId, usedCount] of packagesUsage.entries()) {
      const pkg = Array.from(packagesByStudent.values()).find((x: any) => x.id === pkgId);
      if (pkg) {
        await supabase
          .from('lesson_packages')
          .update({
            available_lessons: pkg.available_lessons - usedCount,
            reserved_lessons: (pkg.reserved_lessons || 0) + usedCount,
          })
          .eq('id', pkgId);
      }
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
    );

    for (const row of inserted || []) {
      syncGoogle((row as { id: string }).id);
    }

    alert(`Created ${sessionsRows.length} recurring lessons.`);
    return;
  }

  const sessionsToInsert: Record<string, unknown>[] = [];
  const packagesToUpdate: { id: string; available_lessons: number; reserved_lessons: number }[] = [];

  for (const studentId of studentIdsToCreate) {
    const pricing = individualPricing.find(
      row => row.student_id === studentId && row.subject_id === createSubjectId
    );
    const studentPrice = pricing?.price ?? tutorSubjPrice?.price ?? subj.price ?? createPrice;
    let sessionPaid = createIsPaid;
    let sessionPaymentStatus = createIsPaid ? 'paid' : 'pending';
    let lessonPackageId: string | null = null;

    if (!createIsPaid && createSubjectId) {
      const { data: packages } = await supabase
        .from('lesson_packages')
        .select('*')
        .eq('student_id', studentId)
        .eq('subject_id', createSubjectId)
        .eq('active', true)
        .eq('paid', true)
        .gt('available_lessons', 0)
        .order('created_at', { ascending: true })
        .limit(1);
      if (packages?.[0]) {
        const pkg = packages[0];
        lessonPackageId = pkg.id;
        sessionPaid = true;
        sessionPaymentStatus = 'confirmed';
        packagesToUpdate.push({
          id: pkg.id,
          available_lessons: pkg.available_lessons - 1,
          reserved_lessons: (pkg.reserved_lessons || 0) + 1,
        });
      }
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
      price: studentPrice,
      paid: sessionPaid,
      payment_status: sessionPaymentStatus,
      lesson_package_id: lessonPackageId,
      tutor_comment: createTutorComment || null,
      show_comment_to_student: effectiveShowCommentToStudent,
      created_by_role: 'org_admin',
      available_spots: subj.is_group ? subj.max_students : null,
    });
  }

  await assertTutorSlotsFree(supabase, createTutorId, [{ start: startDate, end: endDate }]);

  const { data: created, error } = await supabase.from('sessions').insert(sessionsToInsert).select();
  if (error) throw new Error(error.message);

  for (const pkgUpdate of packagesToUpdate) {
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
    .select('id, full_name, email, payment_payer, payer_email')
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

    if (effectiveShowCommentToStudent && createTutorComment && studentData?.email) {
      let to: string | string[] = studentData.email;
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
          const sendToParent = mode === 'student_and_parent' && (subjRow as any)?.is_trial === true;
          const payer = (studentData as any)?.payer_email as string | null | undefined;
          if (sendToParent && payer && payer.trim().length > 0 && payer.trim() !== studentData.email.trim()) {
            to = [studentData.email, payer.trim()];
          }
        }
      } catch {
        /* ignore parent email decision errors */
      }
      sendEmail({
        type: 'session_comment_added',
        to,
        data: {
          studentName: studentData.full_name || '',
          tutorName: tutorProfile?.full_name || '',
          date: format(startDate, 'yyyy-MM-dd'),
          time: format(startDate, 'HH:mm'),
          comment: createTutorComment,
        },
      }).catch(() => {});
    }

    syncGoogle(sess.id);
  }

  if (isGroupLesson && studentIdsToCreate.length > 1) {
    alert(`Created ${studentIdsToCreate.length} group lessons.`);
  } else {
    alert('Pamoka sukurta!');
  }
}
