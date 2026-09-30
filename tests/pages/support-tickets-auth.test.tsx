import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ locale: 'lt' }) }));

import SupportTickets from '@/pages/SupportTickets';

let authCallback: ((event: string, session: { access_token: string } | null) => void) | null = null;

function LoginDestination() {
  const location = useLocation();
  return <div>Login destination: {location.search}</div>;
}

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/support/tickets" element={<SupportTickets />} />
        <Route path="/student/support/tickets" element={<SupportTickets />} />
        <Route path="/parent/support/tickets" element={<SupportTickets />} />
        <Route path="/company/support/tickets" element={<SupportTickets />} />
        <Route path="/school/support/tickets" element={<SupportTickets />} />
        <Route path="/login" element={<LoginDestination />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authCallback = null;
  mocks.onAuthStateChange.mockImplementation((callback) => {
    authCallback = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('auth-only support ticket tracking', () => {
  it('preserves the ticket link when redirecting a signed-out reader to login', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    renderRoute('/student/support/tickets?ticket=17ee7859-5c8a-4fba-9dbd-9259ccad28f4');

    const destination = await screen.findByText(/Login destination:/);
    expect(destination.textContent).toContain('next=%2Fstudent%2Fsupport%2Ftickets%3Fticket%3D17ee7859');
  });

  it.each(['/support/tickets', '/student/support/tickets', '/parent/support/tickets', '/company/support/tickets', '/school/support/tickets'])('loads the authenticated tracking API from %s without a portal guard', async (path) => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ requests: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    renderRoute(`${path}?ticket=17ee7859-5c8a-4fba-9dbd-9259ccad28f4`);

    await screen.findByRole('heading', { name: 'Mano pagalbos užklausos' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/my-support-requests?ticket=17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
      expect.objectContaining({ headers: { Authorization: 'Bearer user-token' } }),
    ));
  });

  it('clears the previous account’s ticket list after a different account signs in', async () => {
    let token = 'first-token';
    mocks.getSession.mockImplementation(async () => ({ data: { session: { access_token: token } } }));
    const fetchMock = vi.fn().mockImplementation(async (_url: string, options: { headers: { Authorization: string } }) => ({
      ok: true,
      json: async () => ({ requests: [{
        id: options.headers.Authorization === 'Bearer first-token'
          ? '17ee7859-5c8a-4fba-9dbd-9259ccad28f4'
          : '27ee7859-5c8a-4fba-9dbd-9259ccad28f4',
        title: options.headers.Authorization === 'Bearer first-token' ? 'First user ticket' : 'Second user ticket',
        category: 'bug',
        status: 'registered',
        created_at: '2026-09-29T10:00:00.000Z',
        status_updated_at: '2026-09-29T10:00:00.000Z',
        target_date: null,
      }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    renderRoute('/support/tickets');
    await screen.findByText('First user ticket');

    token = 'second-token';
    await act(async () => authCallback?.('SIGNED_IN', { access_token: token }));

    await screen.findByText('Second user ticket');
    expect(screen.queryByText('First user ticket')).toBeNull();
  });
});
