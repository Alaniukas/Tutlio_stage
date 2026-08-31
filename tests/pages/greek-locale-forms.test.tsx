import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Register from '../../src/pages/Register';
import { PublicPageEditorContent } from '../../src/pages/PublicPageEditor';
import { loadMyPage, savePage } from '../../src/lib/publicPageStore';

vi.mock('@/components/Layout', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/lib/analytics', () => ({ getStoredUtm: () => ({}) }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('@/lib/publicPageStore', async () => ({
  ...await vi.importActual<typeof import('../../src/lib/publicPageStore')>('@/lib/publicPageStore'),
  loadMyPage: vi.fn(),
  savePage: vi.fn(),
}));
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

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Greek tutor and business forms', () => {
  it('starts registration with Greece and a Greek international phone hint', () => {
    render(<MemoryRouter><Register /></MemoryRouter>);
    const country = screen.getByRole('combobox', { name: 'Τηλεφωνικός κωδικός χώρας' }) as HTMLSelectElement;
    expect(country.value).toBe('+30');
    expect(screen.getByRole('option', { name: 'GR +30' })).toBeTruthy();
    expect(screen.getByPlaceholderText('6912345678')).toBeTruthy();
    expect(screen.getByText('Παράδειγμα για τον επιλεγμένο κωδικό χώρας: +30 6912345678')).toBeTruthy();
  });

  it('renders the shared tutor/business public-page editor in Greek without altering user content', async () => {
    const page = {
      id: 'greek-local-test', slug: 'greek-local-test', owner_type: 'tutor', locale: 'el',
      display_name: 'User authored name', headline: 'User authored headline', bio: 'User authored biography',
      languages: ['Ελληνικά'], published: false, booking_enabled: false,
      brand_color: '#4c2a85', backdrop_theme: 'math', socials: {},
    };
    vi.mocked(loadMyPage).mockResolvedValue({ page } as Awaited<ReturnType<typeof loadMyPage>>);
    render(<MemoryRouter><PublicPageEditorContent /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Δημοσίευση' })).toBeTruthy();
    expect(screen.getByText('Προεπισκόπηση')).toBeTruthy();
    expect(screen.getByText('Αποδοχή αιτημάτων')).toBeTruthy();
    expect(screen.getByDisplayValue('User authored biography')).toBeTruthy();
    expect(document.title).toBe('Ψηφιακή επαγγελματική κάρτα | Tutlio');
    expect(savePage).not.toHaveBeenCalled();
  });
});
