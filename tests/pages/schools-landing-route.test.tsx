import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Landing from '@/pages/Landing';
import { PlatformProvider } from '@/contexts/PlatformContext';
import { I18nContext, t as translate } from '@/lib/i18n';

vi.mock('@/lib/pwaPortal', () => ({
  isStandalonePwa: () => false,
  loginPathForLastPortal: () => '/school/login',
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock('@/lib/landingStats', () => ({ loadPublicLandingLessonCount: () => () => {} }));
vi.mock('@/components/landing/Reveal', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/LandingNavbar', () => ({ default: () => null }));
vi.mock('@/components/LandingFooter', () => ({ default: () => null }));
vi.mock('@/components/landing/StepsSection', () => ({ default: () => null }));
vi.mock('@/components/landing/FeaturesSection', () => ({ default: () => null }));
vi.mock('@/components/landing/IntegrationsSection', () => ({ default: () => null }));
vi.mock('@/components/landing/ShowcaseCards', () => ({ default: () => null }));
vi.mock('@/components/landing/CtaBanner', () => ({ default: () => null }));
vi.mock('@/components/landing/BlogSection', () => ({ default: () => null }));
vi.mock('@/pages/NewLanding', () => ({ default: () => <h1>Agency landing</h1> }));

afterEach(cleanup);

describe('schools marketing route', () => {
  it('shows the school pitch and school contact path at /schools', () => {
    render(
      <MemoryRouter basename="/schools" initialEntries={['/schools']}>
        <PlatformProvider platform="schools">
          <I18nContext.Provider value={{
            locale: 'lt',
            setLocale: () => {},
            t: (key, params) => translate('lt', key, params, 'schools'),
            tHtml: (key, params) => translate('lt', key, params, 'schools'),
            dateFnsLocale: undefined,
          }}>
            <Landing />
          </I18nContext.Provider>
        </PlatformProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('mokyklų valdymui');
    expect(screen.queryByText('Agency landing')).toBeNull();
    expect(screen.getByRole('link', { name: 'Susisiekti' }).getAttribute('href')).toBe('/schools/kontaktai');
    expect(screen.getByText('Ar galima valdyti sutartis ir mokėjimus?')).toBeTruthy();
    expect(document.title).toContain('mokyklų valdymui');
  });
});
