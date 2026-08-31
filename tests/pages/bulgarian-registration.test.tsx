import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { loadLocaleDict, t } from '../../src/lib/i18n/core';
import { supabase } from '../../src/lib/supabase';
import Register from '../../src/pages/Register';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp: vi.fn(), signInWithPassword: vi.fn() }, from: vi.fn() },
}));
vi.mock('@/lib/analytics', () => ({ getStoredUtm: vi.fn(() => ({})) }));
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ locale: 'bg', t: (key: string, params?: Record<string, string | number>) => t('bg', key, params) }),
}));

beforeAll(async () => { await loadLocaleDict('bg'); });
afterEach(cleanup);

describe('Bulgarian registration', () => {
  it('renders the Bulgarian country default, labels and example without creating an account', () => {
    render(<MemoryRouter initialEntries={['/bg/register']}><Register /></MemoryRouter>);
    const dial = screen.getByRole('combobox', { name: 'Телефонен код на държавата' }) as HTMLSelectElement;
    expect(dial.value).toBe('+359');
    expect(screen.getByRole('option', { name: 'BG +359' })).toBeTruthy();
    expect(screen.getByPlaceholderText('881234567')).toBeTruthy();
    expect(screen.getByText('Пример за избрания телефонен код: +359 881234567')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Регистрация' })).toBeTruthy();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('allows a Bulgarian-language user to choose a different country code', () => {
    render(<MemoryRouter initialEntries={['/bg/register']}><Register /></MemoryRouter>);
    const dial = screen.getByRole('combobox', { name: 'Телефонен код на държавата' }) as HTMLSelectElement;
    fireEvent.change(dial, { target: { value: '+44' } });
    expect(dial.value).toBe('+44');
    expect(screen.getByText('Пример за избрания телефонен код: +44 7400123456')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Регистрация' })).toBeTruthy();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });
});
