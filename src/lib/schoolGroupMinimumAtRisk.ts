import { nextClassGroupOccurrence, type SchoolClassGroupSlot } from './schoolClassGroups.js';
import {
  isSchoolClassGroupSuspended,
  schoolGroupMinimumStudents,
  type SchoolGroupMinimumStatus,
} from './schoolGroupMinimumPolicy.js';

export const SCHOOL_GROUP_MINIMUM_RISK_WINDOW_MS = 7 * 86_400_000;

export type SchoolGroupAtRiskInput = {
  id: string;
  name: string;
  tutor_id?: string | null;
  tutor_name?: string | null;
  minimum_active_students?: number | null;
  duration_minutes?: number | null;
  slots?: SchoolClassGroupSlot[];
  minimum_status?: SchoolGroupMinimumStatus;
  suspension_started_at?: string | null;
  suspension_until?: string | null;
  suspension_resumed_at?: string | null;
};

export type SchoolGroupMinimumRiskEvaluation = {
  atRisk: boolean;
  eligibleCount: number;
  minimum: number;
  occurrenceStart: Date | null;
};

export function evaluateSchoolGroupMinimumRisk(
  group: SchoolGroupAtRiskInput,
  now = new Date(),
  windowMs = SCHOOL_GROUP_MINIMUM_RISK_WINDOW_MS,
): SchoolGroupMinimumRiskEvaluation {
  const minimum = schoolGroupMinimumStudents(group);
  const eligibleCount = group.minimum_status?.eligible_student_count ?? minimum;
  if (isSchoolClassGroupSuspended(group, now)) {
    return { atRisk: false, eligibleCount, minimum, occurrenceStart: null };
  }
  if (!group.minimum_status) {
    return { atRisk: false, eligibleCount, minimum, occurrenceStart: null };
  }
  if (eligibleCount >= minimum) {
    return { atRisk: false, eligibleCount, minimum, occurrenceStart: null };
  }
  const occurrence = nextClassGroupOccurrence(
    group.slots || [],
    group.duration_minutes || 45,
    now,
  );
  if (!occurrence) {
    return { atRisk: false, eligibleCount, minimum, occurrenceStart: null };
  }
  const occurrenceStart = occurrence.start;
  const nowMs = now.getTime();
  const startMs = occurrenceStart.getTime();
  const atRisk = startMs > nowMs && startMs <= nowMs + windowMs;
  return { atRisk, eligibleCount, minimum, occurrenceStart };
}

export function listSchoolGroupsAtRisk(
  groups: SchoolGroupAtRiskInput[],
  now = new Date(),
  windowMs = SCHOOL_GROUP_MINIMUM_RISK_WINDOW_MS,
): Array<SchoolGroupAtRiskInput & SchoolGroupMinimumRiskEvaluation> {
  return groups
    .map((group) => ({ ...group, ...evaluateSchoolGroupMinimumRisk(group, now, windowMs) }))
    .filter((row) => row.atRisk && row.occurrenceStart);
}

export function schoolGroupMinimumRiskOccurrenceKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}
