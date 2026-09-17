import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    storage: { from: vi.fn() },
  },
}));

import SupportWidget from '@/components/support/SupportWidget';
import { rememberAuthUser } from '@/lib/authSession';

beforeEach(() => {
  rememberAuthUser(null);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('public support widget mobile shell', () => {
  it('opens inside the visible viewport without immediately opening the keyboard', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SupportWidget />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'DI pagalba' }));

    const dialog = screen.getByRole('dialog', { name: 'Tutlio DI pagalba' });
    expect(dialog.classList.contains('w-screen')).toBe(true);
    expect(dialog.classList.contains('h-dvh')).toBe(true);
    expect(dialog.style.top).toBe('0px');
    expect(dialog.style.height).toBe('844px');

    const composer = screen.getByPlaceholderText('Klauskite apie Tutlio…');
    expect(document.activeElement).not.toBe(composer);
    expect(screen.getAllByRole('button', { name: 'Uždaryti pagalbą' })
      .some((button) => button.classList.contains('hidden'))).toBe(true);
  });

  it('reclaims vertical space from contact shortcuts while the composer is focused', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SupportWidget />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'DI pagalba' }));
    const composer = screen.getByPlaceholderText('Klauskite apie Tutlio…');
    const contactButton = screen.getByRole('button', { name: /Susisiekti su mumis/ });
    const shortcuts = contactButton.parentElement;

    expect(shortcuts?.classList.contains('hidden')).toBe(false);
    fireEvent.focus(composer);
    expect(shortcuts?.classList.contains('hidden')).toBe(true);
  });
});
