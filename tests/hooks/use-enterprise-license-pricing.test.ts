import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEnterpriseLicensePricing } from '@/hooks/useEnterpriseLicensePricing';

describe('useEnterpriseLicensePricing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps canonical pricing available when the pricing request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { result } = renderHook(() => useEnterpriseLicensePricing());

    expect(result.current.pricing).toMatchObject({
      currency: 'eur',
      minLicenses: 1,
      maxSelfServe: 60,
    });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.pricing?.tiers).toHaveLength(6);
  });
});
