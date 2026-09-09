const MS_24H = 24 * 60 * 60 * 1000;

export function isLateCancellation(
  consultationStartIso: string,
  cancelledAt: Date = new Date(),
): boolean {
  const start = new Date(consultationStartIso).getTime();
  if (!Number.isFinite(start)) return false;
  return start - cancelledAt.getTime() < MS_24H;
}

export type CancelEffect =
  | 'release_quota'
  | 'charge_individual_us'
  | 'no_charge_group'
  | 'paid_not_invoiced';

export type CancelContext = {
  kind: 'teacher_subject' | 'help_team';
  mode: 'individual' | 'group' | 'join_lesson' | null;
  isPaid: boolean;
  startTimeIso: string;
  cancelledAt?: Date;
};

export function cancelEffect(ctx: CancelContext): CancelEffect {
  const late = isLateCancellation(ctx.startTimeIso, ctx.cancelledAt);
  if (ctx.kind === 'help_team' && ctx.isPaid) {
    return late ? 'paid_not_invoiced' : 'release_quota';
  }
  if (!late) return 'release_quota';
  if (ctx.mode === 'group' || ctx.mode === 'join_lesson') return 'no_charge_group';
  return 'charge_individual_us';
}
