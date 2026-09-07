import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/gosignConfig', () => ({
  getGoSignConfig: () => ({
    clientId: 'client-1',
    privateKeyPem: 'PEM',
    onesignEndpoint: 'https://rc.test/onesign',
    soapAction: '',
    locale: 'lt',
    signaturePosition: undefined,
    responsePublicKeyPem: '',
  }),
  isGoSignConfigured: () => true,
  goSignNotConfiguredMessage: () => 'not configured',
}));

vi.mock('../../api/_lib/gosign', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/_lib/gosign')>();
  return {
    ...actual,
    buildInitOneSignEnvelope: vi.fn(() => '<init/>'),
    buildTransactionEnvelope: vi.fn(() => '<txn/>'),
    parseInitOneSignResponse: vi.fn(() => ({ transactionId: 'T1', signingUrl: 'https://sign.test/t1' })),
    parseSigningResultResponse: vi.fn(() => ({ status: 'InProgress' })),
  };
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initOneSign,
  INIT_SIGNING_TIMEOUT_MS,
  RETRY_WINDOW_MS,
  isTransientGoSignFailure,
} from '../../api/_lib/gosignClient';
import { GoSignError, parseInitOneSignResponse } from '../../api/_lib/gosign';

const INIT_INPUT = { responseUrl: 'https://app.test/r', signingType: 'Signature', file: {} } as any;

function abortingFetch() {
  return vi.fn((_url: any, opts: any) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
      );
    }),
  );
}

describe('gosignClient transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('InitSigning waits 60s (not the old 30s) before timing out, and never retries a timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = abortingFetch();
    vi.stubGlobal('fetch', fetchMock);

    let settled = false;
    const promise = initOneSign(INIT_INPUT).catch((e) => {
      settled = true;
      return e;
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(INIT_SIGNING_TIMEOUT_MS - 30_000);
    const err = await promise;
    expect(settled).toBe(true);
    expect(err).toBeInstanceOf(GoSignError);
    expect(err.message).toContain('timed out');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once after a fast transport failure and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '<resp/>' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await initOneSign(INIT_INPUT);
    expect(result).toEqual({ transactionId: 'T1', signingUrl: 'https://sign.test/t1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries an empty-bodied gateway error only once, then surfaces it', async () => {
    const gatewayResp = { ok: false, status: 502, text: async () => '' };
    const fetchMock = vi.fn().mockResolvedValue(gatewayResp);
    vi.stubGlobal('fetch', fetchMock);

    await expect(initOneSign(INIT_INPUT)).rejects.toThrow('GoSign HTTP 502 with empty body');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a SOAP fault (HTTP 500 with body) — the parser gets the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '<fault/>' });
    vi.stubGlobal('fetch', fetchMock);

    await initOneSign(INIT_INPUT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(parseInitOneSignResponse)).toHaveBeenCalledWith('<fault/>', '');
  });

  it('classifies failures for retry correctly', () => {
    expect(isTransientGoSignFailure(new GoSignError('GoSign request failed: timed out'))).toBe(false);
    expect(isTransientGoSignFailure(new GoSignError('GoSign request failed: fetch failed'))).toBe(true);
    expect(isTransientGoSignFailure(new GoSignError('GoSign HTTP 502 with empty body'))).toBe(true);
    expect(isTransientGoSignFailure(new GoSignError('Response signature invalid'))).toBe(false);
    expect(isTransientGoSignFailure(new Error('random'))).toBe(false);
  });

  it('vercel.json maxDuration budgets cover the retry-window + init-timeout invariant', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      functions: Record<string, { maxDuration?: number }>;
    };
    // A failed-fast first attempt (< RETRY_WINDOW_MS) plus a full retry must fit
    // inside the function wall-clock, with headroom for PDF download + DB writes.
    const requiredSeconds = (RETRY_WINDOW_MS + INIT_SIGNING_TIMEOUT_MS) / 1000 + 10;
    for (const endpoint of ['api/school-contract-sign-init.ts', 'api/school-contract-parent-sign-init.ts']) {
      const maxDuration = config.functions[endpoint]?.maxDuration ?? 0;
      expect(maxDuration, `${endpoint} maxDuration`).toBeGreaterThanOrEqual(requiredSeconds);
    }
    expect(config.functions['api/school-contract-sign-callback.ts']?.maxDuration ?? 0).toBeGreaterThanOrEqual(90);
    expect(config.functions['api/school-contract-parent-upload.ts']?.maxDuration ?? 0).toBeGreaterThanOrEqual(60);
  });
});
