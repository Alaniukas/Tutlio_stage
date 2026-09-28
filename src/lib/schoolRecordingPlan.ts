import { isEligibleAcceptedSchoolGroupContract, type SchoolGroupContractState } from './schoolGroupMinimumPolicy.js';
import { isSchoolContractSuspended } from './schoolContractLifecycle.js';
import type { SchoolMemberSlot } from './schoolClassGroups.js';

/** Attendance and the purchased recording entitlement are separate choices. */
export type SchoolRecordingAccessMode = 'schedule' | 'group' | 'none';
export type LegacySchoolRecordingScope = { schedule_slots: SchoolMemberSlot[] | null };

export function isSchoolRecordingAccessMode(value: unknown): value is SchoolRecordingAccessMode {
  return value === 'schedule' || value === 'group' || value === 'none';
}

export function schoolRecordingAccessMode(value: unknown): SchoolRecordingAccessMode {
  return isSchoolRecordingAccessMode(value) ? value : 'schedule';
}

export type RecordingPlanContract = Omit<SchoolGroupContractState, 'order_snapshot'> & {
  order_snapshot?: {
    start_date?: string | null;
    end_date?: string | null;
    recording_access?: SchoolRecordingAccessMode;
    schedule_slots?: SchoolMemberSlot[] | null;
  } | null;
  start_within_14_status?: string | null;
};

/** Active agreements are authoritative; a competing valid agreement retains its grant. */
export function recordingModesForMember(
  memberMode: unknown,
  contracts: RecordingPlanContract[],
  now = new Date(),
): SchoolRecordingAccessMode[] {
  return [...new Set(recordingGrantsForMember(memberMode, null, contracts, now).map((grant) => grant.mode))];
}

export function recordingGrantsForMember(
  memberMode: unknown,
  memberSchedule: SchoolMemberSlot[] | null,
  contracts: RecordingPlanContract[],
  now = new Date(),
  legacyScope?: LegacySchoolRecordingScope | null,
): Array<{ mode: SchoolRecordingAccessMode; scheduleSlots: SchoolMemberSlot[] | null }> {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) => dateParts.find((item) => item.type === name)?.value || '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const active = contracts.filter((contract) => {
    if (!isEligibleAcceptedSchoolGroupContract(contract, now)) return false;
    if (isSchoolContractSuspended(contract, now) && contract.suspension_scope !== 'group_under_minimum') return false;
    if (contract.order_snapshot?.start_date && contract.order_snapshot.start_date > today) return false;
    if (contract.start_within_14_status === 'no'
      && Date.parse(contract.accepted_at || '') + 14 * 86_400_000 > now.getTime()) return false;
    return true;
  });
  if (!active.length && contracts.some((contract) => contract.order_snapshot?.recording_access !== undefined)) {
    return [{ mode: 'none', scheduleSlots: memberSchedule }];
  }
  return active.length ? active.map((contract) => ({
    mode: schoolRecordingAccessMode(contract.order_snapshot?.recording_access),
    // Legacy agreements retain the roster's selected-slot rule. Explicit plans
    // retain their own purchased slots even if another agreement changes attendance.
    scheduleSlots: contract.order_snapshot?.recording_access === 'schedule'
      ? contract.order_snapshot.schedule_slots ?? memberSchedule
      : contract.order_snapshot?.recording_access === undefined && legacyScope
        ? legacyScope.schedule_slots : memberSchedule,
  })) : [{ mode: schoolRecordingAccessMode(memberMode), scheduleSlots: memberSchedule }];
}

export function schoolRecordingPlanLabel(mode: unknown): string {
  switch (schoolRecordingAccessMode(mode)) {
    case 'group': return 'Su visos grupės įrašais';
    case 'none': return 'Be įrašų';
    default: return 'Pagal lankomus grupės laikus';
  }
}
