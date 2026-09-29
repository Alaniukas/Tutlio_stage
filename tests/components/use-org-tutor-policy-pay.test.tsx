import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';

const state = vi.hoisted(() => ({
  sidebarResult: {
    data: null as { organization_id: string; company_commission_percent: number | null } | null,
    error: null as Error | null,
  },
}));

vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({ user: { id: 'tutor-1' }, profile: { id: 'tutor-1', organization_id: 'org-1' } }),
}));

vi.mock('@/lib/preload', () => ({
  tutorSidebarProfileDeduped: async () => state.sidebarResult,
  orgAdminRowByUserDeduped: async () => null,
  orgTutorPolicyRowDeduped: async () => ({ data: { features: {}, invoice_issuer_mode: 'both' }, error: null }),
}));

describe('organization tutor pay loading', () => {
  beforeEach(() => {
    state.sidebarResult = { data: null, error: null };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps pay unknown when the tutor profile read fails instead of showing €0', async () => {
    state.sidebarResult = { data: null, error: new Error('Network timeout') };
    const { result } = renderHook(() => useOrgTutorPolicy());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOrgTutor).toBe(true);
    expect(result.current.payPerLessonEur).toBeNull();
  });

  it('preserves an actual zero rate when the profile was read successfully', async () => {
    state.sidebarResult = {
      data: { organization_id: 'org-1', company_commission_percent: 0 },
      error: null,
    };
    const { result } = renderHook(() => useOrgTutorPolicy());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payPerLessonEur).toBe(0);
  });

  it('shows the configured positive rate after a successful profile read', async () => {
    state.sidebarResult = {
      data: { organization_id: 'org-1', company_commission_percent: 18.5 },
      error: null,
    };
    const { result } = renderHook(() => useOrgTutorPolicy());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payPerLessonEur).toBe(18.5);
  });
});
