import type { BlogSchemaLocale } from '../../src/lib/i18n/localeRelease.js';

/** Local school-system + search-intent notes. Not a translation glossary. */
export const BLOG_MARKET_NOTES: Record<BlogSchemaLocale, string> = {
  lt: 'Lithuania: gimnazija, brandos egzaminai, korepetitoriai, savivaldybių mokyklos, EUR. Write for Lithuanian parents and tutors; use Lithuanian exam and school vocabulary.',
  en: 'English (tutlio.com): international / UK-adjacent tutoring (GCSEs, A-levels, IB) and EU families who read English. Do not write as if the only market is the United States. Currency examples in EUR unless a UK example is clearly labelled.',
  pl: 'Poland: szkoła podstawowa/liceum, matura, korepetycje, PLN. Polish school calendar and parent expectations.',
  lv: 'Latvia: vispārējā izglītība, centralizētie eksāmeni, privātskolotāji, EUR. Latvian school terminology.',
  ee: 'Estonia: gümnaasium, riigieksamid, eraõpetajad, EUR. Estonian school terminology.',
  fr: 'France: collège/lycée, baccalauréat, soutien scolaire, EUR. French National Education vocabulary; avoid copying Lithuanian exam names.',
  es: 'Spain: ESO/Bachillerato, selectividad/EBAU, clases particulares, EUR. Spanish school vocabulary.',
  de: 'Germany/Austria/Switzerland as relevant: Gymnasium, Abitur/Matura, Nachhilfe, EUR. German school vocabulary; do not mix with Lithuanian brandos.',
  se: 'Sweden: grundskola/gymnasium, nationella prov, läxhjälp, SEK. Swedish school vocabulary.',
  dk: 'Denmark: folkeskole/gymnasium, afgangsprøver, lektiehjælp, DKK. Danish school vocabulary.',
  fi: 'Finland: peruskoulu/lukio, ylioppilastutkinto, tukiopetus, EUR. Finnish school vocabulary.',
  no: 'Norway: ungdomsskole/vgs, eksamen, leksehjelp, NOK. Norwegian school vocabulary.',
  nl: 'Netherlands: vmbo/havo/vwo, eindexamen, bijles, EUR. Dutch school vocabulary.',
};

export const BLOG_LOCALE_LANGUAGE: Record<BlogSchemaLocale, string> = {
  lt: 'Lithuanian',
  en: 'English',
  pl: 'Polish',
  lv: 'Latvian',
  ee: 'Estonian',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  se: 'Swedish',
  dk: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  nl: 'Dutch',
};

/** Tuesday and Friday UTC — two new articles per week, fixed weekdays. */
export function isBlogAutoPublishWeekday(now = new Date()): boolean {
  const day = now.getUTCDay();
  return day === 2 || day === 5;
}

/** Generate English first (brief language), then LT slug, then other markets. */
export const BLOG_LOCALE_WRITE_ORDER: BlogSchemaLocale[] = [
  'en', 'lt', 'pl', 'de', 'fr', 'es', 'nl', 'lv', 'ee', 'se', 'dk', 'fi', 'no',
];
