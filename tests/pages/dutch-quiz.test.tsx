import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuizFunnel from '../../src/pages/QuizFunnel';

vi.mock('@/lib/analytics', () => ({ getStoredUtm: () => ({}) }));
vi.mock('@/components/pricing/TutorPlanCards', () => ({ default: () => null }));
vi.mock('@/components/pricing/EnterprisePlanCard', () => ({ default: () => null }));
vi.mock('@/components/EnterpriseContactModal', () => ({ default: () => null }));
vi.mock('@/components/landing/v2/HeroAnimation', () => ({ default: () => null }));
vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/i18n')>('@/lib/i18n');
  await actual.loadLocaleDict('nl');
  return { ...actual, useTranslation: () => ({
    locale: 'nl', t: (key: string, params?: Record<string, string | number>) => actual.t('nl', key, params),
  }) };
});

function LocationProbe() {
  return <output data-testid="current-route">{useLocation().pathname}</output>;
}

async function renderQuiz(path: string) {
  await act(async () => { render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:locale/quiz" element={<QuizFunnel />} />
        <Route path="/:locale/quiz/:audience/:step" element={<QuizFunnel />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  ); });
}

describe('Dutch quiz customer journey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each([
    ['Zelfstandig bijlesdocent', 'solo'], ['Bijlesbedrijf', 'company'], ['Online school', 'school'],
  ])('opens the %s journey while retaining /nl/', async (name, audience) => {
    await renderQuiz('/nl/quiz');
    expect(screen.getByRole('heading', { name: 'Ontdek hoe Tutlio jouw werk makkelijker kan maken' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    expect(screen.getByTestId('current-route').textContent).toBe(`/nl/quiz/${audience}/welcome`);
    expect(document.body.textContent).not.toMatch(/quiz\.[a-z]|What we will look for/);
  });

  it('enables the business multi-select continuation and presents the Dutch insight', async () => {
    await renderQuiz('/nl/quiz/company/challenge');
    const next = screen.getByTestId('floating-proceed') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Het rooster van het hele team afstemmen/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Docentvergoedingen en correcties berekenen/ }));
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(screen.getByTestId('current-route').textContent).toBe('/nl/quiz/company/insight');
    expect(screen.getByRole('heading', { name: 'Binnen een bijlesteam stapelen administratieve knelpunten zich op' })).toBeTruthy();
  });

  it.each(['solo', 'company', 'school'])('keeps %s lead consent in Dutch without submitting a lead', async audience => {
    await renderQuiz(`/nl/quiz/${audience}/email`);
    expect(screen.getByRole('checkbox', { name: /Ik ga ermee akkoord dat Tutlio mijn antwoorden bewaart/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toon mijn aanbod op maat' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'privacybeleid.' }).getAttribute('href')).toContain('privacy-policy');
    expect(fetch).not.toHaveBeenCalled();
  });
});
