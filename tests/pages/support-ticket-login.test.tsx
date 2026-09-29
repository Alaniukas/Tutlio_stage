import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  resolveAccountPortals: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword } },
  setRememberMe: vi.fn(),
}));
vi.mock('@/lib/account-portal', () => ({
  canAccessLoginPortal: vi.fn(),
  getHomePathForPortals: vi.fn(),
  loginErrorKeyForPortalMismatch: vi.fn(),
  resolveAccountPortals: mocks.resolveAccountPortals,
  setLastRolePortal: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'lt' }) }));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({ branding: null, loading: false, slug: null }) }));
vi.mock('@/lib/loginCredentials', () => ({
  loadSavedLoginForm: () => ({ email: '', password: '', rememberMe: false }),
  persistLoginForm: vi.fn(),
  readRememberMePreference: () => false,
}));
vi.mock('@/lib/pwaPortal', () => ({ setLastPortal: vi.fn() }));

import Login from '@/pages/Login';

function Destination() {
  const location = useLocation();
  return <div>Destination: {location.pathname}{location.search}</div>;
}

function renderLogin(next: string) {
  render(
    <MemoryRouter initialEntries={[`/login?next=${encodeURIComponent(next)}`]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/support/tickets" element={<Destination />} />
        <Route path="/student/support/tickets" element={<Destination />} />
        <Route path="/company/login" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitStudentLogin() {
  fireEvent.click(screen.getByRole('button', { name: /common\.login login\.alreadyHaveAccount/ }));
  fireEvent.change(screen.getByLabelText('login.emailOrUsername'), { target: { value: 'former-student@example.com' } });
  fireEvent.change(screen.getByLabelText('common.password'), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'common.login' }));
  return screen.findByText(/Destination:/);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'former-student@example.com' }, session: { access_token: 'token' } },
    error: null,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ticket links through login', () => {
  const ticket = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';

  it('preserves a former student’s portal-specific ticket link', async () => {
    renderLogin(`/student/support/tickets?ticket=${ticket}`);
    const destination = await submitStudentLogin();
    expect(destination.textContent).toBe(`Destination: /student/support/tickets?ticket=${ticket}`);
    expect(mocks.resolveAccountPortals).not.toHaveBeenCalled();
  });

  it('preserves a generic ticket link when a student chooses the student login form', async () => {
    renderLogin(`/support/tickets?ticket=${ticket}`);
    fireEvent.click(screen.getByRole('button', { name: /login.studentsParents/ }));
    const destination = await submitStudentLogin();
    expect(destination.textContent).toBe(`Destination: /support/tickets?ticket=${ticket}`);
    expect(mocks.resolveAccountPortals).not.toHaveBeenCalled();
  });

  it('passes a generic ticket link through the organization login choice', async () => {
    renderLogin(`/support/tickets?ticket=${ticket}`);
    fireEvent.click(screen.getByRole('button', { name: /login.companyAdmin/ }));
    const destination = await screen.findByText(/Destination:/);
    expect(destination.textContent).toBe(`Destination: /company/login?next=%2Fsupport%2Ftickets%3Fticket%3D${ticket}`);
  });
});
