export type SchoolContractLifecycleFields = {
  terminated_at?: string | null;
  withdrawal_requested_at?: string | null;
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

function lifecycleYmd(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : schoolYmd(parsed);
}

export function isSchoolContractTerminated(contract: SchoolContractLifecycleFields): boolean {
  return Boolean(contract.terminated_at || contract.withdrawal_requested_at);
}

/** A dated suspension expires automatically at the end of `suspension_until`. */
export function isSchoolContractSuspended(
  contract: SchoolContractLifecycleFields,
  now: Date = new Date(),
): boolean {
  if (!contract.suspension_started_at || contract.suspension_resumed_at || isSchoolContractTerminated(contract)) {
    return false;
  }
  const until = lifecycleYmd(contract.suspension_until);
  return !until || until >= schoolYmd(now);
}

export function schoolContractBlocksService(
  contract: SchoolContractLifecycleFields,
  now: Date = new Date(),
): boolean {
  return isSchoolContractTerminated(contract) || isSchoolContractSuspended(contract, now);
}

export function schoolContractSuspensionOverlapsPeriod(
  contract: SchoolContractLifecycleFields,
  periodStartYmd: string,
  periodEndYmd: string,
): boolean {
  const started = lifecycleYmd(contract.suspension_started_at);
  if (!started || started > periodEndYmd) return false;
  const explicitEnd = lifecycleYmd(contract.suspension_until);
  const resumed = lifecycleYmd(contract.suspension_resumed_at);
  const ended = [explicitEnd, resumed].filter(Boolean).sort()[0] || null;
  return !ended || ended >= periodStartYmd;
}
