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
  useTranslation: () => ({ locale: 'sl', t: (key: string, params?: Record<string, string | number>) => t('sl', key, params) }),
}));

beforeAll(async () => { await loadLocaleDict('sl'); });
afterEach(cleanup);

describe('Slovenian registration', () => {
  it('shows Slovenia and a Slovenian phone example without creating an account', () => {
    render(<MemoryRouter initialEntries={['/sl/register']}><Register /></MemoryRouter>);
    const dial = screen.getByRole('combobox', { name: 'Klicna številka države' }) as HTMLSelectElement;
    expect(dial.value).toBe('+386');
    expect(screen.getByRole('option', { name: 'SI +386' })).toBeTruthy();
    expect(screen.getByPlaceholderText('40123456')).toBeTruthy();
    expect(screen.getByText('Primer za izbrano klicno številko države: +386 40123456')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Registracija' })).toBeTruthy();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('lets a Slovenian-language user choose a different phone country', () => {
    render(<MemoryRouter initialEntries={['/sl/register']}><Register /></MemoryRouter>);
    const dial = screen.getByRole('combobox', { name: 'Klicna številka države' }) as HTMLSelectElement;
    fireEvent.change(dial, { target: { value: '+44' } });
    expect(dial.value).toBe('+44');
    expect(screen.getByText('Primer za izbrano klicno številko države: +44 7400123456')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Registracija' })).toBeTruthy();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });
});
