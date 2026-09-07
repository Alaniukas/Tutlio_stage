import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LegalDocumentPage from '@/components/LegalDocumentPage';

vi.mock('@/lib/i18n', () => ({
  stripLocalePrefix: (pathname: string) => pathname.replace(/^\/(?:lt|en|pl|lv|ee|fr|es|de|se|dk|fi|no|nl)(?=\/|$)/, '') || '/',
  useTranslation: () => ({ t: (key: string) => key }),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="legal-location">
      {`${location.pathname}${location.search}${location.hash}|${JSON.stringify(location.state)}`}
    </output>
  );
}

function LegalTestRoutes() {
  const relatedLinks = [
    { to: '/terms', labelKey: 'legal.termsOfService' },
    { to: '/dpa', labelKey: 'legal.dpa' },
  ];

  return (
    <>
      <Routes>
        <Route path="/privacy-policy" element={<LegalDocumentPage doc="priv" relatedLinks={relatedLinks} />} />
        <Route path="/terms" element={<LegalDocumentPage doc="tos" relatedLinks={[{ to: '/dpa', labelKey: 'legal.dpa' }]} />} />
        <Route path="/en/quiz/company/email" element={<div>quiz-email</div>} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
      <LocationProbe />
    </>
  );
}

describe('LegalDocumentPage quiz return navigation', () => {
  it('returns to the exact quiz step, including its query and hash', () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/privacy-policy',
          state: { returnTo: '/en/quiz/company/email?source=campaign#email-form' },
        }]}
      >
        <LegalTestRoutes />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'legal.goBack' }));

    expect(screen.getByTestId('legal-location').textContent).toBe(
      '/en/quiz/company/email?source=campaign#email-form|null',
    );
  });

  it('keeps the quiz return route while moving between policy pages', () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/privacy-policy',
          state: { returnTo: '/en/quiz/company/email?source=campaign#email-form' },
        }]}
      >
        <LegalTestRoutes />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'legal.termsOfService' }));
    expect(screen.getByTestId('legal-location').textContent).toContain('/terms|');

    fireEvent.click(screen.getByRole('link', { name: 'legal.goBack' }));
    expect(screen.getByTestId('legal-location').textContent).toBe(
      '/en/quiz/company/email?source=campaign#email-form|null',
    );
  });

  it('rejects non-quiz return targets and keeps the normal home fallback', () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: '/privacy-policy',
          state: { returnTo: '//example.com/phishing' },
        }]}
      >
        <LegalTestRoutes />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'legal.goBack' }));
    expect(screen.getByTestId('legal-location').textContent).toBe('/|null');
  });
});
