import { describe, expect, it } from 'vitest';
import { USD_LOCALES, isUsdLocale, stripeCurrencyCode, subscriptionCurrencyFor } from '../../src/lib/localeCurrency';
import { LEGACY_LOCALES, PENDING_TRANSLATION_LOCALES, SUPPORTED_LOCALES } from '../../src/lib/i18n/locales';
import { TUTOR_PLANS, TUTOR_PLANS_USD, eur, usd } from '../../src/lib/pricing';

describe('subscription currency by market and locale', () => {
  it('keeps tutlio.pl on PLN whatever the interface language', () => {
    for (const locale of SUPPORTED_LOCALES) expect(subscriptionCurrencyFor('pl', locale)).toBe('PLN');
  });

  it('keeps every legacy locale on EUR outside Poland', () => {
    for (const locale of LEGACY_LOCALES) {
      if (locale === 'pl') continue;
      expect(subscriptionCurrencyFor('default', locale)).toBe('EUR');
    }
  });

  it('bills euro-area newcomers in EUR and the rest of the pending locales in USD', () => {
    const euroArea = ['it', 'pt', 'el', 'sk', 'sl', 'hr', 'bg'];
    for (const locale of PENDING_TRANSLATION_LOCALES) {
      const expected = euroArea.includes(locale) ? 'EUR' : 'USD';
      expect(subscriptionCurrencyFor('default', locale), locale).toBe(expected);
    }
    expect(USD_LOCALES.length + euroArea.length).toBe(PENDING_TRANSLATION_LOCALES.length);
  });

  it('falls back to EUR without a locale and never treats unknown codes as USD', () => {
    expect(subscriptionCurrencyFor('default')).toBe('EUR');
    expect(subscriptionCurrencyFor('default', null)).toBe('EUR');
    expect(isUsdLocale('xx')).toBe(false);
    expect(stripeCurrencyCode('USD')).toBe('usd');
  });

  it('prices USD at parity with EUR and formats like the EUR helper', () => {
    expect(TUTOR_PLANS_USD.monthly.pricePerMonth).toBe(TUTOR_PLANS.monthly.pricePerMonthEur);
    expect(TUTOR_PLANS_USD.yearly.pricePerYear).toBe(TUTOR_PLANS.yearly.pricePerYearEur);
    expect(TUTOR_PLANS_USD.subscriptionOnly.pricePerMonth).toBe(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur);
    expect(usd(19.99)).toBe('$19.99');
    expect(usd(35)).toBe('$35');
    expect(eur(35)).toBe('€35');
  });
});
