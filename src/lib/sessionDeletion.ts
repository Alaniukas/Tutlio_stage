import { authHeaders } from './apiHelpers';

export type SessionDeleteScope = 'single' | 'future' | 'all';

export function canFamilyDeleteSession(session: {
  status: string;
  cancellation_penalty_amount?: number | null;
  penalty_resolution?: string | null;
} | null | undefined): boolean {
  if (session?.status !== 'cancelled') return false;
  return session.penalty_resolution !== 'pending' && session.penalty_resolution !== 'invoiced';
}

export function isRecurringSession(session: {
  recurring_session_id?: string | null;
  class_group_id?: string | null;
} | null | undefined): boolean {
  return Boolean(session?.recurring_session_id || session?.class_group_id);
}

export function deletionConfirmationKey(scope: SessionDeleteScope) {
  if (scope === 'all') return 'cal.deleteConfirmAll' as const;
  if (scope === 'future') return 'cal.deleteConfirmFuture' as const;
  return 'cal.deleteConfirmSingle' as const;
}

export async function deleteSessionViaApi(sessionId: string, deleteScope: SessionDeleteScope, options?: {
  groupScope: 'one_student' | 'whole_occurrence';
}) {
  const response = await fetch('/api/delete-session', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ sessionId, deleteScope, ...options }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Failed to delete lesson');
  }
  return result as { success: true; deletedCount: number; deletedSessionIds: string[] };
}
