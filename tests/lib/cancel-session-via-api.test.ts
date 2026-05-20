import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cancelSessionViaApi } from '@/lib/lesson-actions';

vi.mock('@/lib/apiHelpers', () => ({
  authHeaders: vi.fn(async () => ({ Authorization: 'Bearer test-token' })),
}));

describe('cancelSessionViaApi', () => {
  const baseParams = {
    sessionId: 'sess-1',
    tutorId: 'tutor-1',
    reason: 'Student sick',
    cancelledBy: 'tutor' as const,
    studentName: 'Anna',
    tutorName: 'Tutor',
    studentEmail: 'anna@example.com',
    tutorEmail: 'tutor@example.com',
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns success when API responds with success', async () => {
    const result = await cancelSessionViaApi(baseParams);
    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith(
      '/api/cancel-session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(baseParams),
      })
    );
  });

  it('returns error when API responds with failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to cancel session' }),
      }))
    );

    const result = await cancelSessionViaApi(baseParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to cancel session');
  });

  it('returns error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Network down');
    }));

    const result = await cancelSessionViaApi(baseParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network down');
  });
});
