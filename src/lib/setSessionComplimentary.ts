import { authHeaders } from '@/lib/apiHelpers';

export async function setSessionComplimentary(
  sessionId: string,
  complimentary: boolean,
): Promise<{ ok: true; session: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/mark-session-complimentary', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ sessionId, complimentary }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String((body as { error?: string }).error || `HTTP ${res.status}`) };
    }
    return { ok: true, session: (body as { session: Record<string, unknown> }).session };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Request failed' };
  }
}
