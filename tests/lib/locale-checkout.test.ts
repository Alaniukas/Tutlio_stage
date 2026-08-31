import { describe, expect, it } from 'vitest';
import { stripeCheckoutLocale } from '../../api/_lib/stripeLocale';

describe('Stripe presentation locale', () => {
  it.each([
    ['ee', 'et'], ['dk', 'da'], ['se', 'sv'], ['no', 'nb'],
    ['pt-br', 'pt-BR'], ['es-mx', 'es-419'], ['zh-hk', 'zh-HK'],
    ['it', 'it'], ['fil', 'fil'], ['th', 'th'], ['tr', 'tr'], ['cs', 'cs'],
  ])('maps %s to the supported Checkout code %s', (input, expected) => {
    expect(stripeCheckoutLocale(input)).toBe(expected);
  });
  it.each(['ar', 'he', 'hi', 'uk'])('falls back to English for %s', (locale) => {
    expect(stripeCheckoutLocale(locale)).toBe('en');
  });
  it('retains the legacy default for absent or invalid inputs', () => {
    expect(stripeCheckoutLocale(undefined)).toBe('lt');
    expect(stripeCheckoutLocale('not-a-locale')).toBe('lt');
  });
});
