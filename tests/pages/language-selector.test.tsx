import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import LanguageSelector from '@/components/LanguageSelector';
import { I18nContext, LOCALE_NAMES, SUPPORTED_LOCALES, getDateFnsLocale } from '@/lib/i18n';
import { selectableLocales } from '@/lib/i18n/localeRelease';
import { t } from '@/lib/i18n/core';

afterEach(cleanup);

function CurrentLocation() {
  const { pathname, search, hash } = useLocation();
  return <output aria-label="Current URL">{pathname}{search}{hash}</output>;
}

function renderSelector(url = '/pricing?audience=agency#plans') {
  const setLocale = vi.fn();
  render(
    <MemoryRouter initialEntries={[url]}>
      <I18nContext.Provider value={{
        locale: 'lt', setLocale, t: (key) => t('lt', key), tHtml: (key) => key,
        dateFnsLocale: getDateFnsLocale('lt'),
      }}>
        <LanguageSelector />
        <CurrentLocation />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pasirinkti kalbą' }));
  return setLocale;
}

describe('navbar language dropdown', () => {
  it('updates a stale lang query when selecting the domain default and preserves other URL state', () => {
    renderSelector('/he/pricing?lang=he&audience=agency&next=%2Fdashboard#plans');
    fireEvent.click(screen.getByText(LOCALE_NAMES.lt));
    const url = new URL(screen.getByLabelText('Current URL').textContent!, 'https://example.com');
    expect(url.pathname).toBe('/pricing');
    expect(url.searchParams.get('lang')).toBe('lt');
    expect(url.searchParams.get('audience')).toBe('agency');
    expect(url.searchParams.get('next')).toBe('/dashboard');
    expect(url.hash).toBe('#plans');
  });
  it('localizes its accessible label and restores trigger focus when dismissed with Escape', () => {
    renderSelector();
    const option = screen.getByText(LOCALE_NAMES.en).closest('button')!;
    option.focus();
    fireEvent.keyDown(option, { key: 'Escape' });
    const trigger = screen.getByRole('button', { name: 'Pasirinkti kalbą' });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(LOCALE_NAMES.en)).toBeNull();
  });
  it('keeps all languages in a fixed-height, viewport-capped scrolling panel', () => {
    renderSelector();
    const panel = screen.getByText(LOCALE_NAMES.lt).closest('button')!.parentElement!;

    for (const className of ['h-80', 'max-h-[60dvh]', 'overflow-y-auto', 'overscroll-contain']) {
      expect(panel.classList.contains(className)).toBe(true);
    }
    expect(within(panel).getAllByRole('button')).toHaveLength(selectableLocales(true).length);
    expect(screen.getByText(LOCALE_NAMES.cs)).toBeTruthy();
  });

  it('shows every registered locale in a production build', () => {
    vi.stubEnv('DEV', false);
    try {
      renderSelector();
      expect(screen.getByText(LOCALE_NAMES.en)).toBeTruthy();
      expect(screen.getByText(LOCALE_NAMES.it)).toBeTruthy();
      expect(screen.getByText(LOCALE_NAMES.cs)).toBeTruthy();
      const panel = screen.getByText(LOCALE_NAMES.lt).closest('button')!.parentElement!;
      expect(within(panel).getAllByRole('button')).toHaveLength(SUPPORTED_LOCALES.length);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('still selects a language at the end of the list and closes the dropdown', () => {
    const setLocale = renderSelector();
    const lastLocale = SUPPORTED_LOCALES[SUPPORTED_LOCALES.length - 1];
    fireEvent.click(screen.getByText(LOCALE_NAMES[lastLocale]));

    expect(setLocale).toHaveBeenCalledWith(lastLocale);
    const trigger = screen.getByRole('button', { name: 'Pasirinkti kalbą' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByText(LOCALE_NAMES[lastLocale])).toBeNull();
    expect(screen.getByLabelText('Current URL').textContent).toBe(`/${lastLocale}/pricing?audience=agency#plans`);
  });
});
