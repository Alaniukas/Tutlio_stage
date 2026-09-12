export const HELP_TEAM_CATEGORIES = [
  'speech',
  'psychologist',
  'special_pedagogue',
  'additional_help',
] as const;

export type HelpTeamCategory = (typeof HELP_TEAM_CATEGORIES)[number];

export const HELP_TEAM_CATEGORY_I18N: Record<HelpTeamCategory, string> = {
  speech: 'schoolConsult.helpCat.speech',
  psychologist: 'schoolConsult.helpCat.psychologist',
  special_pedagogue: 'schoolConsult.helpCat.specialPedagogue',
  additional_help: 'schoolConsult.helpCat.additionalHelp',
};

export type PptStudentFlags = {
  ppt_adapted?: boolean | null;
  ppt_individualized?: boolean | null;
};

export function familyHelpTeamQuota(students: PptStudentFlags[]): number {
  let max = 2;
  for (const s of students) {
    if (s.ppt_individualized) max = Math.max(max, 4);
    else if (s.ppt_adapted) max = Math.max(max, 3);
  }
  return max;
}

export type HelpTeamConsultationRow = {
  help_team_category?: string | null;
  status: string;
  outcome?: string | null;
  is_paid?: boolean | null;
  late_cancel?: boolean | null;
  mode?: string | null;
  start_time?: string | null;
};

function countsTowardQuota(row: HelpTeamConsultationRow, now = Date.now()): boolean {
  if (row.is_paid) return false;
  if (row.outcome === 'occurred') return true;
  if (row.outcome === 'no_show' && row.mode === 'individual') return true;
  if (row.late_cancel && row.mode === 'individual') return true;
  if (row.status === 'cancelled_parent' || row.status === 'cancelled_staff') {
    if (row.late_cancel && row.mode === 'individual') return true;
    return false;
  }
  return false;
}

function reservedVisit(row: HelpTeamConsultationRow, now = Date.now()): boolean {
  if (row.is_paid) return false;
  if (row.outcome) return false;
  if (row.status !== 'confirmed') return false;
  const start = row.start_time ? new Date(row.start_time).getTime() : NaN;
  return Number.isFinite(start) && start > now;
}

export type HelpTeamQuotaInput = {
  quota: number;
  consultations: HelpTeamConsultationRow[];
  category: HelpTeamCategory;
};

export type HelpTeamQuota = {
  quota: number;
  used: number;
  reserved: number;
  remaining: number;
  nextIsPaid: boolean;
};

export function computeHelpTeamQuota(input: HelpTeamQuotaInput): HelpTeamQuota {
  const { quota, consultations, category } = input;
  const rows = consultations.filter((r) => r.help_team_category === category);
  let used = 0;
  let reserved = 0;
  for (const row of rows) {
    if (countsTowardQuota(row)) used += 1;
    else if (reservedVisit(row)) reserved += 1;
  }
  const remaining = Math.max(0, quota - used - reserved);
  return { quota, used, reserved, remaining, nextIsPaid: remaining <= 0 };
}

export function helpTeamPriceEur(slotMinutes: number, hourlyRateEur: number): number {
  const rate = Math.max(0, Number(hourlyRateEur) || 0);
  const mins = Math.max(0, Number(slotMinutes) || 0);
  return Math.round((mins / 60) * rate * 100) / 100;
}
