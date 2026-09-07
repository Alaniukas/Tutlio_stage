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
  const { cs } = await import('../../src/lib/i18n/cs');
  return {
    ...actual,
    useTranslation: () => ({
      locale: 'cs',
      t: (key: string, params: Record<string, string | number> = {}) =>
        (cs[key] ?? key).replace(/\{([a-zA-Z_][a-zA-Z_0-9]*)\}/g,
          (placeholder, name: string) => params[name] == null ? placeholder : String(params[name])),
    }),
  };
});

function LocationProbe() {
  return <output data-testid="current-route">{useLocation().pathname}</output>;
}

async function renderCzechQuiz(path: string) {
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

describe('Czech quiz interface', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('presents tutor and business choices in Czech', async () => {
    await renderCzechQuiz('/cs/quiz');
    expect(screen.getByRole('heading', { name: 'Najděte nastavení Tutlio, se kterým vám půjde práce snáze' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Samostatný lektor/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Doučovací centrum/ })).toBeTruthy();
  });

  it('retains Czech on the business challenge-to-insight transition', async () => {
    await renderCzechQuiz('/cs/quiz/company/challenge');
    const next = screen.getByTestId('floating-proceed') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Koordinace rozvrhu celého týmu/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Výpočet odměn lektorů a úprav/ }));
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId('current-route').textContent).toBe('/cs/quiz/company/insight');
    expect(screen.getByRole('heading', { name: 'Provozní zdržení se v týmu lektorů násobí' })).toBeTruthy();
  });
});
