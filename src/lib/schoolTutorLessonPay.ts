import { pickSchoolMeetingOutcome, schoolMeetingOccurrences, type SchoolMeetingRow, type SchoolOutcomeOptions } from './schoolSessionMonitoring.js';
import { isUnconfirmedAutomaticNoShow } from './schoolJoinNoShow.js';
import { effectiveSessionOutcome } from './sessionStatusConfirmation.js';

export type SchoolTutorPayRow = SchoolMeetingRow & {
  tutor_pay_eur_snapshot?: number | null;
  /** Attendance IDs are evidence, never normal session or child billing IDs. */
  source_kind?: 'session' | 'attendance';
  /** A replaced attendance outcome still carries its frozen financial history. */
  pay_evidence_only?: boolean;
};
export type SchoolTutorPayOccurrence<T extends SchoolTutorPayRow = SchoolTutorPayRow> = {
  key: string;
  row: T;
  sessionIds: string[];
  attendanceIds: string[];
  payEur: number | null;
  payIssue: 'missing_rate' | 'conflicting_snapshot' | null;
};

/** School teachers are paid once per conducted meeting, while child rows retain attendance history. */
export function schoolTutorPayOccurrences<T extends SchoolTutorPayRow>(
  rows: T[], defaultRate: number | null | undefined, now: Date = new Date(), options: SchoolOutcomeOptions = {},
): SchoolTutorPayOccurrence<T>[] {
  const configuredRate = Number(defaultRate);
  return schoolMeetingOccurrences(rows, options).flatMap(({ key, rows: children }) => {
    const sessions = children.filter(child => child.source_kind !== 'attendance');
    const authoritativeRealStudentIds = new Set(sessions.filter(child =>
      ['cancelled', 'canceled'].includes(child.status || '')
      || (['completed', 'no_show'].includes(child.status || '') && Boolean(child.status_confirmed_at)),
    ).map(child => child.student_id).filter(Boolean));
    // A confirmed real outcome or explicit cancellation supersedes the fact.
    // Later pending materialization must preserve the earlier attendance.
    // Standalone absence alone does not prove that this meeting was conducted.
    const financialAttendance = children.filter(child => child.source_kind === 'attendance'
      && child.class_group_id && child.tutor_id && child.student_id
      && ['completed', 'no_show'].includes(child.status || '') && Boolean(child.status_confirmed_at));
    const completedAttendance = financialAttendance.filter(child => child.status === 'completed'
      && !child.pay_evidence_only && !authoritativeRealStudentIds.has(child.student_id));
    const sources = [...sessions, ...financialAttendance];
    const attendedStudentIds = new Set(completedAttendance.map(child => child.student_id));
    const row = pickSchoolMeetingOutcome([...sessions, ...completedAttendance], options);
    if (!row) return [];
    const end = Date.parse(row.end_time || '');
    if (!['completed', 'no_show'].includes(row.status || '') || !Number.isFinite(end) || end > now.getTime()) return [];
    const snapshots = [...new Set(sources.flatMap(child => {
      if (child.source_kind !== 'attendance' && attendedStudentIds.has(child.student_id)
        && !child.status_confirmed_at) return [];
      if (!['completed', 'no_show'].includes(effectiveSessionOutcome(child, options.requireConfirmation === true) || '') || isUnconfirmedAutomaticNoShow(child)) return [];
      const value = child.tutor_pay_eur_snapshot;
      const amount = Number(value);
      return value != null && Number.isFinite(amount) && amount >= 0 ? [Math.round(amount * 100) / 100] : [];
    }))];
    const payIssue = snapshots.length > 1 ? 'conflicting_snapshot'
      : !snapshots.length && !(Number.isFinite(configuredRate) && configuredRate > 0) ? 'missing_rate' : null;
    return [{ key, row,
      sessionIds: [...new Set(sessions.map(child => child.id).filter((id): id is string => Boolean(id)))],
      attendanceIds: [...new Set(financialAttendance.map(child => child.id).filter((id): id is string => Boolean(id)))],
      payEur: payIssue ? null : snapshots[0] ?? Math.round(configuredRate * 100) / 100, payIssue }];
  });
}
