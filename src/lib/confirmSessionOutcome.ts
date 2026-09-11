import { authHeaders } from '@/lib/apiHelpers';
import { defaultNoShowWhenForNow } from '@/lib/noShowWhen';

export type ConfirmedSessionOutcome = 'completed' | 'no_show';

type ConfirmSessionOutcomeInput = {
  sessionId: string;
  currentStatus: string;
  status: ConfirmedSessionOutcome;
  startTime: string | Date;
  endTime: string | Date;
};

/**
 * Finalize or correct a lesson outcome through the authenticated server route.
 * The server owns authorization, audit stamps, and package-counter side effects.
 */
export async function confirmSessionOutcome({
  sessionId,
  currentStatus,
  status,
  startTime,
  endTime,
}: ConfirmSessionOutcomeInput): Promise<void> {
  const existingOutcome = currentStatus === 'completed' || currentStatus === 'no_show';
  const response = await fetch('/api/confirm-session-status', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      sessionId,
      status,
      ...(status === 'no_show'
        ? { noShowWhen: defaultNoShowWhenForNow(new Date(startTime), new Date(endTime)) }
        : {}),
      ...(existingOutcome && currentStatus === status ? { confirmExisting: true } : {}),
      ...(existingOutcome && currentStatus !== status ? { correctExisting: true } : {}),
    }),
  });

  const body = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new Error(String((body as { error?: unknown }).error || response.status));
  }
}
