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
  const { el } = await import('../../src/lib/i18n/el');
  return {
    ...actual,
    useTranslation: () => ({
      locale: 'el',
      t: (key: string, params: Record<string, string | number> = {}) =>
        (el[key] ?? key).replace(/\{([a-zA-Z_][a-zA-Z_0-9]*)\}/g,
          (placeholder, name: string) => params[name] == null ? placeholder : String(params[name])),
    }),
  };
});

function LocationProbe() {
  return <output data-testid="current-route">{useLocation().pathname}</output>;
}

async function renderGreekQuiz(path: string) {
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

describe('Greek quiz interface', () => {
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

  it('presents tutor and business choices in Greek', async () => {
    await renderGreekQuiz('/el/quiz');
    expect(screen.getByRole('heading', { name: 'Βρείτε τη διαμόρφωση Tutlio που θα κάνει τη δουλειά σας πιο εύκολη' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ανεξάρτητος καθηγητής/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Επιχείρηση ιδιαίτερων μαθημάτων/ })).toBeTruthy();
  });

  it('retains Greek on the business challenge-to-insight transition', async () => {
    await renderGreekQuiz('/el/quiz/company/challenge');
    const next = screen.getByTestId('floating-proceed') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Στον συντονισμό του προγράμματος όλης της ομάδας/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Στον υπολογισμό αμοιβών και προσαρμογών καθηγητών/ }));
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId('current-route').textContent).toBe('/el/quiz/company/insight');
    expect(screen.getByRole('heading', { name: 'Οι καθυστερήσεις πολλαπλασιάζονται σε μια ομάδα καθηγητών' })).toBeTruthy();
  });
});
