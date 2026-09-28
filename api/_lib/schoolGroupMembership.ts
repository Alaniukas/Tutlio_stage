import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isEligibleAcceptedSchoolGroupContract as isEligibleSchoolGroupContract,
  type SchoolGroupContractState,
  type SuspendedGroupMembership,
} from '../../src/lib/schoolGroupMinimumPolicy.js';
import { isSchoolContractSuspended, isSchoolContractTerminated } from '../../src/lib/schoolContractLifecycle.js';
import { isArchivedEnrollmentStatus } from '../../src/lib/schoolStudentEnrollment.js';
import { isSchoolRecordingAccessMode, type RecordingPlanContract } from '../../src/lib/schoolRecordingPlan.js';

/** Apply only a newly accepted explicit plan, never retrofit legacy agreements. */
export async function applyAcceptedSchoolGroupRecordingPlan(
  supabase: SupabaseClient, contractId: string, organizationId: string,
): Promise<void> {
  const organization = await supabase.from('organizations').select('entity_type, features')
    .eq('id', organizationId).maybeSingle();
  if (organization.error) throw organization.error;
  if (organization.data?.entity_type !== 'school' || organization.data.features?.school_family_portal !== true) return;
  const current = await supabase.from('school_contracts')
    .select('id, student_id, class_group_id, kind, signing_status, accepted_at, order_snapshot, archived_at, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at, suspension_scope')
    .eq('id', contractId).eq('organization_id', organizationId).maybeSingle();
  if (current.error) throw current.error;
  const contract = current.data;
  if (contract?.kind !== 'extra_lessons' || !contract.class_group_id || !contract.student_id
    || !isSchoolRecordingAccessMode(contract.order_snapshot?.recording_access)
    || !isEligibleSchoolGroupContract(contract)) return;
  const [group, student, member, revisions] = await Promise.all([
    supabase.from('school_class_groups').select('id, slots:school_class_group_slots(weekday, start_time)')
      .eq('id', contract.class_group_id).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('students').select('id, detached_at, enrollment_status')
      .eq('id', contract.student_id).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('school_class_group_members').select('enrolled_at, schedule_slots, recording_access, legacy_recording_scope')
      .eq('group_id', contract.class_group_id).eq('student_id', contract.student_id).maybeSingle(),
    supabase.from('school_contracts')
      .select('id, signing_status, accepted_at, order_snapshot, archived_at, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at, suspension_scope')
      .eq('organization_id', organizationId).eq('student_id', contract.student_id)
      .eq('class_group_id', contract.class_group_id).eq('kind', 'extra_lessons'),
  ]);
  const error = [group, student, member, revisions].find((result) => result.error)?.error;
  if (error) throw error;
  if (!group.data || !student.data || student.data.detached_at || isArchivedEnrollmentStatus(student.data.enrollment_status)) return;
  const agreements = ((revisions.data || []) as RecordingPlanContract[]).filter((revision) =>
    isEligibleSchoolGroupContract(revision) && (!isSchoolContractSuspended(revision) || revision.suspension_scope === 'group_under_minimum'));
  if (!agreements.length) return;
  const legacyAgreement = agreements.some((revision) => revision.order_snapshot?.recording_access === undefined);
  const selected = agreements.filter((revision) => revision.order_snapshot?.recording_access !== undefined)
    .flatMap((revision) => revision.order_snapshot?.schedule_slots || []);
  const allowed = new Set((group.data.slots || []).map((slot) => `${slot.weekday}:${String(slot.start_time).slice(0, 5)}`));
  if (selected.some((slot) => !allowed.has(`${slot.weekday}:${String(slot.start_time).slice(0, 5)}`))) {
    throw new Error('Accepted group plan does not match the current group schedule');
  }
  const slots = new Map(selected.map((slot) => [`${slot.weekday}:${String(slot.start_time).slice(0, 5)}`,
    { weekday: slot.weekday, start_time: String(slot.start_time).slice(0, 5) }]));
  if (legacyAgreement && member.data?.schedule_slots) {
    for (const slot of member.data.schedule_slots) slots.set(`${slot.weekday}:${String(slot.start_time).slice(0, 5)}`, slot);
  }
  const scheduleSlots = legacyAgreement && !member.data?.schedule_slots ? null : [...slots.values()];
  if (scheduleSlots && !scheduleSlots.length) throw new Error('Accepted group plan has no attendance slot');
  const latest = agreements.filter((revision) => isSchoolRecordingAccessMode(revision.order_snapshot?.recording_access))
    .sort((a, b) => String(b.accepted_at).localeCompare(String(a.accepted_at)) || b.id.localeCompare(a.id))[0];
  const saved = await supabase.from('school_class_group_members').upsert([{
    group_id: contract.class_group_id, student_id: contract.student_id,
    ...(member.data?.enrolled_at ? { enrolled_at: member.data.enrolled_at } : {}),
    legacy_recording_scope: member.data?.legacy_recording_scope || { schedule_slots: member.data ? member.data.schedule_slots ?? null : [] },
    schedule_slots: scheduleSlots, recording_access: latest?.order_snapshot?.recording_access || 'schedule',
  }], { onConflict: 'group_id,student_id', defaultToNull: false });
  if (saved.error) throw saved.error;
}

type GroupMembershipContract = SchoolGroupContractState & {
  organization_id: string;
  class_group_id?: string | null;
  kind?: string | null;
};

/** Reconcile only the contract's own child/group; history and other groups stay intact. */
export async function syncSchoolContractGroupMembership(
  supabase: SupabaseClient,
  contractId: string,
  organizationId: string,
): Promise<void> {
  const { data: raw, error: contractError } = await supabase.from('school_contracts')
    .select('id, organization_id, student_id, kind, class_group_id, signing_status, accepted_at, order_snapshot, archived_at, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at, suspension_scope, suspended_group_membership')
    .eq('id', contractId).eq('organization_id', organizationId).maybeSingle();
  if (contractError) throw new Error(contractError.message);
  const contract = raw as GroupMembershipContract | null;
  if (!contract?.class_group_id || !contract.student_id || contract.kind !== 'extra_lessons') return;
  const groupId = contract.class_group_id;
  const studentId = contract.student_id;
  const { data: group, error: groupError } = await supabase.from('school_class_groups')
    .select('id').eq('id', groupId).eq('organization_id', organizationId).maybeSingle();
  if (groupError) throw new Error(groupError.message);
  if (!group) return;

  const { data: member, error: memberError } = await supabase.from('school_class_group_members')
    .select('group_id, student_id, enrolled_at, schedule_slots, recording_access, legacy_recording_scope')
    .eq('group_id', groupId).eq('student_id', studentId).maybeSingle();
  if (memberError) throw new Error(memberError.message);

  const ended = isSchoolContractTerminated(contract);
  const individuallyPaused = isSchoolContractSuspended(contract) && contract.suspension_scope !== 'group_under_minimum';
  const { data: alternatives, error: alternativesError } = await supabase.from('school_contracts')
    .select('id, student_id, signing_status, accepted_at, order_snapshot, archived_at, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at, suspension_scope, suspended_group_membership')
    .eq('organization_id', organizationId).eq('class_group_id', groupId)
    .eq('student_id', studentId).eq('kind', 'extra_lessons').neq('id', contractId);
  if (alternativesError) throw new Error(alternativesError.message);
  const eligibleAlternatives = (alternatives || []).filter(row => isEligibleSchoolGroupContract(row));
  if (ended || individuallyPaused) {
    if (eligibleAlternatives.some(row => !isSchoolContractSuspended(row) || row.suspension_scope === 'group_under_minimum')) return;
    const savedMembership = contract.suspended_group_membership || member;
    // A last active revision can end while a different valid revision is
    // individually paused. Give that revision the original roster to restore.
    const snapshotTargets = individuallyPaused ? [contract] : eligibleAlternatives;
    if (savedMembership) {
      for (const target of snapshotTargets) {
        if (target.suspended_group_membership) continue;
        const { error } = await supabase.from('school_contracts').update({ suspended_group_membership: savedMembership })
          .eq('id', target.id).eq('organization_id', organizationId).is('suspended_group_membership', null);
        if (error) throw new Error(error.message);
      }
    }
    if (member) {
      const { error } = await supabase.from('school_class_group_members').delete()
        .eq('group_id', groupId).eq('student_id', studentId);
      if (error) throw new Error(error.message);
    }
    return;
  }

  if (!isEligibleSchoolGroupContract(contract) || isSchoolContractSuspended(contract)) return;
  const snapshotOwner = [contract, ...eligibleAlternatives].find(row => (
    row.suspended_group_membership?.group_id === groupId && row.suspended_group_membership.student_id === studentId
  ));
  const snapshot = snapshotOwner?.suspended_group_membership as SuspendedGroupMembership | null;
  if (!snapshot || !snapshotOwner) return;
  const { data: student, error: studentError } = await supabase.from('students')
    .select('id, detached_at, enrollment_status').eq('id', studentId).eq('organization_id', organizationId).maybeSingle();
  if (studentError) throw new Error(studentError.message);
  if (!student || student.detached_at || isArchivedEnrollmentStatus(student.enrollment_status)) return;
  if (!member) {
    const { error } = await supabase.from('school_class_group_members').upsert([{
      group_id: groupId,
      student_id: studentId,
      enrolled_at: snapshot.enrolled_at,
      schedule_slots: snapshot.schedule_slots,
      ...(snapshot.recording_access ? { recording_access: snapshot.recording_access } : {}),
      ...(snapshot.legacy_recording_scope !== undefined ? { legacy_recording_scope: snapshot.legacy_recording_scope } : {}),
    }], { onConflict: 'group_id,student_id', defaultToNull: false });
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from('school_contracts').update({ suspended_group_membership: null })
    .eq('id', snapshotOwner.id).eq('organization_id', organizationId);
  if (error) throw new Error(error.message);
}

/** Dated individual pauses expire without requiring the family to re-enroll. */
export async function restoreExpiredSchoolGroupMemberships(
  supabase: SupabaseClient,
  organizationId?: string | null,
): Promise<void> {
  let query = supabase.from('school_contracts')
    .select('id, organization_id, signing_status, accepted_at, order_snapshot, archived_at, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at')
    .eq('kind', 'extra_lessons').not('suspended_group_membership', 'is', null);
  if (organizationId) query = query.eq('organization_id', organizationId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  for (const contract of data || []) {
    if (isEligibleSchoolGroupContract(contract) && !isSchoolContractSuspended(contract)) {
      await syncSchoolContractGroupMembership(supabase, contract.id, contract.organization_id);
    }
  }
}
