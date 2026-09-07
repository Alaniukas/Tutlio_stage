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

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Czech tutor and business forms', () => {
  it('starts registration with Czechia and a Czech international phone hint', () => {
    render(<MemoryRouter><Register /></MemoryRouter>);
    const country = screen.getByRole('combobox', { name: 'Telefonní předvolba země' }) as HTMLSelectElement;
    expect(country.value).toBe('+420');
    expect(screen.getByRole('option', { name: 'CZ +420' })).toBeTruthy();
    expect(screen.getByPlaceholderText('601123456')).toBeTruthy();
    expect(screen.getByText('Příklad pro vybranou předvolbu: +420 601123456')).toBeTruthy();
  });

  it('renders the shared tutor/business public-page editor in Czech without altering user content', async () => {
    const page = {
      id: 'czech-local-test', slug: 'czech-local-test', owner_type: 'tutor', locale: 'cs',
      display_name: 'User authored name', headline: 'User authored headline', bio: 'User authored biography',
      languages: ['Čeština'], published: false, booking_enabled: false,
      brand_color: '#4c2a85', backdrop_theme: 'math', socials: {},
    };
    vi.mocked(loadMyPage).mockResolvedValue({ page } as Awaited<ReturnType<typeof loadMyPage>>);
    render(<MemoryRouter><PublicPageEditorContent /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Zveřejnit' })).toBeTruthy();
    expect(screen.getByText('Náhled')).toBeTruthy();
    expect(screen.getByText('Přijímat žádosti')).toBeTruthy();
    expect(screen.getByDisplayValue('User authored biography')).toBeTruthy();
    expect(document.title).toBe('Digitální vizitka | Tutlio');
    expect(savePage).not.toHaveBeenCalled();
  });
});
