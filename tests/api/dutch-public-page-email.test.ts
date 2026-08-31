import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { from, send, insert } = vi.hoisted(() => ({ from: vi.fn(), send: vi.fn(), insert: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from }) }));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
vi.mock('../../api/_lib/resendConfig', () => ({ getFromEmail: () => 'test@example.com', getResendApiKey: () => 'test-only' }));
import handler from '../../api/public-page-lead';

let ownerLocale: string | null;
let pageLocale: string;
let count: number;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  ownerLocale = 'nl'; pageLocale = 'en'; count = 0;
  insert.mockResolvedValue({ error: null });
  // No connection is made: every database operation and email is mocked.
  from.mockImplementation((table: string) => {
    const result = table === 'public_pages'
      ? { data: { id: 'page-1', slug: 'sanne-test', user_id: 'tutor-1', booking_enabled: true,
        locale: pageLocale, timezone: 'Europe/Amsterdam' } }
      : table === 'profiles' ? { data: { email: 'tutor@example.com', preferred_locale: ownerLocale } }
      : { count };
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(result), insert,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  });
});
afterEach(() => vi.unstubAllEnvs());

async function submit(requestedStart: string) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: 'POST', body: {
    slug: 'sanne-test', name: 'Noor', email: 'noor@example.com', phone: '+31 6 12345678',
    message: '<img src=x onerror=alert(1)>', offeringTitle: 'Wiskunde', requestedStart,
  } } as never, response as never);
  return response;
}

describe('Dutch public enquiry notifications', () => {
  it.each(['2026-01-01T23:30:00Z', '2026-07-01T22:30:00Z'])('renders Dutch and the page timezone for %s', async start => {
    const response = await submit(start);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ requested_start: start.replace('Z', '.000Z') }));
    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0][0];
    expect(email.subject).toBe('Nieuwe aanvraag: Noor');
    expect(email.html).toContain('Nieuwe aanvraag via je pagina');
    expect(email.html).toContain('Gewenst tijdstip');
    expect(email.html).toContain('00:30:00 (Europe/Amsterdam)');
    expect(email.html).toContain('E-mailadres');
    expect(email.html).toContain('&lt;img');
    expect(email.html).not.toMatch(/New enquiry|El\. paštas|<img/);
    expect(email.to).toBe('tutor@example.com');
    expect(email.replyTo).toBe('noor@example.com');
  });

  it('uses Dutch page locale when the owner has no language preference', async () => {
    ownerLocale = null; pageLocale = 'nl';
    await submit('2026-10-01T12:00:00Z');
    expect(send.mock.calls[0][0].subject).toBe('Nieuwe aanvraag: Noor');
  });

  it('preserves an explicit English owner preference', async () => {
    ownerLocale = 'en'; pageLocale = 'nl';
    await submit('2026-10-01T12:00:00Z');
    expect(send.mock.calls[0][0].subject).toBe('New enquiry: Noor');
  });

  it('does not save or notify when the existing rate limit is reached', async () => {
    count = 3;
    const response = await submit('2026-10-01T12:00:00Z');
    expect(response.status).toHaveBeenCalledWith(429);
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
