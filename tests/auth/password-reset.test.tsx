/**
 * Slaptažodžio atkūrimo redirect URL ir AuthCallback nukreipimų logika.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuthCallback from '@/pages/AuthCallback';
import { authDestinationWithLocale, getAppOrigin, getPasswordResetRedirectTo, safeInternalNextPath } from '@/lib/auth-redirects';

const authCtx = vi.hoisted(() => ({
  setSession: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: authCtx.setSession,
      getSession: authCtx.getSession,
      getUser: authCtx.getUser,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: authCtx.unsubscribe } },
      })),
    },
  },
}));

function PathnameProbe() {
  const { pathname, search } = useLocation();
  return <><span data-testid="pathname">{pathname}</span><span data-testid="search">{search}</span></>;
}

/** AuthCallback skaito window.location.hash / search – MemoryRouter jų nepririša prie window. */
function setBrowserUrl(pathQueryHash: string) {
  const path = pathQueryHash.startsWith('/') ? pathQueryHash : `/${pathQueryHash}`;
  const base = window.location.origin || 'http://localhost';
  window.history.replaceState(null, '', `${base}${path}`);
}

function renderAuthCallback(pathnameOnly: string) {
  return render(
    <MemoryRouter initialEntries={[pathnameOnly]}>
      <PathnameProbe />
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<div data-testid="login-page">login</div>} />
        <Route path="/dashboard" element={<div data-testid="dashboard-page">dashboard</div>} />
        <Route path="/reset-password" element={<div data-testid="reset-page">reset</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('auth-redirects', () => {
  it('carries the selected language through the existing callback path', () => {
    expect(getPasswordResetRedirectTo(undefined, 'https://www.tutlio.com', 'he'))
      .toBe('https://www.tutlio.com/auth/callback?next=/reset-password&lang=he');
    expect(authDestinationWithLocale('/dashboard?tab=lessons#today', 'pt-br'))
      .toBe('/dashboard?tab=lessons&lang=pt-br#today');
  });

  it.each(['//evil.example', '/\\evil.example', '/%5Cevil.example', '/\nevil.example'])('rejects an unsafe callback next path %s', (path) => {
    expect(safeInternalNextPath(path)).toBeNull();
  });
  it('getAppOrigin nuima trailing slash ir naudoja VITE_APP_URL', () => {
    expect(getAppOrigin('https://tutlio.lt/', 'https://wrong')).toBe('https://tutlio.lt');
  });

  it('getAppOrigin be VITE naudoja window origin', () => {
    expect(getAppOrigin(undefined, 'https://tutlio.lt')).toBe('https://tutlio.lt');
  });

  it('getPasswordResetRedirectTo – naršyklėje naudoja perduotą origin (www / apex), ne tik VITE', () => {
    expect(getPasswordResetRedirectTo('https://tutlio.lt', 'https://www.tutlio.lt')).toBe(
      'https://www.tutlio.lt/auth/callback?next=/reset-password',
    );
  });
});

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCtx.setSession.mockResolvedValue({ data: { session: null }, error: null });
    authCtx.getSession.mockResolvedValue({ data: { session: null }, error: null });
    authCtx.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('retains Hebrew after opening a recovery link in a fresh browser', async () => {
    setBrowserUrl('/auth/callback?next=/reset-password&lang=he#access_token=at&refresh_token=rt&type=recovery');
    renderAuthCallback('/auth/callback');
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/reset-password'));
    expect(screen.getByTestId('search').textContent).toBe('?lang=he');
    expect(localStorage.getItem('tutlio_locale')).toBe('he');
  });

  it('hash type=recovery → /reset-password po sėkmingos setSession', async () => {
    setBrowserUrl('/auth/callback#access_token=at&refresh_token=rt&type=recovery');
    renderAuthCallback('/auth/callback');

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/reset-password');
    });

    expect(authCtx.setSession).toHaveBeenCalledWith({
      access_token: 'at',
      refresh_token: 'rt',
    });
  });

  it('hash type=signup → /login', async () => {
    setBrowserUrl('/auth/callback#access_token=at&refresh_token=rt&type=signup');
    renderAuthCallback('/auth/callback');

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/login');
    });
  });

  it('uses an initialized signup session when the SDK consumed the hash before the lazy callback mounted', async () => {
    vi.useFakeTimers();
    authCtx.getSession.mockResolvedValue({
      data: { session: { user: { id: 'qa-user', user_metadata: { locale: 'he' } } } },
      error: null,
    });
    setBrowserUrl('/auth/callback?next=/dashboard&lang=he');
    renderAuthCallback('/auth/callback');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(screen.getByTestId('pathname').textContent).toBe('/dashboard');
    expect(screen.getByTestId('search').textContent).toBe('?lang=he');
    expect(localStorage.getItem('tutlio_locale')).toBe('he');
  });

  it('setSession klaida → /login', async () => {
    authCtx.setSession.mockResolvedValue({
      data: { session: null },
      error: new Error('bad'),
    });
    setBrowserUrl('/auth/callback#access_token=at&refresh_token=rt&type=recovery');
    renderAuthCallback('/auth/callback');

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/login');
    });
  });

  it('?next=/reset-password be hash, PKCE: laukia getSession ir eina į /reset-password', async () => {
    vi.useFakeTimers();
    let n = 0;
    authCtx.getSession.mockImplementation(async () => {
      n += 1;
      if (n < 2) return { data: { session: null }, error: null };
      return { data: { session: { user: { id: 'u1' } } }, error: null };
    });

    setBrowserUrl('/auth/callback?next=/reset-password');
    renderAuthCallback('/auth/callback');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.getByTestId('pathname').textContent).toBe('/reset-password');
  });

  it('be hash ir be next – po timeout į /login', async () => {
    vi.useFakeTimers();
    setBrowserUrl('/auth/callback');
    renderAuthCallback('/auth/callback');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    expect(screen.getByTestId('pathname').textContent).toBe('/login');
  });
});
