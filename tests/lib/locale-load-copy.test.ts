import { beforeAll, describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, loadLocaleDict, t } from '@/lib/i18n/core';
import { LOCALE_LOAD_COPY } from '@/lib/i18n/localeLoadCopy';

beforeAll(() => Promise.all(SUPPORTED_LOCALES.map(loadLocaleDict)));
describe('standalone locale recovery copy', () => {
  it.each(SUPPORTED_LOCALES)('%s matches existing translated labels without eagerly importing dictionaries', (locale) => {
    expect(LOCALE_LOAD_COPY[locale]).toEqual({
      loading: t(locale, 'common.loading'), error: t(locale, 'files.downloadFailed'), retry: t(locale, 'stuSess.retry'),
      reload: t(locale, 'common.reloadPage'), reloadWarning: t(locale, 'common.reloadPageWarning'),
    });
    for (const text of Object.values(LOCALE_LOAD_COPY[locale])) expect(text).not.toMatch(/^(common|files|stuSess)\./);
  });
});
