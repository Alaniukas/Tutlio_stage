import { isSchoolContractSuspended, isSchoolContractTerminated } from './schoolContractLifecycle.js';
import {
  schoolGroupMinimumStudents,
  type SchoolGroupContractState,
} from './schoolGroupMinimumPolicy.js';

export type SchoolGroupMemberActivationKind =
  | 'active'
  | 'offer_sent'
  | 'unsigned'
  | 'suspended'
  | 'terminated';

/** Staff need member status, without agreement IDs or payer/order details. */
export type SchoolGroupMemberContractState = Pick<SchoolGroupContractState,
  'student_id' | 'signing_status' | 'archived_at' | 'terminated_at' | 'withdrawal_requested_at'
  | 'suspension_started_at' | 'suspension_until' | 'suspension_resumed_at'>;

export type SchoolGroupMemberActivation = {
  studentId: string;
  fullName: string;
  kind: SchoolGroupMemberActivationKind;
};

export type SchoolGroupActivationSummary = {
  minimum: number;
  activeCount: number;
  members: SchoolGroupMemberActivation[];
  waitingForContract: SchoolGroupMemberActivation[];
  offerPending: SchoolGroupMemberActivation[];
};

type GroupMemberInput = {
  student_id: string;
  student?: { full_name?: string | null } | null;
};

function memberName(member: GroupMemberInput): string {
  return String(member.student?.full_name || '').trim() || member.student_id;
}

function contractPriority(contract: SchoolGroupMemberContractState, now: Date): number {
  if (isSchoolContractTerminated(contract)) return 0;
  if (contract.signing_status === 'signed' && !isSchoolContractSuspended(contract, now)) return 50;
  if (contract.signing_status === 'signed') return 40;
  if (contract.signing_status === 'sent') return 30;
  return 10;
}

/** Pick the most relevant extra-lessons contract row for one group member. */
export function pickSchoolGroupMemberContract(
  contracts: SchoolGroupMemberContractState[],
  studentId: string,
  now: Date = new Date(),
): SchoolGroupMemberContractState | null {
  const matches = contracts
    .filter((contract) => contract.student_id === studentId && !contract.archived_at)
    .sort((left, right) => contractPriority(right, now) - contractPriority(left, now));
  return matches[0] ?? null;
}

export function classifySchoolGroupMemberActivation(
  contract: SchoolGroupMemberContractState | null,
  now: Date = new Date(),
): SchoolGroupMemberActivationKind {
  if (!contract) return 'unsigned';
  if (isSchoolContractTerminated(contract)) return 'terminated';
  if (contract.signing_status === 'signed') {
    return isSchoolContractSuspended(contract, now) ? 'suspended' : 'active';
  }
  if (contract.signing_status === 'sent') return 'offer_sent';
  return 'unsigned';
}

export function buildSchoolGroupActivationSummary(
  group: { minimum_active_students?: number | null; members?: GroupMemberInput[] | null },
  contracts: SchoolGroupMemberContractState[],
  now: Date = new Date(),
): SchoolGroupActivationSummary {
  const minimum = schoolGroupMinimumStudents(group);
  const members = (group.members || []).map((member) => {
    const contract = pickSchoolGroupMemberContract(contracts, member.student_id, now);
    return {
      studentId: member.student_id,
      fullName: memberName(member),
      kind: classifySchoolGroupMemberActivation(contract, now),
    };
  });
  const waitingForContract = members.filter((member) => member.kind === 'unsigned');
  const offerPending = members.filter((member) => member.kind === 'offer_sent');
  const activeCount = members.filter((member) => member.kind === 'active').length;
  return {
    minimum,
    activeCount,
    members,
    waitingForContract,
    offerPending,
  };
}

export function schoolGroupMemberActivationLabelKey(kind: SchoolGroupMemberActivationKind): string {
  switch (kind) {
    case 'active':
      return 'school.groups.memberActive';
    case 'offer_sent':
      return 'school.groups.memberOfferPending';
    case 'unsigned':
      return 'school.groups.memberNoContract';
    case 'suspended':
      return 'school.groups.memberSuspended';
    case 'terminated':
      return 'school.groups.memberTerminated';
    default:
      return 'school.groups.memberNoContract';
  }
}
