import type Stripe from 'stripe';
import { SUPPORTED_LOCALES, type Locale } from '../../src/lib/i18n/locales.js';

// Presentation only. Never derive prices, currencies or account eligibility here.
// https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-locale
const CHECKOUT_LOCALES: Record<Locale, Stripe.Checkout.SessionCreateParams.Locale> = {
  lt: 'lt', en: 'en', pl: 'pl', lv: 'lv', ee: 'et', fr: 'fr', es: 'es',
  de: 'de', se: 'sv', dk: 'da', fi: 'fi', no: 'nb', nl: 'nl',
  it: 'it', pt: 'pt', ro: 'ro', cs: 'cs', el: 'el', hu: 'hu', bg: 'bg',
  hr: 'hr', sk: 'sk', sl: 'sl', ko: 'ko', ja: 'ja', id: 'id',
  'pt-br': 'pt-BR', 'es-mx': 'es-419', fil: 'fil', 'zh-hk': 'zh-HK',
  tr: 'tr', th: 'th',
  // These UI languages are unavailable in Checkout. Use explicit English.
  ar: 'en', he: 'en', hi: 'en', uk: 'en',
};

export function stripeCheckoutLocale(locale: unknown): Stripe.Checkout.SessionCreateParams.Locale {
  return typeof locale === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? CHECKOUT_LOCALES[locale as Locale]
    : 'lt';
}
