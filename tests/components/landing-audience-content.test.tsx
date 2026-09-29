import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { I18nContext, t as translate } from '@/lib/i18n';
import FaqSection from '@/components/landing/v2/FaqSection';
import FinalCta from '@/components/landing/v2/FinalCta';
import type { LandingAudience } from '@/components/landing/v2/audience';
import type { ReactNode } from 'react';

vi.mock('@/components/landing/Reveal', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));

function renderAudience(audience: LandingAudience) {
  render(
    <MemoryRouter>
      <I18nContext.Provider value={{
        locale: 'lt',
        setLocale: () => {},
        t: (key, params) => translate('lt', key, params),
        tHtml: (key, params) => translate('lt', key, params),
        dateFnsLocale: undefined,
      }}>
        <FaqSection audience={audience} />
        <FinalCta audience={audience} />
      </I18nContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('landing audience content', () => {
  it('shows agency questions and a demo CTA on the default business landing', () => {
    renderAudience('biz');
    expect(screen.getByText('Ar galime valdyti kelis korepetitorius ir tėvų paskyras?')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Parodykime, kaip Tutlio veiktų jūsų agentūroje' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Suplanuoti skambutį' }).getAttribute('href')).toBe('/pricing?audience=agency');
    expect(screen.queryByText('Ar yra nemokamas bandomasis laikotarpis?')).toBeNull();
  });

  it('keeps the solo questions and trial CTA on the tutor landing', () => {
    renderAudience('solo');
    expect(screen.getByText('Ar yra nemokamas bandomasis laikotarpis?')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pradėti nemokamai' }).getAttribute('href')).toBe('/pricing?audience=solo');
    expect(screen.queryByText('Ar galime valdyti kelis korepetitorius ir tėvų paskyras?')).toBeNull();
  });
});
