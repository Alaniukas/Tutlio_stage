import { isProKlaseOrg } from './marketMoney.js';
import { orgRequiresTutorStatusConfirmation } from './sessionStatusConfirmation.js';

/**
 * Shared "conducted lesson" rules for company org admin stats and tutor cards.
 * A lesson counts when it has ended with completed or student no-show status.
 * When includeEndedActive is enabled (orgs without manual outcome confirmation),
 * past active rows also count — matching calendar/session list stats until cron completes them.
 */
export type ConductedOrgSessionLike = {
  status?: string | null;
  end_time?: string | Date | null;
  exclude_from_lesson_count?: boolean | null;
};

export type ConductedOrgSessionOptions = {
  /** Treat status=active with end_time in the past as conducted (default false). */
  includeEndedActive?: boolean;
  now?: Date;
};

/** Align stats / dashboard counts with how each org finalizes lesson outcomes. */
export function companyConductedSessionOptions(opts: {
  organizationId?: string | null;
  entityType?: string | null;
  requireConfirmation?: boolean;
}): ConductedOrgSessionOptions {
  const isSchool = opts.entityType === 'school';
  const proKlase = !isSchool && isProKlaseOrg(opts.organizationId);
  const requireConfirmation = opts.requireConfirmation
    ?? orgRequiresTutorStatusConfirmation(opts.organizationId);
  return {
    includeEndedActive: !isSchool && !proKlase && !requireConfirmation,
  };
}

export function isConductedOrgSession(
  status: string,
  session?: Pick<ConductedOrgSessionLike, 'end_time'> | null,
  options: ConductedOrgSessionOptions = {},
): boolean {
  if (status === 'completed' || status === 'no_show') return true;
  if (!options.includeEndedActive || status !== 'active' || !session?.end_time) return false;
  const end = new Date(session.end_time);
  const now = options.now ?? new Date();
  return Number.isFinite(end.getTime()) && end.getTime() < now.getTime();
}

export function filterConductedOrgSessions<T extends ConductedOrgSessionLike>(
  sessions: T[],
  options: ConductedOrgSessionOptions = {},
): T[] {
  return sessions.filter((s) =>
    isConductedOrgSession(String(s.status || ''), s, options),
  );
}

export function countConductedOrgSessions(
  sessions: ConductedOrgSessionLike[],
  options: ConductedOrgSessionOptions = {},
): number {
  return sessions.filter(
    (s) =>
      s.exclude_from_lesson_count !== true
      && isConductedOrgSession(String(s.status || ''), s, options),
  ).length;
}
