import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), choices: [{ key: 'messages', enabled: false }, { key: 'lesson_updates', enabled: true }] }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'user' } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer synthetic-token' }) }));
import NotificationPreferencesSettings from '@/components/NotificationPreferencesSettings';
beforeEach(() => {
  state.rpc.mockReset().mockImplementation(async (_name, args) => {
    state.choices = state.choices.map(row => row.key === args.p_category ? { ...row, enabled: args.p_enabled } : row);
    return { data: args.p_enabled, error: null };
  });
  state.choices = [{ key: 'messages', enabled: false }, { key: 'lesson_updates', enabled: true }];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: state.choices }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('notification choice controls', () => {
  it('shows only the server-provided options and preserves a change after reload', async () => {
    const view = render(<NotificationPreferencesSettings portal="student" />);
    const messages = await screen.findByRole('checkbox', { name: /Naujos žinutės/ });
    expect((messages as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    fireEvent.click(messages);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('set_user_notification_preference', { p_category: 'messages', p_enabled: true }));
    await waitFor(() => expect((messages as HTMLInputElement).checked).toBe(true));
    view.unmount();
    render(<NotificationPreferencesSettings portal="student" />);
    expect((await screen.findByRole('checkbox', { name: /Naujos žinutės/ }) as HTMLInputElement).checked).toBe(true);
  });
  it('keeps the prior checkbox state after a failed save and allows retry', async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: new Error('save unavailable') });
    render(<NotificationPreferencesSettings portal="tutor" />);
    const messages = await screen.findByRole('checkbox', { name: /Naujos žinutės/ });
    fireEvent.click(messages);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((messages as HTMLInputElement).checked).toBe(false);
    fireEvent.click(messages);
    await waitFor(() => expect((messages as HTMLInputElement).checked).toBe(true));
  });
  it('offers a retry when loading fails and distinguishes admin personal preferences', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    render(<NotificationPreferencesSettings portal="org_admin" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByRole('checkbox', { name: /Naujos žinutės/ })).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/notification-preferences?portal=org_admin', expect.anything());
  });
});
