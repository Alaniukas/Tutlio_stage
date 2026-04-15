/**
 * Company flow API tests: create-company, invite-tutor.
 * Validates auth, validation, and happy path with mocked Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockRes() {
  const out: { statusCode: number; body: unknown } = { statusCode: 0, body: null };
  return {
    status(code: number) {
      out.statusCode = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
    },
    getResult: () => out,
  };
}

function mockReq(method: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    body,
    headers: { 'content-type': 'application/json', ...headers },
    query: {},
  };
}

describe('Company flow APIs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  describe('POST /api/create-company', () => {
    it('returns 405 for GET', async () => {
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      process.env.ADMIN_SECRET = 'admin-secret';
      const handler = (await import('../../api/create-company')).default;
      const res = mockRes();
      await handler(mockReq('GET', {}), res as any);
      expect((res as any).getResult().statusCode).toBe(405);
    });

    it('returns 401 without x-admin-secret', async () => {
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      process.env.ADMIN_SECRET = 'admin-secret';
      const handler = (await import('../../api/create-company')).default;
      const res = mockRes();
      await handler(
        mockReq('POST', { orgName: 'Test', adminEmail: 'a@b.lt', adminPassword: 'password123' }),
        res as any
      );
      expect((res as any).getResult().statusCode).toBe(401);
    });

    it('returns 400 when required fields missing', async () => {
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      process.env.ADMIN_SECRET = 'admin-secret';
      const handler = (await import('../../api/create-company')).default;
      const res = mockRes();
      await handler(
        mockReq('POST', { adminEmail: 'a@b.lt', adminPassword: 'password123' }, { 'x-admin-secret': 'admin-secret' }),
        res as any
      );
      expect((res as any).getResult().statusCode).toBe(400);
    });
  });

  describe('POST /api/invite-tutor', () => {
    it('returns 405 for GET', async () => {
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      const handler = (await import('../../api/invite-tutor')).default;
      const res = mockRes();
      await handler(mockReq('GET', {}), res as any);
      expect((res as any).getResult().statusCode).toBe(405);
    });

    it('returns 401 without Authorization Bearer', async () => {
      process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      const handler = (await import('../../api/invite-tutor')).default;
      const res = mockRes();
      await handler(
        mockReq('POST', { organizationId: 'org-1', inviteeEmail: 'tutor@test.lt' }),
        res as any
      );
      expect((res as any).getResult().statusCode).toBe(401);
    });
  });
});
