import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nl as dutchDateLocale } from 'date-fns/locale';
import PublicTutorPage from '../../src/pages/PublicTutorPage';
import { EMPTY_DERIVED, type PublicPageRow } from '../../src/lib/publicPage';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: vi.fn() }));
vi.mock('@/lib/publicPageStore', () => ({ subscribeToPreview: () => () => {} }));
vi.mock('@/lib/documentMeta', () => ({ applyPageDocumentMeta: vi.fn(), applyCanonicalDocumentMeta: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ locale: 'nl', dateFnsLocale: dutchDateLocale }) }));

const page: PublicPageRow = {
  id: 'test-page', user_id: 'test-tutor', organization_id: null,
  slug: 'sanne-test', owner_type: 'tutor', locale: 'nl', display_name: 'Sanne',
  headline: 'Bijles wiskunde', bio: 'Persoonlijke bijles op jouw tempo.',
  tagline_text: null, tagline_emphasis: null, photo_url: null, cover_url: null,
  city: 'Utrecht', languages: ['Nederlands'], timezone: 'Europe/Amsterdam',
  brand_color: '#3b1e6e', brand_color_secondary: '#3b1e6e', brand_color_tertiary: '#3b1e6e',
  accent_color: '#d7f07a', accent_text_color: '#1f2937', backdrop_theme: 'plain',
  socials: null, published: true, booking_enabled: true,
};

async function openDetails() {
  render(<MemoryRouter initialEntries={['/nl/tutor/sanne-test']}>
    <Routes><Route path="/nl/tutor/:slug" element={<PublicTutorPage />} /></Routes>
  </MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Verder met je aanvraag' }));
  expect(screen.getByText('Je gegevens')).toBeTruthy();
}

function enterDetails() {
  fireEvent.change(screen.getByLabelText('Volledige naam'), { target: { value: 'Noor Voorbeeld' } });
  fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'noor@example.com' } });
  fireEvent.change(screen.getByLabelText('Telefoonnummer (optioneel)'), { target: { value: '+31 6 12345678' } });
}

describe('Dutch public enquiry customer journey', () => {
  beforeEach(() => {
    // All requests are mocked; this never visits a live tutor page or creates a lead.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ page, derived: EMPTY_DERIVED }),
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('validates contact details and confirms an enquiry without claiming a booking or payment', async () => {
    await openDetails();
    expect((screen.getByRole('button', { name: 'Aanvraag verzenden' }) as HTMLButtonElement).disabled).toBe(true);
    enterDetails();
    fireEvent.click(screen.getByRole('button', { name: 'Aanvraag verzenden' }));
    expect(await screen.findByText('Aanvraag verzonden')).toBeTruthy();
    expect(screen.getByText(/om het tijdstip te bevestigen/)).toBeTruthy();
    const calls = vi.mocked(fetch).mock.calls;
    const request = calls.find(([url]) => url === '/api/public-page-lead');
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      name: 'Noor Voorbeeld', email: 'noor@example.com', phone: '+31 6 12345678',
      message: 'Kies een lesvorm: Online',
    });
    expect(document.body.textContent).not.toMatch(/Enquiry sent|Payment successful|Boeking bevestigd/);
  });

  it.each([
    [429, 'Je hebt te veel aanvragen achter elkaar verzonden. Probeer het later opnieuw.'],
    [500, 'De aanvraag kon niet worden verzonden. Probeer het opnieuw.'],
  ])('renders a Dutch recovery message for HTTP %i and keeps the contact details', async (status, message) => {
    await openDetails();
    enterDetails();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status } as Response);
    fireEvent.click(screen.getByRole('button', { name: 'Aanvraag verzenden' }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect((screen.getByLabelText('Volledige naam') as HTMLInputElement).value).toBe('Noor Voorbeeld');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Aanvraag verzenden' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('shows the Dutch not-found state when the page cannot be loaded', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    render(<MemoryRouter initialEntries={['/nl/tutor/sanne-test']}>
      <Routes><Route path="/nl/tutor/:slug" element={<PublicTutorPage />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByText('Pagina niet gevonden')).toBeTruthy();
    expect(screen.getByText('Dit adres bestaat niet of de pagina is niet meer gepubliceerd.')).toBeTruthy();
  });

  it('keeps the advertised Amsterdam date and time through the enquiry summary', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ page, derived: {
        ...EMPTY_DERIVED, slots: [{ start: '2026-10-01T22:30:00Z', durationMinutes: 60 }],
      } }),
    } as Response);
    await openDetails();
    expect(screen.getByText('2 okt 00:30')).toBeTruthy();
  });

  it('formats the public lesson price with a Dutch decimal comma', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ page, derived: {
        ...EMPTY_DERIVED, offerings: [{ id: 'math', title: 'Wiskunde', durationMinutes: 60, publicPrice: 19.99 }],
      } }),
    } as Response);
    render(<MemoryRouter initialEntries={['/nl/tutor/sanne-test']}>
      <Routes><Route path="/nl/tutor/:slug" element={<PublicTutorPage />} /></Routes>
    </MemoryRouter>);
    expect((await screen.findAllByText(/€\s19,99/)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('€19.99');
  });
});
