import { isProKlaseOrg } from './marketMoney.js';

export const STUDENT_REGISTRATION_FEATURE = 'pending_registration_lessons';
export const REGISTRATION_WARNING_AFTER_MS = 24 * 60 * 60 * 1000;

export type StudentRegistrationState = {
  student_id: string;
  full_name: string | null;
  registration_pending: boolean;
  pending_since: string | null;
  next_session_at: string | null;
};

export function studentRegistrationEnabled(
  organizationId: string | null | undefined,
  features?: Record<string, unknown> | null,
): boolean {
  const flag = features?.[STUDENT_REGISTRATION_FEATURE];
  return flag === true || (flag !== false && isProKlaseOrg(organizationId));
}

export function isRegistrationOverdue(state: StudentRegistrationState | null | undefined, now = Date.now()): boolean {
  if (!state?.registration_pending || !state.pending_since) return false;
  const since = Date.parse(state.pending_since);
  return Number.isFinite(since) && now - since >= REGISTRATION_WARNING_AFTER_MS;
}

/** Mixed groups still take place; only an occurrence with every client pending is tentative. */
export function lessonAwaitingRegistration(
  session: { student_id?: string; status?: string; end_time?: Date | string; _groupSessions?: Array<{ student_id?: string; status?: string }>; _classGroupSessions?: Array<{ student_id?: string; status?: string }> },
  states: ReadonlyMap<string, StudentRegistrationState>,
  now = Date.now(),
): boolean {
  if (session.status !== 'active') return false;
  const end = session.end_time instanceof Date ? session.end_time.getTime() : Date.parse(session.end_time || '');
  if (!Number.isFinite(end) || end <= now) return false;
  const participants = (session._classGroupSessions || session._groupSessions || [session])
    .filter((row) => !row.status || row.status === 'active');
  return participants.length > 0 && participants.every((row) =>
    Boolean(row.student_id && states.get(row.student_id)?.registration_pending),
  );
}
