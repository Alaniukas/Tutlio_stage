/**
 * Options for @supabase/supabase-js createClient (service role) on the local dev API only.
 * When `TUTLIO_DEV_API_LOCAL=1` (set by scripts/dev-api-local.ts), Node's default fetch to
 * Supabase can fail with `TypeError: fetch failed` behind TLS-inspecting proxies; undici with
 * rejectUnauthorized: false matches typical browser trust for localhost development.
 * Never set `TUTLIO_DEV_API_LOCAL` in production deploy env.
 */
import { Agent, fetch as undiciFetch } from 'undici';

let cachedInsecureAgent: Agent | null | undefined;

function getDevInsecureAgent(): Agent | null {
  if (cachedInsecureAgent !== undefined) return cachedInsecureAgent;
  if (process.env.TUTLIO_DEV_API_LOCAL !== '1') {
    cachedInsecureAgent = null;
    return null;
  }
  cachedInsecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
  return cachedInsecureAgent;
}

export function supabaseServiceRoleClientOptions(): {
  auth: { autoRefreshToken: false; persistSession: false };
  global?: { fetch: typeof globalThis.fetch };
} {
  const auth = { autoRefreshToken: false, persistSession: false } as const;
  const agent = getDevInsecureAgent();
  if (!agent) return { auth };
  const fetchWithDispatcher: typeof globalThis.fetch = (input, init) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Record<string, unknown> | undefined),
      dispatcher: agent,
    } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
  return { auth, global: { fetch: fetchWithDispatcher } };
}
