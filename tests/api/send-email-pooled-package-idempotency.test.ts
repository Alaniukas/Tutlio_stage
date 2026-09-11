import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, pushMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  pushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: pushMock }));

import handler from '../../api/send-email';
import { pooledPackageEmailIdempotencyKey } from '../../api/_lib/sendPendingPackageEmail';

function response() {
  const result = { statusCode: 0, body: null as any };
  const res = {
    status: vi.fn((code: number) => { result.statusCode = code; return res; }),
    json: vi.fn((body: any) => { result.body = body; return res; }),
    setHeader: vi.fn(),
  };
  return { res, result };
}

function packageBody(packageId = 'package-1') {
  return {
    type: 'prepaid_package_request',
    to: 'payer@example.test',
    idempotencyKey: pooledPackageEmailIdempotencyKey(packageId),
    data: {
      packageId,
      pooledPackage: true,
      recipientName: 'Parent',
      studentName: 'Student',
      tutorName: 'Pro Klasė',
      subjectName: 'Maths',
      totalLessons: 9,
      pricePerLesson: '27.00',
      totalPrice: '243.00',
      paymentLink: 'https://tutlio.lt/api/pay-package?package=package-1',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key-test');
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('pooled package delivery idempotency', () => {
  it('passes the exact server-owned package key to Resend', async () => {
    const { res, result } = response();
    await handler({ method: 'POST', body: packageBody(), headers: { 'x-internal-key': 'service-key-test' }, query: {} } as any, res as any);
    expect(result.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: 'pooled-package/package-1/offer',
    });
  });

  it('rejects forged or externally supplied idempotency keys', async () => {
    const forged = packageBody();
    forged.idempotencyKey = 'pooled-package/another-package/offer';
    const first = response();
    await handler({ method: 'POST', body: forged, headers: { 'x-internal-key': 'service-key-test' }, query: {} } as any, first.res as any);
    expect(first.result.statusCode).toBe(403);

    const second = response();
    await handler({ method: 'POST', body: packageBody(), headers: {}, query: {} } as any, second.res as any);
    expect(second.result.statusCode).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
