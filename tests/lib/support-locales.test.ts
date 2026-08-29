import { describe, expect, it } from 'vitest';
import {
  SUPPORT_LOCALES,
  supportGeneralFollowUp,
  supportLocaleName,
} from '../../api/_lib/supportRequest';
import { buildLocalizedPath, SUPPORTED_LOCALES, type Locale } from '../../src/lib/i18n';
import { SUPPORT_WIDGET_COPY_KEYS } from '../../src/lib/i18n/supportCopyKeys';
import { SUPPORT_PAGE_SUGGESTIONS } from '../../src/lib/supportPageSuggestions';
import { lt } from '../../src/lib/i18n/lt';
import { en } from '../../src/lib/i18n/en';
import { pl } from '../../src/lib/i18n/pl';
import { lv } from '../../src/lib/i18n/lv';
import { ee } from '../../src/lib/i18n/ee';
import { fr } from '../../src/lib/i18n/fr';
import { es } from '../../src/lib/i18n/es';
import { de } from '../../src/lib/i18n/de';
import { se } from '../../src/lib/i18n/se';
import { dk } from '../../src/lib/i18n/dk';
import { fi } from '../../src/lib/i18n/fi';
import { no } from '../../src/lib/i18n/no';
import { nl } from '../../src/lib/i18n/nl';

const dictionaries: Record<Locale, Record<string, string>> = {
  lt,
  en,
  pl,
  lv,
  ee,
  fr,
  es,
  de,
  se,
  dk,
  fi,
  no,
  nl,
};

const expectedContactCopy: Record<Locale, {
  contact: string;
  contactHint: string;
  whatsappAlternative: string;
}> = {
  lt: {
    contact: 'Susisiekti su mumis',
    contactHint: 'Įprastai atsakome per 15 min.',
    whatsappAlternative: 'arba parašykite mums per WhatsApp',
  },
  en: {
    contact: 'Contact us',
    contactHint: 'We typically reply within 15 min',
    whatsappAlternative: 'or text us via WhatsApp',
  },
  pl: {
    contact: 'Skontaktuj się z nami',
    contactHint: 'Zwykle odpowiadamy w 15 min',
    whatsappAlternative: 'lub napisz do nas na WhatsAppie',
  },
  lv: {
    contact: 'Sazinieties ar mums',
    contactHint: 'Parasti atbildam 15 minūšu laikā',
    whatsappAlternative: 'vai rakstiet mums WhatsApp',
  },
  ee: {
    contact: 'Võta meiega ühendust',
    contactHint: 'Vastame tavaliselt 15 minuti jooksul',
    whatsappAlternative: 'või kirjuta meile WhatsAppis',
  },
  fr: {
    contact: 'Nous contacter',
    contactHint: 'Nous répondons généralement sous 15 min',
    whatsappAlternative: 'ou écrivez-nous sur WhatsApp',
  },
  es: {
    contact: 'Contacta con nosotros',
    contactHint: 'Solemos responder en 15 min',
    whatsappAlternative: 'o escríbenos por WhatsApp',
  },
  de: {
    contact: 'Kontakt aufnehmen',
    contactHint: 'Wir antworten meist innerhalb von 15 Min.',
    whatsappAlternative: 'oder schreiben Sie uns per WhatsApp',
  },
  se: {
    contact: 'Kontakta oss',
    contactHint: 'Vi svarar vanligtvis inom 15 min.',
    whatsappAlternative: 'eller skriv till oss på WhatsApp',
  },
  dk: {
    contact: 'Kontakt os',
    contactHint: 'Vi svarer normalt inden for 15 min.',
    whatsappAlternative: 'eller skriv til os på WhatsApp',
  },
  fi: {
    contact: 'Ota yhteyttä',
    contactHint: 'Vastaamme yleensä 15 minuutissa',
    whatsappAlternative: 'tai lähetä meille viesti WhatsAppissa',
  },
  no: {
    contact: 'Kontakt oss',
    contactHint: 'Vi svarer vanligvis innen 15 min.',
    whatsappAlternative: 'eller skriv til oss på WhatsApp',
  },
  nl: {
    contact: 'Neem contact op',
    contactHint: 'We antwoorden meestal binnen 15 min.',
    whatsappAlternative: 'of stuur ons een bericht via WhatsApp',
  },
};

const expectedGeneralFollowUp: Record<Locale, string> = {
  lt: 'Kuo dar galiu jums padėti?',
  en: 'What else can I help you with?',
  pl: 'W czym jeszcze mogę pomóc?',
  lv: 'Ar ko vēl varu jums palīdzēt?',
  ee: 'Millega saan teid veel aidata?',
  fr: 'Comment puis-je vous aider autrement ?',
  es: '¿En qué más puedo ayudarte?',
  de: 'Wobei kann ich Ihnen noch helfen?',
  se: 'Vad mer kan jag hjälpa dig med?',
  dk: 'Hvad kan jeg ellers hjælpe dig med?',
  fi: 'Miten voin vielä auttaa?',
  no: 'Hva mer kan jeg hjelpe deg med?',
  nl: 'Waarmee kan ik je nog meer helpen?',
};

describe('support widget locale coverage', () => {
  it('keeps the browser and support API locale registries synchronized', () => {
    expect([...SUPPORT_LOCALES]).toEqual(SUPPORTED_LOCALES);
    for (const locale of SUPPORT_LOCALES) {
      expect(supportLocaleName(locale).trim().length).toBeGreaterThan(2);
    }
  });

  it.each(SUPPORTED_LOCALES)('provides every widget string in %s', (locale) => {
    const dictionary = dictionaries[locale];
    for (const key of SUPPORT_WIDGET_COPY_KEYS) {
      expect(dictionary[key], `${locale} is missing ${key}`).toBeTruthy();
      expect(dictionary[key], `${locale} leaked the translation key ${key}`).not.toBe(key);
    }
  });

  it.each(SUPPORTED_LOCALES)('keeps contact and WhatsApp copy semantically aligned in %s', (locale) => {
    const dictionary = dictionaries[locale];
    const expected = expectedContactCopy[locale];

    expect(dictionary['support.widget.contact']).toBe(expected.contact);
    expect(dictionary['support.widget.contactHint']).toBe(expected.contactHint);
    expect(dictionary['support.widget.whatsappAlternative']).toBe(expected.whatsappAlternative);
  });

  it.each(SUPPORTED_LOCALES)('provides the localized general follow-up in %s', (locale) => {
    expect(supportGeneralFollowUp(locale)).toBe(expectedGeneralFollowUp[locale]);
  });

  it.each(SUPPORTED_LOCALES)('provides every recommended-page label in %s', (locale) => {
    const dictionary = dictionaries[locale];
    for (const suggestion of Object.values(SUPPORT_PAGE_SUGGESTIONS)) {
      expect(dictionary[suggestion.labelKey], `${locale} is missing ${suggestion.labelKey}`).toBeTruthy();
    }
  });

  it.each(SUPPORTED_LOCALES)('preserves %s in recommended-page links', (locale) => {
    const localized = buildLocalizedPath('/pricing', locale, 'tutlio.com');
    expect(localized).toBe(locale === 'en' ? '/pricing' : `/${locale}/pricing`);
  });
});
