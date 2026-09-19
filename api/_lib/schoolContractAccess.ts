import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extraLessonsServiceStartYmd,
  type ExtraLessonsOrderSnapshot,
  type StartWithin14Status,
} from '../../src/lib/extraLessonsContract.js';
import { sessionYmdVilnius } from '../../src/lib/schoolExtraLessonsBilling.js';
import { schoolContractBlocksService } from '../../src/lib/schoolContractLifecycle.js';
import { isSchoolClassGroupSuspended } from '../../src/lib/schoolGroupMinimumPolicy.js';

export type SchoolAccessContract = {
  kind?: string | null;
  signing_status?: string | null;
  archived_at?: string | null;
  terminated_at?: string | null;
  withdrawal_requested_at?: string | null;
  suspension_started_at?: string | null;
  suspension_until?: string | null;
  suspension_resumed_at?: string | null;
  accepted_at?: string | null;
  start_within_14_status?: string | null;
  start_within_14_days?: boolean | null;
  class_group_id?: string | null;
  order_snapshot?: ExtraLessonsOrderSnapshot | null;
};

export type SchoolAccessSession = {
  id?: string;
  student_id?: string | null;
  tutor_id?: string | null;
  class_group_id?: string | null;
  subject_id?: string | null;
  start_time?: string | null;
};

export type SchoolSessionAccessResult = {
  isSchool: boolean;
  allowed: boolean;
  reason?: 'missing_session' | 'missing_organization' | 'contract_not_active';
};

function happenedBy(value: string | null | undefined, atMs: number): boolean {
  if (!value) return false;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant <= atMs;
}

function isMissingGroupSuspensionColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return error.code === '42703'
    || error.code === 'PGRST204'
    || (message.includes('suspension_') && (message.includes('does not exist') || message.includes('could not find')));
}

function matchingExtraContract(contract: SchoolAccessContract, session: SchoolAccessSession): boolean {
  if (contract.kind !== 'extra_lessons') return false;
  const order = contract.order_snapshot || null;
  if (session.class_group_id) {
    return (contract.class_group_id || order?.group_id || null) === session.class_group_id;
  }
  if (order?.service_type !== 'individual') return false;
  return !order.subject_id || !session.subject_id || order.subject_id === session.subject_id;
}

function contractActiveForSession(
  contract: SchoolAccessContract,
  session: SchoolAccessSession,
  now: Date,
): boolean {
  if (contract.signing_status !== 'signed' || contract.archived_at) return false;
  const nowMs = now.getTime();
  if (happenedBy(contract.terminated_at, nowMs) || happenedBy(contract.withdrawal_requested_at, nowMs)
    || schoolContractBlocksService(contract, now)) {
    return false;
  }
  if (contract.kind !== 'extra_lessons') return true;
  if (!contract.accepted_at || Date.parse(contract.accepted_at) > nowMs) return false;

  const sessionYmd = session.start_time ? sessionYmdVilnius(session.start_time) : '';
  const order = contract.order_snapshot || null;
  if (!sessionYmd || !order) return true;
  if (order.start_date && sessionYmd < order.start_date) return false;
  if (order.end_date && sessionYmd > order.end_date) return false;
  try {
    const status = (contract.start_within_14_status
      || (contract.start_within_14_days ? 'yes' : 'no')) as StartWithin14Status;
    return sessionYmd >= extraLessonsServiceStartYmd({
      status,
      acceptedAtIso: contract.accepted_at,
      order,
    });
  } catch {
    return sessionYmd >= (order.start_date || sessionYmd);
  }
}

/**
 * A class-specific extra-lessons offer takes precedence over an annual contract.
 * This prevents an unsigned or ended extra agreement from borrowing access from
 * an otherwise valid annual school contract.
 */
export function schoolSessionContractAllowsAccess(
  contracts: SchoolAccessContract[],
  session: SchoolAccessSession,
  now: Date = new Date(),
): boolean {
  const matchingExtra = contracts.filter((contract) => matchingExtraContract(contract, session));
  if (matchingExtra.length > 0) {
    return matchingExtra.some((contract) => contractActiveForSession(contract, session, now));
  }
  return contracts
    .filter((contract) => (contract.kind || 'annual') === 'annual')
    .some((contract) => contractActiveForSession(contract, session, now));
}

/** Resolve whether the student side of a tracked lesson link may receive/use it. */
export async function checkSchoolSessionStudentAccess(
  supabase: SupabaseClient,
  sessionOrId: SchoolAccessSession | string,
  now: Date = new Date(),
): Promise<SchoolSessionAccessResult> {
  let session: SchoolAccessSession | null = typeof sessionOrId === 'string' ? null : sessionOrId;
  if (!session) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, student_id, tutor_id, class_group_id, subject_id, start_time')
      .eq('id', sessionOrId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    session = data as SchoolAccessSession | null;
  }
  if (!session?.student_id) return { isSchool: false, allowed: false, reason: 'missing_session' };

  const [{ data: student, error: studentError }, { data: tutor, error: tutorError }] = await Promise.all([
    supabase.from('students').select('organization_id').eq('id', session.student_id).maybeSingle(),
    session.tutor_id
      ? supabase.from('profiles').select('organization_id').eq('id', session.tutor_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (studentError) throw new Error(studentError.message);
  if (tutorError) throw new Error(tutorError.message);
  const organizationId = student?.organization_id || tutor?.organization_id || null;
  if (!organizationId) return { isSchool: false, allowed: false, reason: 'missing_organization' };

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('entity_type')
    .eq('id', organizationId)
    .maybeSingle();
  if (organizationError) throw new Error(organizationError.message);
  if (organization?.entity_type !== 'school') return { isSchool: false, allowed: true };

  if (session.class_group_id) {
    const { data: group, error: groupError } = await supabase
      .from('school_class_groups')
      .select('suspension_started_at, suspension_until, suspension_resumed_at')
      .eq('id', session.class_group_id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    // During a rolling deploy, the API can briefly run before the additive
    // group-suspension migration reaches the database. Keep the existing
    // contract checks available during that narrow overlap.
    if (groupError && !isMissingGroupSuspensionColumn(groupError)) throw new Error(groupError.message);
    if (group && isSchoolClassGroupSuspended(group, now)) {
      return { isSchool: true, allowed: false, reason: 'contract_not_active' };
    }
  }

  // `*` intentionally tolerates a rolling deploy before the termination columns
  // are present; unsigned-contract access is still enforced during that overlap.
  const { data: contracts, error: contractError } = await supabase
    .from('school_contracts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('student_id', session.student_id);
  if (contractError) throw new Error(contractError.message);
  const allowed = schoolSessionContractAllowsAccess(
    (contracts || []) as SchoolAccessContract[],
    session,
    now,
  );
  return { isSchool: true, allowed, ...(allowed ? {} : { reason: 'contract_not_active' as const }) };
}
