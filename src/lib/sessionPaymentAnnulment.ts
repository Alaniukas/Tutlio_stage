import { authHeaders } from './apiHelpers';
import { invalidateCache } from './dataCache';

export type AnnulledSessionPayment = {
  id: string;
  paid: boolean;
  payment_status: string;
  is_complimentary: boolean;
};

/** Annul only the client's charge; the lesson outcome still determines tutor pay. */
export function canAnnulSessionPayment(session: {
  status?: string | null;
  paid?: boolean | null;
  payment_status?: string | null;
  is_complimentary?: boolean | null;
  class_group_id?: string | null;
} | null | undefined): boolean {
  return Boolean(session && ['active', 'completed', 'no_show'].includes(session.status || '')
    && !session.paid && session.payment_status !== 'paid' && !session.is_complimentary
    && !session.class_group_id);
}

export async function annulSessionPayment(sessionId: string): Promise<
  { ok: true; session: AnnulledSessionPayment }
  | { ok: false; code: string }
> {
  try {
    const res = await fetch('/api/annul-session-payment', {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify({ sessionId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: String(body.code || 'failed') };
    const session = body.session;
    if (session?.id !== sessionId || session.is_complimentary !== true
      || session.paid !== true || session.payment_status !== 'paid') {
      return { ok: false, code: 'failed' };
    }
    for (const prefix of ['company_sessions', 'company_dashboard', 'company_stats:', 'company_tvarkarastis:']) {
      invalidateCache(prefix);
    }
    return { ok: true, session };
  } catch {
    return { ok: false, code: 'failed' };
  }
}
