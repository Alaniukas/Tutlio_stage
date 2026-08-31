import type { Locale } from './i18n/locales';

/** Stable editorial byline for auto + SSR schema (Person, not a fake LinkedIn). */
export const BLOG_AUTHOR_NAME = 'Elena Norkūnė';

export const BLOG_AUTHOR_ROLE: Record<Locale, string> = {
  lt: 'Švietimo rinkos redaktorė, Tutlio',
  en: 'Education market editor, Tutlio',
  pl: 'Redaktorka rynku edukacji, Tutlio',
  lv: 'Izglītības tirgus redaktore, Tutlio',
  ee: 'Haridusturu toimetaja, Tutlio',
  fr: 'Rédactrice marché de l’éducation, Tutlio',
  es: 'Editora del mercado educativo, Tutlio',
  de: 'Redakteurin für den Bildungsmarkt, Tutlio',
  se: 'Utbildningsmarknadsredaktör, Tutlio',
  dk: 'Redaktør for uddannelsesmarkedet, Tutlio',
  fi: 'Koulutusmarkkinoiden toimittaja, Tutlio',
  no: 'Redaktør for utdanningsmarkedet, Tutlio',
  nl: 'Redacteur onderwijsmarkt, Tutlio',
};

export function blogAuthorRole(locale: Locale): string {
  return BLOG_AUTHOR_ROLE[locale] || BLOG_AUTHOR_ROLE.en;
}

export function blogAuthorJsonLd(locale: Locale) {
  return {
    '@type': 'Person' as const,
    name: BLOG_AUTHOR_NAME,
    jobTitle: blogAuthorRole(locale),
    worksFor: {
      '@type': 'Organization' as const,
      name: 'Tutlio',
      url: 'https://www.tutlio.com',
    },
  };
}
