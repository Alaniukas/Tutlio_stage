import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types.js';
import {
  activeSchoolGroupStudentIds,
  isEligibleAcceptedSchoolGroupContract as isEligibleSchoolGroupContract,
  isSchoolClassGroupSuspended,
  resumableSchoolGroupStudentIds,
  schoolGroupExitImpact,
  schoolGroupMinimumStudents,
  type SchoolGroupContractState,
} from '../../src/lib/schoolGroupMinimumPolicy.js';
import { isSchoolContractSuspended } from '../../src/lib/schoolContractLifecycle.js';
import { internalApiOrigin } from './extraLessonsContractShared.js';
import { materializeClassGroupNow } from './schoolClassGroupMaterialize.js';
import { syncSchoolContractGroupMembership } from './schoolGroupMembership.js';
import { isArchivedEnrollmentStatus } from '../../src/lib/schoolStudentEnrollment.js';

type GroupContractRow = SchoolGroupContractState & {
  class_group_id?: string | null;
  contract_number?: string | null;
  student?: {
    organization_id?: string | null;
    detached_at?: string | null;
    enrollment_status?: string | null;
    full_name?: string | null;
    email?: string | null;
    payer_name?: string | null;
    payer_email?: string | null;
    parent_secondary_name?: string | null;
    parent_secondary_email?: string | null;
  } | null;
};

type GroupRow = {
  id: string;
  organization_id: string;
  name: string;
  suspension_started_at?: string | null;
  suspension_until?: string | null;
  suspension_resumed_at?: string | null;
  minimum_active_students?: number | null;
  members?: Array<{ student_id: string }>;
};

export type SchoolGroupMinimumContext = {
  group: GroupRow;
  contracts: GroupContractRow[];
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function rosterContracts(context: SchoolGroupMinimumContext, resumeContractId?: string | null): GroupContractRow[] {
  const memberIds = new Set((context.group.members || []).map((member) => member.student_id));
  const resume = context.contracts.find((contract) => contract.id === resumeContractId);
  if (resume?.student_id && isEligibleSchoolGroupContract(resume) && context.contracts.some(contract => (
    contract.student_id === resume.student_id && isEligibleSchoolGroupContract(contract)
    && contract.suspended_group_membership?.group_id === context.group.id
    && contract.suspended_group_membership.student_id === resume.student_id
  ))) {
    memberIds.add(resume.student_id);
  }
  return context.contracts.filter((contract) => contract.student_id && memberIds.has(contract.student_id)
    && isEligibleSchoolGroupContract(contract)
    && contract.student?.organization_id === context.group.organization_id
    && !contract.student.detached_at && !isArchivedEnrollmentStatus(contract.student.enrollment_status));
}

export async function loadSchoolGroupMinimumContext(
  supabase: SupabaseClient,
  organizationId: string,
  groupId: string,
): Promise<SchoolGroupMinimumContext | null> {
  const [{ data: group, error: groupError }, { data: contracts, error: contractsError }] = await Promise.all([
    supabase.from('school_class_groups')
      .select('id, organization_id, name, minimum_active_students, suspension_started_at, suspension_until, suspension_resumed_at, members:school_class_group_members(student_id)')
      .eq('id', groupId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.from('school_contracts')
      .select('id, student_id, class_group_id, contract_number, signing_status, accepted_at, order_snapshot, archived_at, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_until, suspension_resumed_at, suspension_scope, suspended_group_membership, student:students(organization_id, detached_at, enrollment_status, full_name, email, payer_name, payer_email, parent_secondary_name, parent_secondary_email)')
      .eq('organization_id', organizationId)
      .eq('class_group_id', groupId)
      .eq('kind', 'extra_lessons'),
  ]);
  if (groupError) throw new Error(groupError.message);
  if (contractsError) throw new Error(contractsError.message);
  if (!group) return null;
  return {
    group: group as GroupRow,
    contracts: (contracts || []).map((row: any) => ({
      ...row,
      student: relatedOne(row.student),
    })) as GroupContractRow[],
  };
}

export async function previewSchoolGroupContractExit(
  supabase: SupabaseClient,
  organizationId: string,
  groupId: string,
  contractId: string,
  now = new Date(),
) {
  const context = await loadSchoolGroupMinimumContext(supabase, organizationId, groupId);
  if (!context) return null;
  const minimumStudentCount = schoolGroupMinimumStudents(context.group);
  const impact = schoolGroupExitImpact(rosterContracts(context), contractId, now, minimumStudentCount);
  return {
    ...impact,
    groupId: context.group.id,
    groupName: context.group.name,
    minimumStudentCount,
    groupAlreadySuspended: isSchoolClassGroupSuspended(context.group, now),
    willSuspendGroup: impact.willFallBelowMinimum && !isSchoolClassGroupSuspended(context.group, now),
  };
}

async function sendGroupSuspensionEmails(
  req: VercelRequest,
  supabase: SupabaseClient,
  context: SchoolGroupMinimumContext,
  reason: string,
  activeStudentCount: number,
): Promise<{ sent: number; attempted: number }> {
  const { data: organization } = await supabase.from('organizations')
    .select('name, email')
    .eq('id', context.group.organization_id)
    .maybeSingle();
  const deliveries: Array<{ to: string; parentName: string; studentName: string }> = [];
  const seen = new Set<string>();
  for (const contract of rosterContracts(context)) {
    if (!isEligibleSchoolGroupContract(contract) || !contract.student_id) continue;
    const student = contract.student;
    const recipients = [
      { email: student?.payer_email, name: student?.payer_name },
      { email: student?.parent_secondary_email, name: student?.parent_secondary_name },
      ...(!student?.payer_email && !student?.parent_secondary_email
        ? [{ email: student?.email, name: student?.full_name }]
        : []),
    ];
    for (const recipient of recipients) {
      const email = String(recipient.email || '').trim().toLowerCase();
      const key = `${contract.student_id}:${email}`;
      if (!email || seen.has(key)) continue;
      seen.add(key);
      deliveries.push({
        to: email,
        parentName: String(recipient.name || student?.full_name || '').trim(),
        studentName: String(student?.full_name || '').trim(),
      });
    }
  }
  const results = await Promise.allSettled(deliveries.map(async (delivery) => {
    const response = await fetch(`${internalApiOrigin(req)}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: 'school_group_suspended',
        to: delivery.to,
        data: {
          organizationId: context.group.organization_id,
          schoolName: organization?.name || 'Mokykla',
          contactEmail: organization?.email || null,
          parentName: delivery.parentName,
          studentName: delivery.studentName,
          groupName: context.group.name,
          activeStudentCount,
          minimumStudentCount: schoolGroupMinimumStudents(context.group),
          reason,
        },
      }),
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 300));
  }));
  return {
    sent: results.filter((result) => result.status === 'fulfilled').length,
    attempted: deliveries.length,
  };
}

async function pauseActiveGroupContracts(
  supabase: SupabaseClient,
  context: SchoolGroupMinimumContext,
  now: Date,
  reason: string,
  startedBy: string | null,
): Promise<number> {
  const activeContractIds = rosterContracts(context)
    .filter((contract) => isEligibleSchoolGroupContract(contract) && !isSchoolContractSuspended(contract, now))
    .map((contract) => contract.id);
  if (!activeContractIds.length) return 0;

  const { error } = await supabase.from('school_contracts').update({
    suspension_started_at: now.toISOString(),
    // The group pause has no date of its own: it is lifted only after the
    // minimum is met again. An individual pause is excluded above.
    suspension_until: null,
    suspension_reason: reason,
    suspension_started_by: startedBy,
    suspension_resumed_at: null,
    suspension_resumed_by: null,
    suspension_scope: 'group_under_minimum',
    suspension_group_id: context.group.id,
  }).in('id', activeContractIds);
  if (error) throw new Error(error.message);
  return activeContractIds.length;
}

/** Run after the trigger contract has already been suspended or terminated. */
export async function suspendSchoolGroupIfBelowMinimum(
  req: VercelRequest,
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    groupId: string;
    triggerContractId: string | null;
    adminUserId: string | null;
  },
): Promise<{
  groupSuspended: boolean;
  groupJustSuspended: boolean;
  groupName?: string;
  activeStudentCount: number;
  suspendedContractCount: number;
  notificationsSent: number;
  notificationsAttempted: number;
  minimumStudentCount?: number;
}> {
  if (params.triggerContractId) {
    await syncSchoolContractGroupMembership(supabase, params.triggerContractId, params.organizationId);
  }
  const context = await loadSchoolGroupMinimumContext(supabase, params.organizationId, params.groupId);
  if (!context) return { groupSuspended: false, groupJustSuspended: false, activeStudentCount: 0, suspendedContractCount: 0, notificationsSent: 0, notificationsAttempted: 0 };
  const now = new Date();
  const minimumStudentCount = schoolGroupMinimumStudents(context.group);
  const activeStudentCount = activeSchoolGroupStudentIds(rosterContracts(context), now).size;
  if (activeStudentCount >= minimumStudentCount) {
    await materializeClassGroupNow(supabase, params.groupId, params.organizationId);
    return { groupSuspended: false, groupJustSuspended: false, groupName: context.group.name, activeStudentCount, suspendedContractCount: 0, notificationsSent: 0, notificationsAttempted: 0, minimumStudentCount };
  }
  if (isSchoolClassGroupSuspended(context.group, now)) {
    // An agreement may be accepted after the group was paused. Keep its
    // contract state in step with the group without restarting the pause or
    // notifying families again.
    const reason = `Grupė sustabdyta, kol joje bus bent ${minimumStudentCount} aktyvūs mokiniai.`;
    const suspendedContractCount = await pauseActiveGroupContracts(supabase, context, now, reason, null);
    await materializeClassGroupNow(supabase, params.groupId, params.organizationId);
    return { groupSuspended: true, groupJustSuspended: false, groupName: context.group.name, activeStudentCount, suspendedContractCount, notificationsSent: 0, notificationsAttempted: 0, minimumStudentCount };
  }

  const nowIso = now.toISOString();
  const reason = `Aktyvių mokinių skaičius grupėje sumažėjo iki ${activeStudentCount}. Grupinis užsiėmimas vyksta tik nuo ${minimumStudentCount} mokinių.`;
  const suspendedContractCount = await pauseActiveGroupContracts(supabase, context, now, reason, params.adminUserId);
  const { error: groupError } = await supabase.from('school_class_groups').update({
    suspension_started_at: nowIso,
    suspension_until: null,
    suspension_reason: reason,
    suspension_trigger_contract_id: params.triggerContractId,
    suspension_started_by: params.adminUserId,
    suspension_resumed_at: null,
    suspension_resumed_by: null,
    updated_at: nowIso,
  }).eq('id', params.groupId).eq('organization_id', params.organizationId);
  if (groupError) throw new Error(groupError.message);

  await materializeClassGroupNow(supabase, params.groupId, params.organizationId);
  const refreshed = await loadSchoolGroupMinimumContext(supabase, params.organizationId, params.groupId) || context;
  const notificationDelivery = await sendGroupSuspensionEmails(req, supabase, refreshed, reason, activeStudentCount);
  return {
    groupSuspended: true,
    groupJustSuspended: true,
    groupName: context.group.name,
    activeStudentCount,
    suspendedContractCount,
    notificationsSent: notificationDelivery.sent,
    notificationsAttempted: notificationDelivery.attempted,
    minimumStudentCount,
  };
}

export async function resumeSchoolGroupIfMinimumMet(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    groupId: string;
    resumeContractId: string | null;
    adminUserId: string | null;
    materialize?: boolean;
  },
): Promise<{ groupWasSuspended: boolean; resumed: boolean; resumableStudentCount: number; groupName?: string; minimumStudentCount?: number }> {
  const context = await loadSchoolGroupMinimumContext(supabase, params.organizationId, params.groupId);
  if (!context || !isSchoolClassGroupSuspended(context.group)) {
    return { groupWasSuspended: false, resumed: false, resumableStudentCount: 0, groupName: context?.group.name };
  }
  const resumableStudentCount = resumableSchoolGroupStudentIds(
    rosterContracts(context, params.resumeContractId),
    params.resumeContractId,
  ).size;
  const minimumStudentCount = schoolGroupMinimumStudents(context.group);
  if (resumableStudentCount < minimumStudentCount) {
    return { groupWasSuspended: true, resumed: false, resumableStudentCount, groupName: context.group.name, minimumStudentCount };
  }
  const nowIso = new Date().toISOString();
  const groupContractIds = rosterContracts(context, params.resumeContractId)
    .filter((contract) => isEligibleSchoolGroupContract(contract)
      && (contract.suspension_scope === 'group_under_minimum' || contract.id === params.resumeContractId))
    .map((contract) => contract.id);
  if (groupContractIds.length > 0) {
    const { error } = await supabase.from('school_contracts').update({
      suspension_resumed_at: nowIso,
      suspension_resumed_by: params.adminUserId,
    }).in('id', groupContractIds);
    if (error) throw new Error(error.message);
  }
  if (params.resumeContractId) {
    await syncSchoolContractGroupMembership(supabase, params.resumeContractId, params.organizationId);
  }
  const { error: groupError } = await supabase.from('school_class_groups').update({
    suspension_resumed_at: nowIso,
    suspension_resumed_by: params.adminUserId,
    updated_at: nowIso,
  }).eq('id', params.groupId).eq('organization_id', params.organizationId);
  if (groupError) throw new Error(groupError.message);
  if (params.materialize !== false) await materializeClassGroupNow(supabase, params.groupId, params.organizationId);
  return { groupWasSuspended: true, resumed: true, resumableStudentCount, groupName: context.group.name, minimumStudentCount };
}

/** Member edits, threshold changes and new acceptances can restore an existing group. */
export async function reconcileSchoolGroupMinimum(
  req: VercelRequest,
  supabase: SupabaseClient,
  params: { organizationId: string; groupId: string; actorUserId: string | null },
): Promise<void> {
  const context = await loadSchoolGroupMinimumContext(supabase, params.organizationId, params.groupId);
  // A newly drafted group can be prepared before its extra contracts exist.
  if (!context || !context.contracts.length) return;
  const resumed = await resumeSchoolGroupIfMinimumMet(supabase, {
    ...params, resumeContractId: null, adminUserId: params.actorUserId,
  });
  if (resumed.groupWasSuspended) {
    if (!resumed.resumed) {
      await suspendSchoolGroupIfBelowMinimum(req, supabase, {
        ...params, triggerContractId: null, adminUserId: params.actorUserId,
      });
    }
    return;
  }
  await suspendSchoolGroupIfBelowMinimum(req, supabase, {
    ...params, triggerContractId: null, adminUserId: params.actorUserId,
  });
}
