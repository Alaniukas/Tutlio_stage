import { isSchoolContractSuspended, isSchoolContractTerminated } from './schoolContractLifecycle.js';

export const SCHOOL_GROUP_MINIMUM_STUDENTS = 3;

export type SchoolGroupContractState = {
  id: string;
  student_id?: string | null;
  signing_status?: string | null;
  archived_at?: string | null;
  terminated_at?: string | null;
  withdrawal_requested_at?: string | null;
  suspension_started_at?: string | null;
  suspension_until?: string | null;
  suspension_resumed_at?: string | null;
  suspension_scope?: string | null;
};

export type SchoolClassGroupSuspensionState = {
  suspension_started_at?: string | null;
  suspension_until?: string | null;
  suspension_resumed_at?: string | null;
};

const SCHOOL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vilnius',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function schoolYmd(value: Date): string {
  const parts = Object.fromEntries(
    SCHOOL_DATE_FORMATTER.formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isSchoolClassGroupSuspended(
  group: SchoolClassGroupSuspensionState,
  now: Date = new Date(),
): boolean {
  if (!group.suspension_started_at || group.suspension_resumed_at) return false;
  const until = String(group.suspension_until || '').slice(0, 10);
  return !until || until >= schoolYmd(now);
}

export function isEligibleSchoolGroupContract(contract: SchoolGroupContractState): boolean {
  return contract.signing_status === 'signed'
    && !contract.archived_at
    && !isSchoolContractTerminated(contract);
}

export function activeSchoolGroupStudentIds(
  contracts: SchoolGroupContractState[],
  now: Date = new Date(),
): Set<string> {
  const ids = new Set<string>();
  for (const contract of contracts) {
    if (!contract.student_id || !isEligibleSchoolGroupContract(contract)) continue;
    if (!isSchoolContractSuspended(contract, now)) ids.add(contract.student_id);
  }
  return ids;
}

/** Preview the effect of suspending/terminating one student's group contract. */
export function schoolGroupExitImpact(
  contracts: SchoolGroupContractState[],
  targetContractId: string,
  now: Date = new Date(),
): {
  targetStudentId: string | null;
  activeStudentCount: number;
  remainingActiveStudentCount: number;
  willFallBelowMinimum: boolean;
} {
  const target = contracts.find((contract) => contract.id === targetContractId);
  const active = activeSchoolGroupStudentIds(contracts, now);
  const targetStudentId = target?.student_id || null;
  const targetWasActive = Boolean(
    target
    && targetStudentId
    && isEligibleSchoolGroupContract(target)
    && !isSchoolContractSuspended(target, now),
  );
  const remaining = activeSchoolGroupStudentIds(
    contracts.filter((contract) => contract.id !== targetContractId),
    now,
  );
  return {
    targetStudentId,
    activeStudentCount: active.size,
    remainingActiveStudentCount: remaining.size,
    willFallBelowMinimum: targetWasActive && remaining.size < SCHOOL_GROUP_MINIMUM_STUDENTS,
  };
}

/**
 * Members paused only because the whole group fell below three count toward a
 * possible group restart. Individually paused members do not.
 */
export function resumableSchoolGroupStudentIds(
  contracts: SchoolGroupContractState[],
  resumeContractId?: string | null,
  now: Date = new Date(),
): Set<string> {
  const ids = new Set<string>();
  for (const contract of contracts) {
    if (!contract.student_id || !isEligibleSchoolGroupContract(contract)) continue;
    if (contract.id === resumeContractId
      || !isSchoolContractSuspended(contract, now)
      || contract.suspension_scope === 'group_under_minimum') {
      ids.add(contract.student_id);
    }
  }
  return ids;
}
