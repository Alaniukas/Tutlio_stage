import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SendPackageModal from '@/components/SendPackageModal';
import { I18nContext, getDateFnsLocale } from '@/lib/i18n';
import { loadLocaleDict, t, tHtml } from '@/lib/i18n/core';
import { LOCALE_FORMAT_TAGS, type Locale } from '@/lib/i18n/locales';

vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'test-tutor' } } }) },
  from: (table: string) => {
    const result = { data: table === 'profiles' ? { subscription_plan: 'monthly' }
      : table === 'subjects' ? [{ id: 'maths', name: 'Maths', price: 25 }] : [], error: null };
    const query = { select: () => query, eq: () => query, order: () => query,
      single: async () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return query;
  },
} }));
const locales: Locale[] = ['en', 'cs', 'he', 'ar', 'th'];
beforeAll(async () => { await Promise.all(locales.map(loadLocaleDict)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('localized package fee disclosure', () => {
  it.each(locales)('%s exposes all fee amounts by click/keyboard and formats EUR without changing currency', async (locale) => {
    const fetchMock = vi.fn(() => { throw new Error('No payment requests in a display test'); });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><I18nContext.Provider value={{
      locale, setLocale: vi.fn(), dateFnsLocale: getDateFnsLocale(locale),
      t: (key, params) => t(locale, key, params), tHtml: (key, params) => tHtml(locale, key, params),
    }}><SendPackageModal isOpen onClose={vi.fn()} studentId="test-student" studentName="Ada" studentEmail="ada@example.com" /></I18nContext.Provider></MemoryRouter>);
    const trigger = await screen.findByRole('button', { name: `${t(locale, 'package.totalToPay')} — ${t(locale, 'package.includingFeesNote')}` });
    trigger.focus();
    fireEvent.click(trigger);
    const details = screen.getByRole('dialog', { name: t(locale, 'package.totalToPay') });
    const format = (amount: number) => new Intl.NumberFormat(LOCALE_FORMAT_TAGS[locale], { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(amount);
    // Five lessons at €25; existing fee arithmetic remains unchanged.
    await waitFor(() => expect(details.textContent).toContain(t(locale, 'package.tooltipTutor', { amount: format(125) })));
    expect(details.textContent).toContain(t(locale, 'package.tooltipPlatform', { amount: format(2.5) }));
    expect(details.textContent).toContain(t(locale, 'package.tooltipStripe', { amount: format(2.2) }));
    fireEvent.keyDown(details, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t(locale, 'package.totalToPay') })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
