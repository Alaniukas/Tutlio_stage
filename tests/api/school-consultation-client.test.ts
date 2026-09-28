// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { userConsultationSupabase } from '../../api/_lib/schoolConsultationsAccess';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('executes the final notes query with the verified session JWT and public key rather than service-role authorization', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://consultation-client-test.invalid');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-test'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unused-service-test');
  const transport = vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', transport);
  const db = userConsultationSupabase({ headers: { authorization: 'Bearer verified-session-jwt' } } as any);
  await db.from('school_consultation_notes').select('id');
  const headers = new Headers(transport.mock.calls[0][1]?.headers);
  expect(headers.get('authorization')).toBe('Bearer verified-session-jwt'); expect(headers.get('apikey')).toBe('public-anon-test');
  expect(JSON.stringify(transport.mock.calls)).not.toContain('unused-service-test');
});

it('never creates a notes client for an internal service credential without a user session', () => {
  expect(() => userConsultationSupabase({ headers: { 'x-internal-key': 'internal-service-test' } } as any)).toThrow('Consultation session unavailable');
});
