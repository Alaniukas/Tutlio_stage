import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LandingNavbar from '@/components/LandingNavbar';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { I18nContext, t as translate } from '@/lib/i18n';
import type { Platform } from '@/lib/platform';

vi.mock('@/components/LanguageSelector', () => ({ default: () => null }));

const solutionLabels = ['Korepetitoriai', 'Korepetitorių agentūros', 'Internetinės mokyklos'];

function renderNavbar({
  platform = 'tutors',
  audience,
}: {
  platform?: Platform;
  audience?: 'solo' | 'agency';
} = {}) {
  render(
    <MemoryRouter basename={platform === 'schools' ? '/schools' : undefined} initialEntries={[platform === 'schools' ? '/schools' : '/']}>
      <PlatformProvider platform={platform}>
        <I18nContext.Provider value={{
          locale: 'lt',
          setLocale: () => {},
          t: (key, params) => translate('lt', key, params, platform),
          tHtml: (key, params) => translate('lt', key, params, platform),
          dateFnsLocale: undefined,
        }}>
          <LandingNavbar audience={audience} />
        </I18nContext.Provider>
      </PlatformProvider>
    </MemoryRouter>,
  );
}

function expectSolutions(selectedLabel: string, hrefs: string[], labels = solutionLabels) {
  const dropdown = screen.getByRole('button', { name: `Sprendimai: ${selectedLabel}` });
  expect(dropdown.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(dropdown);
  expect(dropdown.getAttribute('aria-expanded')).toBe('true');

  labels.forEach((label, index) => {
    const link = screen.getByRole('link', { name: label });
    expect(link.getAttribute('href')).toBe(hrefs[index]);
    expect(link.getAttribute('aria-current')).toBe(label === selectedLabel ? 'page' : null);
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal('innerWidth', 1440);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('landing navbar solution selection', () => {
  it('defaults to agencies when no audience is stored', () => {
    renderNavbar();
    expectSolutions('Korepetitorių agentūros', ['/for-tutors', '/', '/schools']);
    expect(screen.getByRole('link', { name: 'Užsisakyti demo' }).getAttribute('href')).toBe('/pricing?audience=agency');
  });

  it('selects tutors when the solo audience is supplied', () => {
    renderNavbar({ audience: 'solo' });
    expectSolutions('Korepetitoriai', ['/for-tutors', '/', '/schools']);
    expect(screen.getByRole('link', { name: 'Pradėti nemokamai' }).getAttribute('href')).toBe('/pricing?audience=solo');
  });

  it('selects schools on the schools platform and links its CTA to contacts', () => {
    renderNavbar({ platform: 'schools' });
    expectSolutions('Internetinės mokyklos', ['/for-tutors', '/', '/schools'], [
      'Korepetitoriai', 'Mokytojų agentūros', 'Internetinės mokyklos',
    ]);
    expect(screen.getByRole('link', { name: 'Susisiekti' }).getAttribute('href')).toBe('/schools/kontaktai');
  });
});
