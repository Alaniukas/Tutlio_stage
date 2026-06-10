import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireCronAuth, isCronAuthorized } from '../../api/_lib/cronAuth';

const SECRET = 'test-cron-secret';

const prevCronSecret = process.env.CRON_SECRET;
const prevVercelEnv = process.env.VERCEL_ENV;

beforeEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  if (prevCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevCronSecret;
  if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = prevVercelEnv;
});

function mockReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
    },
  };
  return res as any;
}

describe('requireCronAuth', () => {
  it('authorizes a request with the correct Bearer secret', () => {
    process.env.CRON_SECRET = SECRET;
    const res = mockRes();
    expect(requireCronAuth(mockReq({ authorization: `Bearer ${SECRET}` }), res)).toBe(true);
    expect(res.statusCode).toBe(0);
  });

  it('rejects a wrong secret with 401', () => {
    process.env.CRON_SECRET = SECRET;
    const res = mockRes();
    expect(requireCronAuth(mockReq({ authorization: 'Bearer wrong-secret!' }), res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a missing Authorization header with 401', () => {
    process.env.CRON_SECRET = SECRET;
    const res = mockRes();
    expect(requireCronAuth(mockReq(), res)).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('fails CLOSED (500) when CRON_SECRET is unset on a deployed environment', () => {
    process.env.VERCEL_ENV = 'production';
    const res = mockRes();
    expect(requireCronAuth(mockReq({ authorization: 'Bearer anything' }), res)).toBe(false);
    expect(res.statusCode).toBe(500);
  });

  it('fails CLOSED on preview deployments too', () => {
    process.env.VERCEL_ENV = 'preview';
    const res = mockRes();
    expect(requireCronAuth(mockReq(), res)).toBe(false);
    expect(res.statusCode).toBe(500);
  });

  it('allows local development without CRON_SECRET (no VERCEL_ENV)', () => {
    const res = mockRes();
    expect(requireCronAuth(mockReq(), res)).toBe(true);
    expect(res.statusCode).toBe(0);
  });
});

describe('isCronAuthorized', () => {
  it('never authorizes when CRON_SECRET is unset', () => {
    expect(isCronAuthorized(mockReq({ authorization: 'Bearer ' }))).toBe(false);
    expect(isCronAuthorized(mockReq())).toBe(false);
  });

  it('authorizes only the exact Bearer secret', () => {
    process.env.CRON_SECRET = SECRET;
    expect(isCronAuthorized(mockReq({ authorization: `Bearer ${SECRET}` }))).toBe(true);
    expect(isCronAuthorized(mockReq({ authorization: `Bearer ${SECRET}x` }))).toBe(false);
    expect(isCronAuthorized(mockReq({ authorization: SECRET }))).toBe(false);
  });
});
