/**
 * Org admin dashboard cards: occurred lessons vs cash collected.
 * Stats page uses conducted-lesson revenue separately — do not mix the two.
 */

export type OrgDashboardSession = {
  status?: string | null;
  paid?: boolean | null;
  payment_status?: string | null;
  price?: number | null;
  is_complimentary?: boolean | null;
  end_time?: string | Date | null;
};

export function isPaidLikeOrgSession(session: {
  paid?: boolean | null;
  payment_status?: string | null;
}): boolean {
  if (session.paid === true) return true;
  const ps = String(session.payment_status || '');
  return ps === 'paid' || ps === 'confirmed';
}

export function isOccurredOrgSession(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'no_show';
}

function billablePrice(session: OrgDashboardSession): number {
  if (session.is_complimentary === true) return 0;
  const n = Number(session.price);
  return Number.isFinite(n) ? n : 0;
}

export function orgDashboardMonthMetrics(
  sessions: OrgDashboardSession[],
  now: Date = new Date(),
): {
  occurredCount: number;
  plannedCount: number;
  paidRevenueEur: number;
} {
  let occurredCount = 0;
  let plannedCount = 0;
  let paidRevenueEur = 0;
  const nowMs = now.getTime();

  for (const session of sessions) {
    const status = String(session.status || '');
    if (status === 'cancelled' || status === 'canceled') continue;

    if (isOccurredOrgSession(status)) occurredCount += 1;

    if (status === 'active') {
      const end = session.end_time ? new Date(session.end_time) : null;
      if (end && Number.isFinite(end.getTime()) && end.getTime() > nowMs) {
        plannedCount += 1;
      }
    }

    if (isPaidLikeOrgSession(session)) {
      paidRevenueEur += billablePrice(session);
    }
  }

  return {
    occurredCount,
    plannedCount,
    paidRevenueEur,
  };
}
