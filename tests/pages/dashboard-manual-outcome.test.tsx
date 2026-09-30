import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../../src/pages/Dashboard';

const state = vi.hoisted(() => ({ sessions: [] as any[] }));

vi.mock('@/components/Layout', () => ({ default: ({ children }: any) => children }));
vi.mock('@/components/TutorOnboarding', () => ({ default: () => null }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({
  user: null, profile: { id: 'teacher', organization_id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17' },
}) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({
  hasFeature: () => false, organizationId: null, entityType: null, loading: true,
}) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: number) => String(value) }) }));
vi.mock('@/hooks/useDismissibleDashboardItemIds', () => ({ useDismissibleDashboardItemIds: () => ({
  dismissedIds: new Set(), dismiss: () => {}, restoreAll: () => {}, ready: true,
}) }));
vi.mock('@/lib/dataCache', () => ({
  getCached: (key: string) => key === 'tutor_dashboard'
    ? { sessions: state.sessions, studentCount: 3, tutorName: 'Teacher' } : null,
  setCache: () => {},
}));
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dateFnsLocale: undefined }),
  buildLocalizedPath: (path: string) => path,
}));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  state.sessions = [];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function lesson(id: string, status: string, confirmed = false) {
  return {
    id, student_id: id, start_time: '2026-09-30T10:00:00Z', end_time: '2026-09-30T11:00:00Z',
    status, status_confirmed_at: confirmed ? '2026-09-30T11:05:00Z' : null,
    paid: false, price: null, topic: null, student: { full_name: id },
  };
}
function dashboard() { return <MemoryRouter><Dashboard /></MemoryRouter>; }

describe('Laisvi vaikai teacher dashboard manual outcomes', () => {
  it('queues unstamped outcomes while organization features are still loading and preserves the raw outcome sent to the server', async () => {
    state.sessions = [lesson('Unstamped completed', 'completed'), lesson('Unstamped no-show', 'no_show'),
      lesson('Still active', 'active'), lesson('Confirmed completed', 'completed', true), lesson('Cancelled', 'cancelled')];
    render(dashboard());
    const queue = screen.getByText('dash.confirmStatusesTitle').closest('div')!.parentElement!;
    expect(within(queue).getByText('3')).toBeTruthy();
    expect(within(queue).queryByText('Confirmed completed')).toBeNull();
    expect(within(queue).queryByText('Cancelled')).toBeNull();
    fireEvent.click(within(queue).getAllByRole('button', { name: 'dash.statusHappened' })[0]);
    await waitFor(() => expect(within(queue).getByText('2')).toBeTruthy());
    const request = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/confirm-session-status')!;
    expect(JSON.parse(String(request[1]?.body))).toEqual({
      sessionId: 'Unstamped completed', status: 'completed', confirmExisting: true,
    });
    expect(state.sessions[0].status).toBe('completed');
  });

  it('shows an unstamped outcome as pending in the opened lesson and permits manual attestation after it ends', () => {
    vi.setSystemTime(new Date('2026-09-30T10:30:00Z'));
    state.sessions = [lesson('Legacy outcome', 'completed')];
    const page = render(dashboard());
    const upcoming = screen.getByText('Legacy outcome');
    expect(screen.queryByText('status.completed')).toBeNull();
    fireEvent.click(upcoming);
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    page.rerender(dashboard());
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('status.needsStatusConfirmation')).toBeTruthy();
    expect(dialog.queryByText('status.completed')).toBeNull();
    expect(dialog.getByRole('button', { name: 'cal.statusHappened' })).toBeTruthy();
  });
});
