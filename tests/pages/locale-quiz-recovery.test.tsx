import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import QuizFunnel from '@/pages/QuizFunnel';
import { LOCALE_LOAD_COPY } from '@/lib/i18n/localeLoadCopy';

const state = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ getStoredUtm: () => ({}) }));
vi.mock('@/components/pricing/TutorPlanCards', () => ({ default: () => null }));
vi.mock('@/components/pricing/EnterprisePlanCard', () => ({ default: () => null }));
vi.mock('@/components/EnterpriseContactModal', () => ({ default: () => null }));
vi.mock('@/components/landing/v2/HeroAnimation', () => ({ default: () => null }));
vi.mock('@/lib/i18n', async (importOriginal) => ({
  ...await importOriginal<object>(),
  loadLocaleDict: () => state.load(),
  useTranslation: () => ({ locale: 'pl', t: (key: string) => key }),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('lets a legacy quiz retry a failed fallback download without an unhandled rejection', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  state.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  await act(async () => { render(<MemoryRouter initialEntries={['/pl/quiz']}>
    <Routes><Route path="/:locale/quiz" element={<QuizFunnel />} /></Routes>
  </MemoryRouter>); });
  expect(screen.getByRole('alert').textContent).toContain(LOCALE_LOAD_COPY.pl.error);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: LOCALE_LOAD_COPY.pl.retry })));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: /quiz.audience.solo.title/ })).toBeTruthy();
  expect(state.load).toHaveBeenCalledTimes(2);
});
