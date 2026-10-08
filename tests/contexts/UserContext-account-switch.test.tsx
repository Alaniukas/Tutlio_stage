import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authCallback: null as any,
  profileReads: [] as string[],
  profilePromises: {} as Record<string, Promise<any>>,
  reload: vi.fn(),
}));
const userA = { id: 'tutor-a', email: 'first@example.com' };
const userB = { id: 'tutor-b', email: 'second@example.com' };
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { onAuthStateChange: (callback: any) => { state.authCallback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
  from: () => {
    let userId = '';
    const query: any = {
      select: () => query,
      eq: (_key: string, value: string) => { userId = value; return query; },
      maybeSingle: () => { state.profileReads.push(userId); return state.profilePromises[userId] || Promise.resolve({ data: { id: userId, full_name: userId, organization_id: `org-${userId}` }, error: null }); },
    };
    return query;
  },
} }));
vi.mock('@/lib/preload', () => ({ dedupeAuthGetUser: async () => ({ id: 'tutor-a', email: 'first@example.com' }) }));
vi.mock('@/lib/authSession', () => ({ rememberAuthUser: vi.fn() }));
vi.mock('@/lib/tutorEnvironmentSession', () => ({ reloadAccountEnvironment: (path?: string) => state.reload(path) }));
vi.mock('@/components/ProfileLocaleSync', () => ({ default: () => null }));
vi.mock('@/contexts/OrgBrandingContext', () => ({ clearOrgBrandingCache: vi.fn() }));
vi.mock('@/contexts/StudentPolicyContext', () => ({ clearStudentPolicyCache: vi.fn() }));

import { UserProvider, useUser } from '../../src/contexts/UserContext';
function AccountContent() {
  const { user, profile } = useUser();
  return <div data-testid="account">{user?.id}:{profile?.id}</div>;
}
beforeEach(() => {
  state.authCallback = null; state.profileReads = []; state.profilePromises = {}; state.reload.mockClear();
});
afterEach(cleanup);

describe('UserProvider session identity changes', () => {
  it('reloads and unmounts old company forms when another tab changes the logged-in tutor', async () => {
    render(<UserProvider accountChangePath="/dashboard"><AccountContent /></UserProvider>);
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('tutor-a:tutor-a'));
    await act(async () => { await state.authCallback('SIGNED_IN', { user: userB }); });
    expect(state.reload).toHaveBeenCalledOnce();
    expect(state.reload).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByTestId('account')).toBeNull();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('does not reload on token refresh or repeat sign-in of the same tutor', async () => {
    render(<UserProvider><AccountContent /></UserProvider>);
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('tutor-a:tutor-a'));
    await act(async () => { await state.authCallback('TOKEN_REFRESHED', { user: userA }); });
    await act(async () => { await state.authCallback('SIGNED_IN', { user: userA }); });
    expect(state.reload).not.toHaveBeenCalled();
    expect(screen.getByTestId('account').textContent).toBe('tutor-a:tutor-a');
  });

  it('lets other portals reload their current route when the account changes', async () => {
    render(<UserProvider><AccountContent /></UserProvider>);
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('tutor-a:tutor-a'));
    await act(async () => { await state.authCallback('SIGNED_IN', { user: userB }); });
    expect(state.reload).toHaveBeenCalledWith(undefined);
    expect(screen.queryByTestId('account')).toBeNull();
  });

  it('drops a delayed profile response from the old account after switching', async () => {
    let resolveProfile: (value: any) => void;
    state.profilePromises['tutor-a'] = new Promise((resolve) => { resolveProfile = resolve; });
    render(<UserProvider><AccountContent /></UserProvider>);
    await waitFor(() => expect(screen.getByTestId('account').textContent).toBe('tutor-a:'));
    await act(async () => { await state.authCallback('SIGNED_IN', { user: userB }); });
    await act(async () => { resolveProfile!({ data: { id: 'tutor-a', full_name: 'Old account', organization_id: 'org-a' }, error: null }); });
    expect(state.reload).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('account')).toBeNull();
  });
});
