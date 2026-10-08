import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: { access_token: 'source-access' },
  setSession: vi.fn(), clearState: vi.fn(), reload: vi.fn(), fetch: vi.fn(),
}));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'tutor-1' }, profile: { organization_id: 'org-1' } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: state.session } }),
  setSession: (session: any) => state.setSession(session),
} } }));
vi.mock('@/lib/tutorEnvironmentSession', () => ({ clearTutorEnvironmentState: () => state.clearState(), reloadTutorEnvironment: () => state.reload() }));
import { useTutorEnvironments } from '../../src/hooks/useTutorEnvironments';

const environments = [
  { tutorId: 'tutor-1', organizationId: 'org-1', organizationName: 'Company A', email: 'first@example.com' },
  { tutorId: 'tutor-2', organizationId: 'org-2', organizationName: 'Company B', email: 'second@example.com' },
];
beforeEach(() => {
  state.setSession.mockReset(); state.clearState.mockReset(); state.reload.mockReset(); state.fetch.mockReset();
  state.setSession.mockResolvedValue({ data: { user: { id: 'tutor-2' } }, error: null });
  state.fetch.mockResolvedValue({ ok: true, json: async () => ({ environments }) });
  vi.stubGlobal('fetch', state.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('tutor environment session switching', () => {
  it('clears the previous tenant state before installing the selected session and reloading', async () => {
    const { result } = renderHook(useTutorEnvironments);
    await waitFor(() => expect(result.current.loading).toBe(false));
    state.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ tutorId: 'tutor-2', session: { access_token: 'target-access', refresh_token: 'target-refresh' } }) });
    await act(async () => { await result.current.switchEnvironment('tutor-2'); });
    expect(state.fetch).toHaveBeenLastCalledWith('/api/tutor-environments', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'switch', tutorId: 'tutor-2' }),
      headers: { Authorization: 'Bearer source-access', 'Content-Type': 'application/json' },
    }));
    expect(state.setSession).toHaveBeenCalledWith({ access_token: 'target-access', refresh_token: 'target-refresh' });
    expect(state.clearState.mock.invocationCallOrder[0]).toBeLessThan(state.setSession.mock.invocationCallOrder[0]);
    expect(state.reload.mock.invocationCallOrder[0]).toBeGreaterThan(state.setSession.mock.invocationCallOrder[0]);
    expect(result.current.switching).toBe(true);
  });

  it('keeps the original session usable if switching is rejected', async () => {
    const { result } = renderHook(useTutorEnvironments);
    await waitFor(() => expect(result.current.loading).toBe(false));
    state.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'notLinked' }) });
    await act(async () => { await result.current.switchEnvironment('tutor-2'); });
    expect(state.setSession).not.toHaveBeenCalled();
    expect(state.clearState).not.toHaveBeenCalled();
    expect(result.current.error).toBe('notLinked');
    expect(result.current.busy).toBe(false);
    expect(result.current.switching).toBe(false);
  });

  it('ignores an already-selected account and rejects a handoff for a different tutor', async () => {
    const { result } = renderHook(useTutorEnvironments);
    await waitFor(() => expect(result.current.loading).toBe(false));
    state.fetch.mockClear();
    await act(async () => { await result.current.switchEnvironment('tutor-1'); });
    expect(state.fetch).not.toHaveBeenCalled();
    state.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ tutorId: 'tutor-3', session: { access_token: 'unexpected', refresh_token: 'unexpected' } }) });
    await act(async () => { await result.current.switchEnvironment('tutor-2'); });
    expect(state.setSession).not.toHaveBeenCalled();
    expect(result.current.error).toBe('failed');
  });
});
