import { orgTutorSessionPayEur } from '../../src/lib/orgTutorLessonPay.js';

type TutorLesson = {
  id: string;
  subject_id?: string | null;
  price?: number | null;
  tutor_pay_eur_snapshot?: number | null;
};

/** Stop Mano tutor invoices before any invoice number is allocated if pay is missing. */
export function findUnpricedManoTutorSessions(
  sessions: TutorLesson[],
  organizationId: string | null,
  defaultRate: number | null,
  bySubject: unknown,
): string[] {
  return sessions
    .filter((session) => orgTutorSessionPayEur({
      organizationId,
      defaultRate,
      bySubject,
      subjectId: session.subject_id,
      sessionPrice: session.price,
      tutorPaySnapshot: session.tutor_pay_eur_snapshot,
    }) <= 0)
    .map((session) => session.id);
}
