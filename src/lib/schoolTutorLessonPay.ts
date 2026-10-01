import { pickSchoolMeetingOutcome, schoolMeetingOccurrences, type SchoolMeetingRow, type SchoolOutcomeOptions } from './schoolSessionMonitoring.js';
import { isUnconfirmedAutomaticNoShow } from './schoolJoinNoShow.js';

export type SchoolTutorPayRow = SchoolMeetingRow & {
  tutor_pay_eur_snapshot?: number | null;
  /** Attendance IDs are evidence, never normal session or child billing IDs. */
  source_kind?: 'session' | 'attendance';
  /** A replaced attendance outcome still carries its frozen financial history. */
  pay_evidence_only?: boolean;
};
export type SchoolTutorPayOptions = SchoolOutcomeOptions & {
  /** Positive EUR / meeting for individual lessons. Empty uses the group rate. */
  individualRate?: number | null;
};
export type SchoolTutorPayOccurrence<T extends SchoolTutorPayRow = SchoolTutorPayRow> = {
  key: string;
  row: T;
  sessionIds: string[];
  attendanceIds: string[];
  payEur: number | null;
  payIssue: 'missing_rate' | 'conflicting_snapshot' | null;
};

export function isSchoolGroupMeeting(row: Pick<SchoolTutorPayRow, 'class_group_id' | 'subject_is_group' | 'subjects'>): boolean {
  return Boolean(row.class_group_id || row.subject_is_group || row.subjects?.is_group);
}

function positiveRate(value: number | null | undefined): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

/** Group meetings use the group rate; individual meetings use their own rate, or the group rate when unset. */
export function schoolTutorMeetingRate(
  row: Pick<SchoolTutorPayRow, 'class_group_id' | 'subject_is_group' | 'subjects'>,
  groupRate: number | null | undefined,
  individualRate?: number | null,
): number | null {
  const group = positiveRate(groupRate);
  if (isSchoolGroupMeeting(row)) return group;
  return positiveRate(individualRate) ?? group;
}

function snapshotAmount(child: SchoolTutorPayRow): number | null {
  const value = child.tutor_pay_eur_snapshot;
  const amount = Number(value);
  return value != null && Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

/** School teachers are paid once per conducted meeting, while child rows retain attendance history. */
export function schoolTutorPayOccurrences<T extends SchoolTutorPayRow>(
  rows: T[], defaultRate: number | null | undefined, now: Date = new Date(), options: SchoolTutorPayOptions = {},
): SchoolTutorPayOccurrence<T>[] {
  const payOptions: SchoolTutorPayOptions = { ...options, countStoredCompleted: true };
  return schoolMeetingOccurrences(rows, payOptions).flatMap(({ key, rows: children }) => {
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
    const row = pickSchoolMeetingOutcome([...sessions, ...completedAttendance], payOptions);
    if (!row) return [];
    const end = Date.parse(row.end_time || '');
    if (!['completed', 'no_show'].includes(row.status || '') || !Number.isFinite(end) || end > now.getTime()) return [];
    const stamped: number[] = [];
    const unstamped: number[] = [];
    for (const child of sources) {
      if (child.source_kind !== 'attendance' && attendedStudentIds.has(child.student_id)
        && !child.status_confirmed_at) continue;
      if (isUnconfirmedAutomaticNoShow(child)) continue;
      if (child.status === 'completed') {
        /* Stored completed is a conducted meeting even without a stamp. */
      } else if (child.status === 'no_show') {
        if (options.requireConfirmation && !child.status_confirmed_at) continue;
      } else continue;
      const amount = snapshotAmount(child);
      if (amount == null) continue;
      if (child.status_confirmed_at) stamped.push(amount);
      else unstamped.push(amount);
    }
    const snapshots = [...new Set(stamped.length ? stamped : unstamped)];
    const fallbackRate = schoolTutorMeetingRate(row, defaultRate, options.individualRate);
    const payIssue = snapshots.length > 1 ? 'conflicting_snapshot'
      : !snapshots.length && fallbackRate == null ? 'missing_rate' : null;
    return [{ key, row,
      sessionIds: [...new Set(sessions.map(child => child.id).filter((id): id is string => Boolean(id)))],
      attendanceIds: [...new Set(financialAttendance.map(child => child.id).filter((id): id is string => Boolean(id)))],
      payEur: payIssue ? null : snapshots[0] ?? fallbackRate, payIssue }];
  });
}
