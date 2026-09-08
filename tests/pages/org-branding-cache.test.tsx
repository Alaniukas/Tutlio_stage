import React from 'react';
import { cleanup, render, waitFor, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: 'user-a' }));
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../../src/lib/preload', () => ({
  dedupeAuthGetUser: async () => ({ id: state.user }),
  tutorSidebarProfileDeduped: async () => ({ data: { organization_id: 'org' } }),
}));
import { OrgBrandingProvider, useOrgBrandingContext } from '../../src/contexts/OrgBrandingContext';
const fetchMock = vi.fn();
function Consumer() { const branding = useOrgBrandingContext(); return <span>{branding.enabled ? branding.name : 'default'}</span>; }
function mount() { return render(<OrgBrandingProvider scope="tutor"><Consumer /></OrgBrandingProvider>); }
beforeEach(() => {
  sessionStorage.clear(); state.user = 'user-a'; fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('organization branding cache', () => {
  it('caches disabled branding across mounts, then refreshes after five minutes', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const first = mount();
    await waitFor(() => expect(sessionStorage.getItem('tutlio_org_branding')).toContain('expiresAt'));
    first.unmount();
    const second = mount();
    await waitFor(() => expect(screen.getByText('default')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    second.unmount();
    now += 300001;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ name: 'New branding' }) });
    mount();
    await waitFor(() => expect(screen.getByText('New branding')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not reuse the disabled cache for another account', async () => {
    const first = mount();
    await waitFor(() => expect(sessionStorage.getItem('tutlio_org_branding')).toContain('user-a'));
    first.unmount(); state.user = 'user-b';
    mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
  it('does not cache transient failures', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const first = mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount(); mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sessionStorage.getItem('tutlio_org_branding')).toBeNull();
  });
});
