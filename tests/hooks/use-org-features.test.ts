import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOrgFeature, useOrgFeatures } from '@/hooks/useOrgFeatures';

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

  it('requires Laisvi vaikai teacher confirmation without changing stored features', async () => {
    const organizationId = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
    tutorSidebarProfileDeduped.mockResolvedValue({ data: { organization_id: organizationId } });
    orgSuspensionRowDeduped.mockResolvedValue({ data: { entity_type: 'school', features: {} } });
    const { result } = renderHook(() => useOrgFeatures());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasFeature('tutor_lesson_status_confirmation')).toBe(true);

    const { result: singleFeature } = renderHook(() => useOrgFeature(organizationId, 'tutor_lesson_status_confirmation'));
    await waitFor(() => expect(singleFeature.current.loading).toBe(false));
    expect(singleFeature.current.enabled).toBe(true);
  });

  it('reports a failed organization lookup separately from a disabled feature', async () => {
    tutorSidebarProfileDeduped.mockResolvedValue({ data: { organization_id: 'org-1' } });
    orgSuspensionRowDeduped.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    const { result } = renderHook(() => useOrgFeatures());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.hasFeature('school_class_groups')).toBe(false);
  });
});
