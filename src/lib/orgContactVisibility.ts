export type TutorSeesContactMode = 'both' | 'student' | 'parent' | 'none';
export type StudentSeesTutorContactMode = 'show' | 'hide';

export const DEFAULT_TUTOR_SEES_CONTACT: TutorSeesContactMode = 'both';
export const DEFAULT_STUDENT_SEES_TUTOR: StudentSeesTutorContactMode = 'show';

export interface OrgContactVisibility {
  tutorSeesStudentEmail: TutorSeesContactMode;
  tutorSeesStudentPhone: TutorSeesContactMode;
  studentSeesTutorEmail: StudentSeesTutorContactMode;
  studentSeesTutorPhone: StudentSeesTutorContactMode;
}

export function parseOrgContactVisibility(features: Record<string, unknown> | null | undefined): OrgContactVisibility {
  const f = features || {};
  const pick = (k: string, d: TutorSeesContactMode): TutorSeesContactMode => {
    const v = f[k];
    if (v === 'both' || v === 'student' || v === 'parent' || v === 'none') return v;
    return d;
  };
  const pickShow = (k: string): StudentSeesTutorContactMode => {
    const v = f[k];
    if (v === 'show' || v === 'hide') return v;
    return 'show';
  };
  return {
    tutorSeesStudentEmail: pick('contact_tutor_student_email', DEFAULT_TUTOR_SEES_CONTACT),
    tutorSeesStudentPhone: pick('contact_tutor_student_phone', DEFAULT_TUTOR_SEES_CONTACT),
    studentSeesTutorEmail: pickShow('contact_student_tutor_email'),
    studentSeesTutorPhone: pickShow('contact_student_tutor_phone'),
  };
}

/** Single-column text for org tutor table */
export function formatContactForTutorView(
  studentVal: string | null | undefined,
  parentVal: string | null | undefined,
  mode: TutorSeesContactMode,
): string {
  const s = (studentVal || '').trim();
  const p = (parentVal || '').trim();
  switch (mode) {
    case 'none':
      return '—';
    case 'student':
      return s || '—';
    case 'parent':
      return p || s || '—';
    case 'both':
    default:
      if (s && p && s !== p) return `${s} · ${p}`;
      return s || p || '—';
  }
}

export function maskTutorContact(value: string | null | undefined, mode: StudentSeesTutorContactMode): string {
  if (mode === 'hide') return '—';
  const v = (value || '').trim();
  return v || '—';
}

function normEmailLocal(v: string | null | undefined): string {
  return (v || '').trim().toLowerCase();
}

/** Show payer contacts only when the student is managed by parents and their contact info differs from the student. */
/**
 * Email fields for tutor notifications — only values the org allows tutors to see
 * (same rules as Students table for org tutors).
 */
export function pickStudentContactsForTutorEmail(
  student: {
    email?: string | null;
    phone?: string | null;
    payer_email?: string | null;
    payer_phone?: string | null;
  },
  features: Record<string, unknown> | null | undefined,
): { studentEmail?: string; studentPhone?: string } {
  const cv = parseOrgContactVisibility(features);
  const emailLine = formatContactForTutorView(student.email, student.payer_email, cv.tutorSeesStudentEmail);
  const phoneLine = formatContactForTutorView(student.phone, student.payer_phone, cv.tutorSeesStudentPhone);
  const out: { studentEmail?: string; studentPhone?: string } = {};
  if (emailLine !== '—') out.studentEmail = emailLine;
  if (phoneLine !== '—') out.studentPhone = phoneLine;
  return out;
}

export function shouldShowPayerContactSection(student: {
  payment_payer?: string | null;
  email?: string | null;
  payer_email?: string | null;
  phone?: string | null;
  payer_phone?: string | null;
}): boolean {
  if (student.payment_payer !== 'parent') return false;
  const eSt = normEmailLocal(student.email);
  const ePay = normEmailLocal(student.payer_email);
  const pSt = (student.phone || '').trim();
  const pPay = (student.payer_phone || '').trim();
  const sameEmail = Boolean(eSt && ePay && eSt === ePay);
  const samePhone = !pPay || pSt === pPay;
  if (sameEmail && samePhone) return false;
  return true;
}
