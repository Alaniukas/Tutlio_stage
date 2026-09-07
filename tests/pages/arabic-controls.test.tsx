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

describe('Arabic shared controls', () => {
  it('reverses tab arrow navigation for Arabic and preserves explicit direction overrides', async () => {
    const tabs = (dir?: 'ltr' | 'rtl') => <Tabs defaultValue="first" dir={dir}>
      <TabsList><TabsTrigger value="first">الأول</TabsTrigger><TabsTrigger value="second">الثاني</TabsTrigger><TabsTrigger value="third">الثالث</TabsTrigger></TabsList>
      <TabsContent value="first">محتوى أول</TabsContent><TabsContent value="second">محتوى ثانٍ</TabsContent>
    </Tabs>;
    const { rerender } = render(<Language locale="ar">{tabs()}</Language>);
    const first = screen.getByRole('tab', { name: 'الأول' });
    const second = screen.getByRole('tab', { name: 'الثاني' });
    expect(first.closest('[dir]')?.getAttribute('dir')).toBe('rtl');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(second);
    rerender(<Language locale="ar">{tabs('ltr')}</Language>);
    expect(screen.getByRole('tab', { name: 'الأول' }).closest('[dir]')?.getAttribute('dir')).toBe('ltr');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'الثالث' }));
  });

  it('keeps select direction in sync when changing between Arabic and English', () => {
    const select = <Select defaultValue="a"><SelectTrigger aria-label="اختيار"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="a">اختيار أول</SelectItem></SelectContent></Select>;
    const { rerender } = render(<Language locale="ar">{select}</Language>);
    expect(screen.getByRole('combobox').getAttribute('dir')).toBe('rtl');
    rerender(<Language locale="en">{select}</Language>);
    expect(screen.getByRole('combobox').getAttribute('dir')).toBe('ltr');
  });
});
