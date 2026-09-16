import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest } from '../../api/types';
import {
  isLocalInAppSupportPreview,
  LOCAL_IN_APP_SUPPORT_PREVIEW_USER_ID,
} from '../../api/_lib/inAppSupportPreview';

function request(header = '1'): VercelRequest {
  return { headers: { 'x-in-app-support-preview': header } } as unknown as VercelRequest;
}

afterEach(() => vi.unstubAllEnvs());

describe('local in-app support preview authorization', () => {
  it('allows the explicit preview header only during local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    expect(isLocalInAppSupportPreview(request())).toBe(true);
    expect(LOCAL_IN_APP_SUPPORT_PREVIEW_USER_ID).toBe('local-support-agent-preview');
  });

  it('never bypasses authentication in production or Vercel preview deployments', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isLocalInAppSupportPreview(request())).toBe(false);

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isLocalInAppSupportPreview(request())).toBe(false);
  });

  it('requires the exact preview header', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');
    expect(isLocalInAppSupportPreview(request('0'))).toBe(false);
    expect(isLocalInAppSupportPreview({ headers: {} } as unknown as VercelRequest)).toBe(false);
  });
});
