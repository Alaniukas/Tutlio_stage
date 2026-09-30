import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), retryPending: vi.fn(), applyRelease: vi.fn() }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({ getSupportServiceClient: mocks.getClient }));
vi.mock('../../api/_lib/inAppSupportRelease.js', () => ({
  retryPendingInAppSupportReleases: mocks.retryPending,
  applyInAppSupportRelease: mocks.applyRelease,
}));

import handler from '../../api/retry-support-releases';

const cronSecret = 'support-release-cron-secret';
const client = { marker: 'service-client' };

function response() {
  let code = 200;
  let body: any = null;
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((value: number) => { code = value; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
  };
  return { res, result: () => ({ code, body }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', cronSecret);
  vi.stubEnv('SUPPORT_RELEASE_WEBHOOK_SECRET', 'release-feature-enabled');
  vi.stubEnv('VERCEL_ENV', 'production');
  mocks.getClient.mockReturnValue(client);
  mocks.retryPending.mockResolvedValue({ completed: 2, skipped: 0, pending: 0 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('pending support release delivery recovery', () => {
  it.each(['POST', 'HEAD', 'DELETE'])('requires GET for %s even with a valid cron credential', async (method) => {
    const result = response();
    await handler({ method, headers: { authorization: `Bearer ${cronSecret}` } } as any, result.res);
    expect(result.result().code).toBe(405);
    expect(result.res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it.each([
    { authorization: undefined }, { authorization: ['invalid'] },
    { authorization: 'Bearer wrong' }, { authorization: `Basic ${cronSecret}` },
  ])('rejects invalid cron authorization $authorization', async ({ authorization }) => {
    const result = response();
    await handler({ method: 'GET', headers: { authorization } } as any, result.res);
    expect(result.result()).toEqual({ code: 401, body: { error: 'Unauthorized' } });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.retryPending).not.toHaveBeenCalled();
  });

  it.each(['', 'production', 'preview'])('fails closed without CRON_SECRET in environment %s', async (vercelEnvironment) => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('VERCEL_ENV', vercelEnvironment);
    const result = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer ' } } as any, result.res);
    expect(result.result().code).toBe(401);
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.retryPending).not.toHaveBeenCalled();
  });

  it('authenticates but does not open the ledger while release completion is disabled', async () => {
    vi.stubEnv('SUPPORT_RELEASE_WEBHOOK_SECRET', ' ');
    const result = response();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${cronSecret}` } } as any, result.res);
    expect(result.result()).toEqual({ code: 200, body: { ok: true, ignored: 'release_completion_disabled' } });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.retryPending).not.toHaveBeenCalled();
  });

  it('resumes persisted pending claims without accepting new release or ticket IDs', async () => {
    const result = response();
    const started = Date.now();
    await handler({
      method: 'GET', headers: { authorization: `Bearer ${cronSecret}` },
      query: { ticketIds: 'untrusted-ticket', releaseId: 'untrusted-release' },
    } as any, result.res);
    expect(result.result()).toEqual({ code: 200, body: { ok: true, completed: 2, skipped: 0, pending: 0 } });
    expect(mocks.retryPending).toHaveBeenCalledTimes(1);
    expect(mocks.retryPending).toHaveBeenCalledWith(client, { deadlineAt: expect.any(Number), limit: 20 });
    expect(mocks.retryPending.mock.calls[0][1].deadlineAt).toBeGreaterThanOrEqual(started + 22_000);
    expect(mocks.applyRelease).not.toHaveBeenCalled();
  });

  it('returns a retryable failure while persisted deliveries remain pending', async () => {
    mocks.retryPending.mockResolvedValue({ completed: 1, skipped: 0, pending: 1 });
    const result = response();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${cronSecret}` } } as any, result.res);
    expect(result.result()).toEqual({ code: 503, body: { ok: false, completed: 1, skipped: 0, pending: 1 } });
    expect(mocks.applyRelease).not.toHaveBeenCalled();
  });

  it('returns a safe retryable error if recovery or the service client fails', async () => {
    mocks.retryPending.mockRejectedValueOnce(new Error(`Private provider error ${cronSecret}`));
    const recoveryFailure = response();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${cronSecret}` } } as any, recoveryFailure.res);
    expect(recoveryFailure.result()).toEqual({ code: 503, body: { error: 'Could not retry support release delivery' } });
    expect(JSON.stringify(recoveryFailure.result())).not.toContain(cronSecret);

    mocks.getClient.mockImplementationOnce(() => { throw new Error(`Private credentials ${cronSecret}`); });
    const clientFailure = response();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${cronSecret}` } } as any, clientFailure.res);
    expect(clientFailure.result().code).toBe(503);
    expect(JSON.stringify(clientFailure.result())).not.toContain(cronSecret);
    expect(console.error).toHaveBeenCalledWith('[retry-support-releases] Pending release delivery failed.');
  });
});
