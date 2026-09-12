import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { isMoksloVaisiaiOrg } from '@/lib/marketMoney';
import { isFirstLessonAfterCreate } from '@/lib/mvFirstLessonPlanned';

type NotifyTutorAfterLessonBookedOpts = {
  supabase: SupabaseClient;
  tutorId: string;
  tutorEmail: string;
  tutorName: string;
  organizationId?: string | null;
  studentId: string;
  studentName: string;
  sessionId: string;
  date: string;
  time: string;
  scheduledByOrgAdmin?: boolean;
  paymentStatus?: string;
  organizationTutor?: boolean;
  sessionsCreatedForPair?: number;
};

/** MV: first lesson only (`mv_first_lesson_planned_tutor`). Others: `booking_notification`. */
export async function notifyTutorAfterLessonBooked(opts: NotifyTutorAfterLessonBookedOpts): Promise<void> {
  const {
    supabase,
    tutorId,
    tutorEmail,
    tutorName,
    organizationId,
    studentId,
    studentName,
    sessionId,
    date,
    time,
    scheduledByOrgAdmin,
    paymentStatus,
    organizationTutor,
    sessionsCreatedForPair = 1,
  } = opts;

  const orgPayload = organizationId ? { organizationId } : {};
  const isMv = isMoksloVaisiaiOrg(organizationId);

  if (isMv) {
    const isFirst = await isFirstLessonAfterCreate(supabase, studentId, tutorId, sessionsCreatedForPair);
    if (!isFirst) return;

    await sendEmail({
      type: 'mv_first_lesson_planned_tutor',
      to: tutorEmail,
      data: {
        studentName,
        tutorName,
        date,
        time,
        sessionId,
        scheduledByOrgAdmin: scheduledByOrgAdmin === true,
        ...orgPayload,
      },
    });
    return;
  }

  await sendEmail({
    type: 'booking_notification',
    to: tutorEmail,
    data: {
      studentName: studentName || 'Mokinys',
      tutorName,
      date,
      time,
      paymentStatus,
      organizationTutor,
      hidePaymentStatus: organizationTutor,
      sessionId,
      scheduledByOrgAdmin,
      ...orgPayload,
    },
  });
}
