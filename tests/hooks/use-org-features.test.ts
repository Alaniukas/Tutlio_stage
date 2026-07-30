import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';

const tutorSidebarProfileDeduped = vi.fn();
const orgAdminRowByUserDeduped = vi.fn();
const orgSuspensionRowDeduped = vi.fn();
const dedupeAuthGetUser = vi.fn();

vi.mock('@/lib/preload', () => ({
  dedupeAuthGetUser: (...args: unknown[]) => dedupeAuthGetUser(...args),
  tutorSidebarProfileDeduped: (...args: unknown[]) => tutorSidebarProfileDeduped(...args),
  orgAdminRowByUserDeduped: (...args: unknown[]) => orgAdminRowByUserDeduped(...args),
  orgSuspensionRowDeduped: (...args: unknown[]) => orgSuspensionRowDeduped(...args),
}));

describe('useOrgFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dedupeAuthGetUser.mockResolvedValue({ id: 'user-1' });
    orgSuspensionRowDeduped.mockResolvedValue({
      data: { features: { org_admin_calendar_view: true } },
    });
  });

  it('resolves organizationId from tutor profile when present', async () => {
    tutorSidebarProfileDeduped.mockResolvedValue({ data: { organization_id: 'org-from-profile' } });
    orgAdminRowByUserDeduped.mockResolvedValue(null);

    const { result } = renderHook(() => useOrgFeatures());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationId).toBe('org-from-profile');
    expect(orgAdminRowByUserDeduped).not.toHaveBeenCalled();
  });

  it('falls back to organization_admins when profile has no organization_id', async () => {
    tutorSidebarProfileDeduped.mockResolvedValue({ data: { organization_id: null } });
    orgAdminRowByUserDeduped.mockResolvedValue({ organization_id: 'org-from-admin' });

    const { result } = renderHook(() => useOrgFeatures());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationId).toBe('org-from-admin');
    expect(orgAdminRowByUserDeduped).toHaveBeenCalledWith('user-1');
  });
});
