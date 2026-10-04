import { extraLessonsServiceStartYmd, type ExtraLessonsOrderSnapshot, type ExtraLessonsScheduleSlot, type StartWithin14Status } from './extraLessonsContract.js';
import { canonicalSessionCharge, hasSchoolOccurrenceEvidence, type CanonicalBillableSession } from './schoolCanonicalBilling.js';
import { isSessionInExtraLessonsServiceWindow, sessionMatchesExtraLessonsContract, sessionYmdVilnius } from './schoolExtraLessonsBilling.js';

export type SchoolInvoiceContractWindow = {
  id: string;
  class_group_id?: string | null;
  signing_status?: string;
  accepted_at?: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  withdrawal_requested_at?: string | null;
  terminated_at?: string | null;
  start_within_14_status?: string | null;
  start_within_14_days?: boolean | null;
  unit_price_eur?: number | string | null;
  order_snapshot?: ExtraLessonsOrderSnapshot | null;
  suspension_started_at?: string | null;
  suspension_until?: string | null;
  suspension_resumed_at?: string | null;
  /** Runtime validation of the frozen subject reference; never alters the signed snapshot. */
  missingIndividualSubject?: boolean;
};

export type SchoolSessionBillingDecision = {
  id: string | number;
  session_reference_id: string;
  excluded: boolean;
  reason: string;
  created_at: string;
};

export type SchoolInvoiceReviewReason = 'payable' | 'unconfirmed' | 'free' | 'outside_contract' | 'suspended'
  | 'contract_review' | 'excluded' | 'already_invoiced' | 'not_ended';

export type SchoolInvoiceReviewSession = {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  statusConfirmedAt: string | null;
  subjectName: string;
  tutorName: string;
  unitPriceEur: number;
  included: boolean;
  reason: SchoolInvoiceReviewReason;
  exclusionReason: string | null;
  decisionId: string | number | null;
  alreadyInvoiced: boolean;
  canConfirm: boolean;
};

type SchoolInvoiceActivity = {
  start_time?: string;
  class_group_id?: string | null;
  subject_id?: string | null;
  class_group?: { name?: string | null } | Array<{ name?: string | null }> | null;
  subject?: { name?: string | null; price?: number | null; is_trial?: boolean | null }
    | Array<{ name?: string | null; price?: number | null; is_trial?: boolean | null }> | null;
};

function studentNameInLabel(studentFullName: string, label: string): boolean {
  const parts = studentFullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return true;
  const normalized = label.toLowerCase();
  return parts.every((part) => normalized.includes(part.toLowerCase()));
}

function normalizeBillingLabel(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function individualSessionMatchesContractService(
  session: SchoolInvoiceActivity,
  order: ExtraLessonsOrderSnapshot,
  studentFullName?: string | null,
): boolean {
  const subject = Array.isArray(session.subject) ? session.subject[0] : session.subject;
  const subjectName = normalizeBillingLabel(String(subject?.name || ''));
  const serviceName = normalizeBillingLabel(String(order.service_name || ''));
  if (!subjectName || !serviceName) return false;
  if (subjectName === serviceName || subjectName.includes(serviceName) || serviceName.includes(subjectName)) return true;
  if (studentFullName && studentNameInLabel(studentFullName, subjectName) && studentNameInLabel(studentFullName, serviceName)) {
    return true;
  }
  return false;
}

function parseClockMinutes(value: string): number | null {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function sessionFitsGroupSchedule(startIso: string, slots: ExtraLessonsScheduleSlot[] | undefined): boolean {
  if (!slots?.length) return true;
  const date = new Date(startIso);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vilnius',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[parts.find((part) => part.type === 'weekday')?.value || ''];
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(weekday) || !Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const startMinutes = hour * 60 + minute;
  return slots.some((slot) => {
    if (Number(slot.weekday) !== weekday) return false;
    const slotStart = parseClockMinutes(slot.start_time);
    const slotEnd = parseClockMinutes(slot.end_time || slot.start_time);
    if (slotStart === null || slotEnd === null) return true;
    return startMinutes >= slotStart - 5 && startMinutes < slotEnd;
  });
}

function sessionGroupServiceLabel(session: SchoolInvoiceActivity): string {
  if (!session.class_group_id) return '';
  const group = Array.isArray(session.class_group) ? session.class_group[0] : session.class_group;
  return String(group?.name || '').trim();
}

function groupServiceLabelsMatch(left: string, right: string): boolean {
  const a = normalizeBillingLabel(left);
  const b = normalizeBillingLabel(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function tutorNamesMatch(session: SchoolInvoiceActivity & { tutor?: any }, order: ExtraLessonsOrderSnapshot): boolean {
  const tutor = Array.isArray(session.tutor) ? session.tutor[0] : session.tutor;
  const sessionTutor = normalizeBillingLabel(String(tutor?.full_name || ''));
  const orderTutor = normalizeBillingLabel(String(order.tutor_name || ''));
  if (!orderTutor || !sessionTutor) return true;
  return sessionTutor === orderTutor || sessionTutor.includes(orderTutor) || orderTutor.includes(sessionTutor);
}

/** Group sessions may exist before class_group_id is linked or after the group row is recreated. */
function groupContractLooselyMatchesSession(
  session: Pick<CanonicalBillableSession, 'class_group_id' | 'subject_id' | 'start_time'> & SchoolInvoiceActivity & { tutor?: any },
  contract: SchoolInvoiceContractWindow,
): boolean {
  const order = contract.order_snapshot;
  if (!order || order.service_type !== 'group') return false;
  const serviceLabel = String(order.group_name || order.service_name || '').trim();
  if (!serviceLabel) return false;
  const day = sessionYmdVilnius(session.start_time);
  if (!day) return false;
  if (order.start_date && day < order.start_date) return false;
  if (order.end_date && day > order.end_date) return false;
  if (!tutorNamesMatch(session, order)) return false;

  const sessionLabel = sessionGroupServiceLabel(session);
  if (sessionLabel && groupServiceLabelsMatch(sessionLabel, serviceLabel)) return true;
  if (!session.class_group_id && !session.subject_id) {
    return sessionFitsGroupSchedule(session.start_time, order.schedule_slots);
  }
  return false;
}

function isTrialLessonSession(session: SchoolInvoiceActivity): boolean {
  const subject = Array.isArray(session.subject) ? session.subject[0] : session.subject;
  return subject?.is_trial === true;
}

function sessionPlausiblyBelongsToIndividualContract(
  session: SchoolInvoiceActivity,
  contract: SchoolInvoiceContractWindow,
  studentFullName?: string | null,
): boolean {
  const order = contract.order_snapshot;
  if (!order || order.service_type !== 'individual' || session.class_group_id) return false;
  if (order.subject_id && session.subject_id === order.subject_id) return true;
  return individualSessionMatchesContractService(session, order, studentFullName);
}

function individualContractActivityName(
  session: SchoolInvoiceActivity,
  contracts: SchoolInvoiceContractWindow[],
  studentFullName?: string | null,
): string | null {
  const matching = contracts.filter((contract) => (
    contract.order_snapshot?.service_type === 'individual'
    && schoolInvoiceSessionMatchesContract(
      session as Pick<CanonicalBillableSession, 'class_group_id' | 'subject_id' | 'start_time'> & SchoolInvoiceActivity,
      contract,
      studentFullName,
    )
  ));
  const canonical = pickCanonicalInvoiceContract(matching.filter(isBillableServiceContract)) || matching[0];
  if (canonical?.order_snapshot?.service_name) return String(canonical.order_snapshot.service_name);
  return null;
}

/** Individual sessions may exist before subjects.subject_id is linked on the row. */
function individualContractLooselyMatchesSession(
  session: Pick<CanonicalBillableSession, 'class_group_id' | 'subject_id' | 'start_time'> & SchoolInvoiceActivity & { tutor?: any },
  contract: SchoolInvoiceContractWindow,
  studentFullName?: string | null,
): boolean {
  const order = contract.order_snapshot;
  if (!order || order.service_type !== 'individual' || session.class_group_id) return false;
  if (order.subject_id && session.subject_id === order.subject_id) return false;
  if (session.subject_id && individualSessionMatchesContractService(session, order, studentFullName)) return false;
  const day = sessionYmdVilnius(session.start_time);
  if (order.start_date && day < order.start_date) return false;
  if (order.end_date && day > order.end_date) return false;
  if (!tutorNamesMatch(session, order)) return false;
  if (studentFullName && !studentNameInLabel(studentFullName, String(order.service_name || ''))) return false;
  return !session.subject_id || individualSessionMatchesContractService(session, order, studentFullName);
}

function contractActivitySuffix(
  session: SchoolInvoiceActivity,
  contracts: SchoolInvoiceContractWindow[],
  studentFullName?: string | null,
): string | null {
  if (!contracts.length) return null;
  const matching = contracts.filter((contract) => schoolInvoiceSessionMatchesContract(
    session as Pick<CanonicalBillableSession, 'class_group_id' | 'subject_id' | 'start_time'> & SchoolInvoiceActivity,
    contract,
    studentFullName,
  ));
  if (session.class_group_id) {
    if (!matching.length) return 'sutartis nėra';
    const signed = matching.filter((contract) => (
      contract.signing_status === 'signed' && contract.accepted_at && contract.order_snapshot
    ));
    if (!signed.length) return 'sutartis nepasirašyta';
    return null;
  }
  if (!matching.length) return null;
  const signed = matching.filter((contract) => (
    contract.signing_status === 'signed' && contract.accepted_at && contract.order_snapshot
  ));
  if (!signed.length) return 'sutartis nepasirašyta';
  return null;
}

/** Historical group rows may still reference a subject named for an individual child. */
export function schoolInvoiceSessionActivityName(
  session: SchoolInvoiceActivity,
  contracts: SchoolInvoiceContractWindow[] = [],
  studentFullName?: string | null,
): string {
  if (session.class_group_id) {
    const group = Array.isArray(session.class_group) ? session.class_group[0] : session.class_group;
    const order = contracts.find((contract) => (
      (contract.class_group_id || contract.order_snapshot?.group_id) === session.class_group_id
    ))?.order_snapshot;
    const base = String(group?.name || order?.group_name || order?.service_name || 'Užsiėmimas');
    const suffix = contractActivitySuffix(session, contracts, studentFullName);
    return suffix ? `${base} · ${suffix}` : base;
  }
  const subject = Array.isArray(session.subject) ? session.subject[0] : session.subject;
  const raw = String(subject?.name || 'Užsiėmimas');
  const fromContract = individualContractActivityName(session, contracts, studentFullName);
  if (fromContract) {
    const suffix = contractActivitySuffix(session, contracts, studentFullName);
    return suffix ? `${fromContract} · ${suffix}` : fromContract;
  }
  if (studentFullName && raw.includes('(individuali)') && !studentNameInLabel(studentFullName, raw)) {
    const renamed = raw.replace(/\s+[A-ZĄČĘĖĮŠŲŪŽ][^\s]+\s+[A-ZĄČĘĖĮŠŲŪŽ][^\s]+$/, ` ${studentFullName}`);
    const suffix = contractActivitySuffix(session, contracts, studentFullName);
    return suffix ? `${renamed} · ${suffix}` : renamed;
  }
  const suffix = contractActivitySuffix(session, contracts, studentFullName);
  return suffix && raw === 'Užsiėmimas' ? `${raw} · ${suffix}` : (suffix ? `${raw} · ${suffix}` : raw);
}

function inSuspension(session: CanonicalBillableSession, contract: SchoolInvoiceContractWindow): boolean {
  const suspended = Date.parse(contract.suspension_started_at || '');
  const start = Date.parse(session.start_time);
  if (!Number.isFinite(suspended) || start < suspended) return false;
  const resumed = Date.parse(contract.suspension_resumed_at || '');
  if (Number.isFinite(resumed)) return start < resumed;
  return !contract.suspension_until || sessionYmdVilnius(session.start_time) <= contract.suspension_until;
}

function positiveMoney(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
}

/** Archived duplicates must not block billing for the active agreement. */
export function filterContractsForSchoolInvoiceReview(
  contracts: SchoolInvoiceContractWindow[],
): SchoolInvoiceContractWindow[] {
  return contracts.filter((contract) => !contract.archived_at);
}

function contractHasCompleteBillableTerms(contract: SchoolInvoiceContractWindow): boolean {
  if (!contract.order_snapshot) return false;
  const unit = positiveMoney(contract.unit_price_eur) || positiveMoney(contract.order_snapshot.unit_price_eur);
  return unit > 0;
}

function isBillableServiceContract(contract: SchoolInvoiceContractWindow): boolean {
  if (!contract.order_snapshot) return false;
  if (contract.signing_status === 'signed' && contract.accepted_at) return true;
  return contract.signing_status === 'sent' && contractHasCompleteBillableTerms(contract);
}

function resolveAcceptedAtIso(contract: SchoolInvoiceContractWindow): string {
  if (contract.accepted_at) return contract.accepted_at;
  const start = contract.order_snapshot?.start_date;
  return start ? `${start}T12:00:00.000Z` : '';
}

function sessionWithinContractWindow(session: CanonicalBillableSession, contract: SchoolInvoiceContractWindow): boolean {
  const order = contract.order_snapshot;
  if (!order) return false;
  const acceptedAtIso = resolveAcceptedAtIso(contract);
  if (!acceptedAtIso) return false;
  const endedAt = [contract.withdrawal_requested_at, contract.terminated_at]
    .filter((value): value is string => Boolean(value)).sort()[0];
  return (!order.end_date || sessionYmdVilnius(session.start_time) <= order.end_date)
    && isSessionInExtraLessonsServiceWindow(session.start_time, {
      serviceStartYmd: extraLessonsServiceStartYmd({
        status: (contract.start_within_14_status || (contract.start_within_14_days ? 'yes' : 'no')) as StartWithin14Status,
        acceptedAtIso,
        order,
      }),
      endedAtIso: endedAt,
    });
}

function contractBillablePriority(contract: SchoolInvoiceContractWindow): number {
  if (contract.signing_status === 'signed' && contract.accepted_at) return 3;
  if (contract.signing_status === 'sent' && contractHasCompleteBillableTerms(contract)) return 2;
  return 0;
}

function pickCanonicalInvoiceContract(contracts: SchoolInvoiceContractWindow[]): SchoolInvoiceContractWindow | null {
  const scored = contracts
    .filter((contract) => contractBillablePriority(contract) > 0)
    .sort((left, right) => {
      const priorityDiff = contractBillablePriority(right) - contractBillablePriority(left);
      if (priorityDiff !== 0) return priorityDiff;
      const leftAccepted = Date.parse(left.accepted_at || '') || 0;
      const rightAccepted = Date.parse(right.accepted_at || '') || 0;
      if (rightAccepted !== leftAccepted) return rightAccepted - leftAccepted;
      const leftCreated = Date.parse(left.created_at || '') || 0;
      const rightCreated = Date.parse(right.created_at || '') || 0;
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
      return String(right.id).localeCompare(String(left.id));
    });
  return scored[0] || null;
}

function matchingBillableContracts(
  session: CanonicalBillableSession & SchoolInvoiceActivity,
  contracts: SchoolInvoiceContractWindow[],
  studentFullName?: string | null,
): SchoolInvoiceContractWindow[] {
  return contracts
    .filter((contract) => schoolInvoiceSessionMatchesContract(session, contract, studentFullName))
    .filter((contract) => isBillableServiceContract(contract))
    .filter((contract) => sessionWithinContractWindow(session, contract));
}

function contractNeedsAdminReview(contract: SchoolInvoiceContractWindow): boolean {
  if (contract.archived_at || contract.order_snapshot || contract.class_group_id) return false;
  const status = String(contract.signing_status || '');
  return status === 'sent' || status === 'signed';
}

/** Session row first; otherwise the signed extra-lessons unit price for that group/subject. */
export function resolveSchoolInvoiceUnitPrice(
  session: {
    price?: number | null;
    class_group_id?: string | null;
    subject_id?: string | null;
    subject?: { name?: string | null; price?: number | null } | Array<{ name?: string | null; price?: number | null }> | null;
  },
  contracts: SchoolInvoiceContractWindow[] = [],
  studentFullName?: string | null,
): number {
  const stored = positiveMoney(session.price);
  if (stored) return stored;
  const matching = contracts.filter((contract) => (
    (contract.signing_status === 'signed' || contract.signing_status === 'sent')
    && schoolInvoiceSessionMatchesContract(session as CanonicalBillableSession & SchoolInvoiceActivity, contract, studentFullName)
  ));
  const signedMatching = matching.filter((contract) => contract.signing_status === 'signed');
  for (const contract of signedMatching) {
    const unit = positiveMoney(contract.unit_price_eur) || positiveMoney(contract.order_snapshot?.unit_price_eur);
    if (unit) return unit;
  }
  for (const contract of matching) {
    const unit = positiveMoney(contract.unit_price_eur) || positiveMoney(contract.order_snapshot?.unit_price_eur);
    if (unit) return unit;
  }
  if (session.class_group_id) return 0;
  const subject = Array.isArray(session.subject) ? session.subject[0] : session.subject;
  return positiveMoney(subject?.price);
}

/** Invoice line key when session.subject_id and class_group_id are both empty (pre-link group row). */
export function schoolInvoiceBillableSubjectKey(
  session: Pick<CanonicalBillableSession, 'id' | 'class_group_id' | 'subject_id' | 'start_time'> & SchoolInvoiceActivity & { tutor?: any },
  contracts: SchoolInvoiceContractWindow[] = [],
  studentFullName?: string | null,
): string | null {
  const direct = String(session.subject_id || session.class_group_id || '').trim();
  if (direct) return direct;
  const matching = contracts.filter((contract) => schoolInvoiceSessionMatchesContract(session, contract, studentFullName));
  const groupId = matching
    .map((contract) => contract.order_snapshot?.subject_id || contract.class_group_id || contract.order_snapshot?.group_id)
    .find((value) => Boolean(value));
  if (groupId) return String(groupId);
  if (matching.length) return `session:${session.id}`;
  return null;
}

export function schoolInvoiceSessionMatchesContract(
  session: Pick<CanonicalBillableSession, 'class_group_id' | 'subject_id' | 'start_time'> & SchoolInvoiceActivity & { tutor?: any },
  contract: SchoolInvoiceContractWindow,
  studentFullName?: string | null,
): boolean {
  const order = contract.order_snapshot;
  if (!order) return Boolean(contract.class_group_id) && contract.class_group_id === session.class_group_id;
  const scope = { ...order, group_id: contract.class_group_id || order.group_id };
  if (sessionMatchesExtraLessonsContract(session, scope)) return true;
  if (order.service_type === 'group' && groupContractLooselyMatchesSession(session, contract)) return true;
  if (order.service_type === 'individual' && !session.class_group_id) {
    if (individualSessionMatchesContractService(session, order, studentFullName)) return true;
    return individualContractLooselyMatchesSession(session, contract, studentFullName);
  }
  return false;
}

/** Historical service windows restrict charges; an absence alone does not waive a group charge. */
export function schoolInvoiceContractReason(
  session: CanonicalBillableSession & SchoolInvoiceActivity,
  contracts: SchoolInvoiceContractWindow[],
  studentFullName?: string | null,
): 'payable' | 'outside_contract' | 'suspended' | 'contract_review' {
  const activeContracts = filterContractsForSchoolInvoiceReview(contracts);
  const matching = activeContracts.filter((contract) => schoolInvoiceSessionMatchesContract(session, contract, studentFullName));
  if (matching.some((contract) => !contract.order_snapshot)
    || activeContracts.some((contract) => contractNeedsAdminReview(contract))) return 'contract_review';
  // Older/direct school lessons do not necessarily have an extra-lessons agreement.
  if (!matching.length) {
    // A deleted subject cannot safely turn a signed agreement's lessons into
    // unrestricted direct charges. Leave other, explicitly matched services alone.
    const unresolvedIndividual = !session.class_group_id && activeContracts.some((contract) => (
      contract.signing_status === 'signed'
      && contract.order_snapshot?.service_type === 'individual'
      && contract.missingIndividualSubject
      && sessionPlausiblyBelongsToIndividualContract(session, contract, studentFullName)
    ));
    return unresolvedIndividual ? 'contract_review' : 'payable';
  }
  const canonical = pickCanonicalInvoiceContract(matchingBillableContracts(session, activeContracts, studentFullName));
  if (!canonical) {
    const evidenced = hasSchoolOccurrenceEvidence(session)
      || Boolean(session.class_group_id && session.group_occurred);
    if (evidenced && matching.some((contract) => contract.signing_status === 'sent' && contract.order_snapshot)) {
      return 'payable';
    }
    return 'outside_contract';
  }
  if (inSuspension(session, canonical)) return 'suspended';
  const endedAt = [canonical.withdrawal_requested_at, canonical.terminated_at]
    .filter((value): value is string => Boolean(value)).sort()[0];
  if (endedAt && session.end_time && Date.parse(session.end_time) > Date.parse(endedAt)) return 'contract_review';
  return 'payable';
}

export function reviewSchoolInvoiceSession(
  session: CanonicalBillableSession & SchoolInvoiceActivity & { tutor?: any; price?: number | null },
  contracts: SchoolInvoiceContractWindow[],
  decision: SchoolSessionBillingDecision | undefined,
  alreadyInvoiced: boolean,
  nowMs = Date.now(),
  studentFullName?: string | null,
): SchoolInvoiceReviewSession {
  const tutor = Array.isArray(session.tutor) ? session.tutor[0] : session.tutor;
  const ended = Number.isFinite(Date.parse(session.end_time || '')) && Date.parse(session.end_time || '') <= nowMs;
  if (isTrialLessonSession(session)) {
    return {
      id: session.id,
      startTime: session.start_time,
      endTime: session.end_time || '',
      status: session.status,
      statusConfirmedAt: session.status_confirmed_at || null,
      subjectName: schoolInvoiceSessionActivityName(session, contracts, studentFullName),
      tutorName: String(tutor?.full_name || 'mokytojas'),
      unitPriceEur: 0,
      included: false,
      reason: 'free',
      exclusionReason: null,
      decisionId: decision?.id ?? null,
      alreadyInvoiced,
      canConfirm: !alreadyInvoiced && ended && ['active', 'completed', 'no_show'].includes(session.status),
    };
  }
  const contractReason = schoolInvoiceContractReason(session, contracts, studentFullName);
  const charge = canonicalSessionCharge(session, session.class_group_id ? 'group' : 'individual');
  const reason: SchoolInvoiceReviewReason = alreadyInvoiced ? 'already_invoiced'
    : decision?.excluded ? 'excluded'
    : !ended ? 'not_ended'
    : contractReason !== 'payable' ? contractReason
    : charge === 'free' ? 'free'
    : charge === 'review' ? 'unconfirmed'
    : 'payable';
  return {
    id: session.id,
    startTime: session.start_time,
    endTime: session.end_time || '',
    status: session.status,
    statusConfirmedAt: session.status_confirmed_at || null,
    subjectName: schoolInvoiceSessionActivityName(session, contracts, studentFullName),
    tutorName: String(tutor?.full_name || 'mokytojas'),
    unitPriceEur: resolveSchoolInvoiceUnitPrice(session, contracts, studentFullName),
    included: reason === 'payable',
    reason,
    exclusionReason: decision?.excluded ? decision.reason : null,
    decisionId: decision?.id ?? null,
    alreadyInvoiced,
    canConfirm: !alreadyInvoiced && ended && ['active', 'completed', 'no_show'].includes(session.status),
  };
}

/** Rows are loaded in descending identity order, so restore entries retain the earlier exclusion audit. */
export function latestSchoolBillingDecisions(rows: SchoolSessionBillingDecision[]): Map<string, SchoolSessionBillingDecision> {
  const latest = new Map<string, SchoolSessionBillingDecision>();
  for (const row of rows) if (!latest.has(row.session_reference_id)) latest.set(row.session_reference_id, row);
  return latest;
}
