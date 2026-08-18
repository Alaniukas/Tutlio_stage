import { afterEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

import handler, { parseLandingLeadPayload } from '../../api/landing-lead';

describe('landing lead quiz payload', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    createClientMock.mockReset();
  });

  it('normalizes a consented quiz lead with answers and attribution', () => {
    const result = parseLandingLeadPayload({
      email: ' Buyer@Example.com ',
      source: 'quiz_school',
      audience: 'school',
      locale: 'lt',
      consent: true,
      quiz_answers: {
        volume: '50to150',
        friction: ['contracts', 'installments', 'contracts', 42],
        ignored: 42,
      },
      utm_source: 'meta',
      utm_campaign: 'school-admins',
    });

    expect(result.error).toBeUndefined();
    expect(result.payload).toMatchObject({
      email: 'buyer@example.com',
      source: 'quiz_school',
      audience: 'school',
      locale: 'lt',
      quiz_answers: { volume: '50to150', friction: ['contracts', 'installments'] },
      utm_source: 'meta',
      utm_campaign: 'school-admins',
    });
    expect(result.payload?.consent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('requires explicit consent and a matching audience for quiz sources', () => {
    expect(parseLandingLeadPayload({
      email: 'buyer@example.com',
      source: 'quiz_solo',
      audience: 'solo',
    }).error).toBe('Invalid quiz lead');

    expect(parseLandingLeadPayload({
      email: 'buyer@example.com',
      source: 'quiz_company',
      audience: 'school',
      consent: true,
    }).error).toBe('Invalid quiz lead');
  });

  it('keeps the existing non-quiz lead contract backward compatible', () => {
    expect(parseLandingLeadPayload({ email: 'buyer@example.com' }).payload).toMatchObject({
      email: 'buyer@example.com',
      source: 'landing_integrations',
      audience: null,
      quiz_answers: null,
      consent_at: null,
    });
  });

  it('accepts a valid lead for retry instead of returning a blocking server error', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');
    createClientMock.mockImplementation(() => {
      throw new Error('temporary database outage');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = {
      setHeader: vi.fn(),
      status: vi.fn(),
      json: vi.fn(),
    };
    response.status.mockReturnValue(response);

    await handler({
      method: 'POST',
      body: {
        email: 'buyer@example.com',
        source: 'quiz_company',
        audience: 'company',
        locale: 'en',
        consent: true,
      },
    } as never, response as never);

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith({ success: false, retry: true });
  });
});
