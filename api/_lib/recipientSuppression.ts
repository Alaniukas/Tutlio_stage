export type RecipientSuppression = { email: string; status: 'blocked' | 'not_blocked' | 'unknown'; reason?: 'bounce' | 'complaint' | 'manual' };

/** Absence from the suppression list is not proof of delivery. Never expose source emails. */
export async function checkRecipientSuppression(email: string, apiKey: string): Promise<RecipientSuppression> {
  try {
    const response = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (response.status === 404 && body.name === 'not_found') return { email, status: 'not_blocked' };
    if (response.ok && body.object === 'suppression' && body.email?.toLowerCase() === email.toLowerCase()) {
      return { email, status: 'blocked', ...(['bounce', 'complaint', 'manual'].includes(body.origin) ? { reason: body.origin } : {}) };
    }
  } catch { /* A provider error must never look like successful delivery. */ }
  return { email, status: 'unknown' };
}
