import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, StaticLocaleProvider } from '@/contexts/LocaleContext';
import { useTranslation } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import LocaleRouteSync from '@/components/LocaleRouteSync';
import LocaleLoadStatus from '@/components/LocaleLoadStatus';
import { LOCALE_LOAD_COPY } from '@/lib/i18n/localeLoadCopy';

const state = vi.hoisted(() => ({
  initial: 'lt' as Locale,
  loaded: new Set<Locale>(['lt']),
  requests: [] as { locale: Locale; resolve: () => void; reject: (error: Error) => void }[],
  save: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/analytics', () => ({ initAnalytics: vi.fn(), trackPageview: vi.fn() }));
vi.mock('@/lib/localePreference', () => ({ persistProfileLocale: (...args: unknown[]) => state.save(...args) }));
vi.mock('@/lib/i18n', async (importOriginal) => ({
  ...await importOriginal<object>(),
  detectLocale: () => state.initial,
  storeLocale: vi.fn(),
  isLocaleLoaded: (locale: Locale) => state.loaded.has(locale),
  loadLocaleDict: (locale: Locale) => new Promise<void>((resolve, reject) => {
    state.requests.push({ locale, reject, resolve: () => { state.loaded.add(locale); resolve(); } });
  }),
}));

function Form() {
  const { locale, setLocale } = useTranslation();
  return <>
    <output aria-label="Active language">{locale}</output>
    <input aria-label="Unsubmitted name" defaultValue="" />
    {(['lt', 'he', 'ja'] as const).map((next) => <button key={next} onClick={() => setLocale(next)}>{next}</button>)}
  </>;
}
async function complete(locale: Locale) {
  await act(async () => state.requests.findLast((request) => request.locale === locale)!.resolve());
}
beforeEach(() => {
  state.initial = 'lt'; state.loaded = new Set(['lt']); state.requests = []; state.save.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('lazy locale loading', () => {
  it('names the requested language when preference saving fails while the old UI remains visible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.save.mockRejectedValueOnce(new Error('database rejected preference'));
    render(<LocaleProvider><Form /></LocaleProvider>);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'he', exact: true })));
    expect(screen.getByLabelText('Active language').textContent).toBe('lt');
    expect(screen.getByText(/: עברית$/)).toBeTruthy();
  });
  it('never reloads automatically and lets users cancel a reload that would discard unsaved data', () => {
    const reload = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LocaleLoadStatus locale="he" failed compact retry={vi.fn()} reload={reload} />);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: LOCALE_LOAD_COPY.he.reload }));
    expect(confirm).toHaveBeenCalledWith(LOCALE_LOAD_COPY.he.reloadWarning);
    expect(reload).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: LOCALE_LOAD_COPY.he.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('offers an explicit fresh-document recovery when the browser caches a failed initial import', () => {
    const reload = vi.fn();
    render(<LocaleLoadStatus locale="ja" failed retry={vi.fn()} warnBeforeReload={false} reload={reload} />);
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: LOCALE_LOAD_COPY.ja.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('renders a visible loading state before mounting a cold deep link', async () => {
    state.initial = 'he'; state.loaded.clear();
    // The blog surface is still unpublished for Hebrew, so the loading state must carry noindex.
    window.history.replaceState({}, '', '/he/blog');
    render(<LocaleProvider><Form /></LocaleProvider>);
    expect(screen.queryByLabelText('Unsubmitted name')).toBeNull();
    expect(screen.getByRole('status').textContent?.trim()).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
    await complete('he');
    expect(screen.getByLabelText('Active language').textContent).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    window.history.replaceState({}, '', '/');
  });

  it('keeps the current language, direction and unsaved form on a failed switch, then retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LocaleProvider><Form /></LocaleProvider>);
    const input = screen.getByLabelText('Unsubmitted name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Unsaved student' } });
    fireEvent.click(screen.getByRole('button', { name: 'he', exact: true }));
    expect(screen.getByLabelText('Active language').textContent).toBe('lt');
    expect(document.documentElement.dir).toBe('ltr');
    await act(async () => state.requests[0].reject(new Error('network unavailable')));
    expect(screen.getByRole('alert').textContent).not.toContain('network unavailable');
    fireEvent.click(screen.getByRole('alert').querySelector('button')!);
    await complete('he');
    expect(screen.getByLabelText('Active language').textContent).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByLabelText('Unsubmitted name')).toBe(input);
    expect(input.value).toBe('Unsaved student');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores an older download completing after a newer selection', async () => {
    render(<LocaleProvider><Form /></LocaleProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'he', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'ja', exact: true }));
    await complete('ja');
    await complete('he');
    expect(screen.getByLabelText('Active language').textContent).toBe('ja');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('can cancel a pending switch by returning to the already loaded language', async () => {
    render(<LocaleProvider><Form /></LocaleProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'he', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'lt', exact: true }));
    await complete('he');
    expect(screen.getByLabelText('Active language').textContent).toBe('lt');
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('cancels a pending URL language when navigation returns to the active language', async () => {
    function Navigation() {
      const navigate = useNavigate();
      return <><LocaleRouteSync /><Form />
        <button onClick={() => navigate('/he/blog')}>Visit Hebrew</button>
        <button onClick={() => navigate('/lt/login')}>Return Lithuanian</button>
      </>;
    }
    render(<MemoryRouter initialEntries={['/lt/login']}><LocaleProvider><Navigation /></LocaleProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Visit Hebrew' }));
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
    fireEvent.click(screen.getByRole('button', { name: 'Return Lithuanian' }));
    await complete('he');
    expect(screen.getByLabelText('Active language').textContent).toBe('lt');
  });

  it('recovers a failed static dictionary without changing outer document metadata or saving a preference', async () => {
    state.loaded.clear();
    document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr';
    render(<StaticLocaleProvider locale="he"><Form /></StaticLocaleProvider>);
    await act(async () => state.requests[0].reject(new Error('network unavailable')));
    fireEvent.click(screen.getByRole('alert').querySelector('button')!);
    await complete('he');
    await waitFor(() => expect(screen.getByLabelText('Active language').textContent).toBe('he'));
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(state.save).not.toHaveBeenCalled();
  });
});
