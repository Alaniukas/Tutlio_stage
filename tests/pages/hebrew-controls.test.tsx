import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nContext, getDateFnsLocale } from '../../src/lib/i18n';
import type { Locale } from '../../src/lib/i18n';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../src/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../src/components/ui/select';

afterEach(cleanup);
function Language({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={{
    locale, setLocale: () => {}, t: (key) => key, tHtml: (key) => key, dateFnsLocale: getDateFnsLocale(locale),
  }}>{children}</I18nContext.Provider>;
}

describe('Hebrew shared controls', () => {
  it('reverses tab arrow navigation for Hebrew and preserves explicit direction overrides', async () => {
    const tabs = (dir?: 'ltr' | 'rtl') => <Tabs defaultValue="first" dir={dir}>
      <TabsList><TabsTrigger value="first">ראשון</TabsTrigger><TabsTrigger value="second">שני</TabsTrigger><TabsTrigger value="third">שלישי</TabsTrigger></TabsList>
      <TabsContent value="first">תוכן ראשון</TabsContent><TabsContent value="second">תוכן שני</TabsContent>
    </Tabs>;
    const { rerender } = render(<Language locale="he">{tabs()}</Language>);
    const first = screen.getByRole('tab', { name: 'ראשון' });
    const second = screen.getByRole('tab', { name: 'שני' });
    expect(first.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(second);
    rerender(<Language locale="he">{tabs('ltr')}</Language>);
    expect(screen.getByRole('tab', { name: 'ראשון' }).closest('[dir]')?.getAttribute('dir')).toBe('ltr');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'שלישי' }));
  });

  it('keeps select direction in sync when changing between Hebrew and English', () => {
    const select = <Select defaultValue="a"><SelectTrigger aria-label="בחירה"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="a">בחירה ראשונה</SelectItem></SelectContent></Select>;
    const { rerender } = render(<Language locale="he">{select}</Language>);
    expect(screen.getByRole('combobox').getAttribute('dir')).toBe('rtl');
    rerender(<Language locale="en">{select}</Language>);
    expect(screen.getByRole('combobox').getAttribute('dir')).toBe('ltr');
  });
});
