import { describe, it, expect } from 'vitest';
import {
  EMPTY_DERIVED,
  RESERVED_SLUGS,
  initialsFrom,
  isValidSlug,
  publicPagePath,
  publicPageCanonicalUrl,
  rowToPublicPage,
  evaluatePublicPageSeo,
  safePublicSocialUrl,
  slugify,
  type PublicPageRow,
} from '@/lib/publicPage';
import { buildCompanyNavItems } from '@/components/CompanyLayout';
import { isProKlaseOrg, PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID } from '@/lib/marketMoney';

const translate = (key: string) => key;

function row(overrides: Partial<PublicPageRow> = {}): PublicPageRow {
  return {
    id: 'p1',
    user_id: 'u1',
    organization_id: null,
    slug: 'rasa',
    owner_type: 'tutor',
    locale: 'lt',
    display_name: 'Rasa Žukauskaitė',
    headline: 'Matematika',
    bio: 'Apie mane',
    tagline_text: null,
    tagline_emphasis: null,
    photo_url: null,
    cover_url: null,
    city: null,
    languages: null,
    timezone: 'Europe/Vilnius',
    brand_color: '#3b1e6e',
    brand_color_secondary: '#8b5cf6',
    brand_color_tertiary: '#f0a884',
    accent_color: '#d9f08f',
    accent_text_color: '#26331a',
    backdrop_theme: 'plain',
    socials: null,
    published: false,
    booking_enabled: true,
    ...overrides,
  };
}

describe('public page slugs', () => {
  it('latin-folds Lithuanian diacritics instead of dropping them', () => {
    expect(slugify('Rasa Žukauskaitė')).toBe('rasa-zukauskaite');
    expect(slugify('Šarūnas Ąžuolas')).toBe('sarunas-azuolas');
  });

  it('never produces leading, trailing or doubled separators', () => {
    expect(slugify('  ...Jonas!!  ')).toBe('jonas');
    expect(slugify('a — b')).toBe('a-b');
  });

  it('rejects reserved slugs so a page cannot shadow a real route', () => {
    for (const reserved of ['login', 'blog', 'pricing', 'tutor']) {
      expect(RESERVED_SLUGS.has(reserved)).toBe(true);
      expect(isValidSlug(reserved)).toBe(false);
    }
  });

  it('accepts only lowercase kebab-case within the length bounds', () => {
    expect(isValidSlug('rasa-zukauskaite')).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('Rasa')).toBe(false);
    expect(isValidSlug('rasa--zukauskaite')).toBe(false);
    expect(isValidSlug('a'.repeat(81))).toBe(false);
  });

  it('serves the localized prefix per canonical domain', () => {
    expect(publicPagePath('rasa', 'lt')).toBe('/korepetitorius/rasa');
    expect(publicPagePath('rasa', 'en')).toBe('/tutor/rasa');
    expect(publicPagePath('claire', 'fr')).toBe('/fr/tutor/claire');
    // .pl takes the English slug, mirroring LOCALIZED_PAGE_PATHS.
    expect(publicPagePath('rasa', 'pl')).toBe('/tutor/rasa');
    expect(publicPageCanonicalUrl('claire', 'fr')).toBe('https://www.tutlio.com/fr/tutor/claire');
  });
});

describe('row → page mapping', () => {
  it('derives initials from the display name', () => {
    expect(initialsFrom('Rasa Žukauskaitė')).toBe('RŽ');
    expect(initialsFrom('Kalbų studija Demo')).toBe('KS');
    expect(initialsFrom('   ')).toBe('?');
  });

  it('offers on-site lessons only once a city is set', () => {
    expect(rowToPublicPage(row(), EMPTY_DERIVED).formats.map((f) => f.kind)).toEqual(['online']);
    expect(rowToPublicPage(row({ city: 'Kaunas' }), EMPTY_DERIVED).formats.map((f) => f.kind))
      .toEqual(['online', 'onsite']);
  });

  it('drops an empty tagline rather than rendering a blank hook', () => {
    expect(rowToPublicPage(row({ tagline_text: '   ' }), EMPTY_DERIVED).tagline).toBeUndefined();
    expect(rowToPublicPage(row({ tagline_text: 'Matematika paprasčiau' }), EMPTY_DERIVED).tagline)
      .toEqual({ text: 'Matematika paprasčiau', emphasis: undefined });
  });

  it('hides the reviews section while there are no reviews', () => {
    expect(rowToPublicPage(row(), EMPTY_DERIVED).reviewsEnabled).toBe(false);
    expect(rowToPublicPage(row(), EMPTY_DERIVED).ratingAvg).toBeNull();
  });
});

describe('public page SEO quality', () => {
  const complete = {
    slug: 'rasa-zukauskaite',
    ownerType: 'tutor' as const,
    locale: 'lt',
    displayName: 'Rasa Žukauskaitė',
    headline: 'Matematikos korepetitorė 9–12 klasėms',
    bio: 'Padedu mokiniams suprasti matematiką nuo pagrindų, pasiruošti kontroliniams darbams ir brandos egzaminui. Kiekvienam sudarau individualų mokymosi planą.',
    published: true,
    userId: 'u1',
    organizationId: null,
    offeringCount: 1,
  };

  it('keeps complete profiles indexable and reports every thin-page reason', () => {
    expect(evaluatePublicPageSeo(complete)).toEqual({ indexable: true, reasons: [] });
    const thin = evaluatePublicPageSeo({
      ...complete,
      headline: 'Math',
      bio: 'Math',
      offeringCount: 0,
    });
    expect(thin.indexable).toBe(false);
    expect(thin.reasons).toEqual(expect.arrayContaining(['short-headline', 'short-bio', 'duplicate-copy', 'missing-offering']));
  });

  it('accepts only URLs belonging to the named social network', () => {
    expect(safePublicSocialUrl('instagram', 'http://www.instagram.com/rasa')?.startsWith('https://')).toBe(true);
    expect(safePublicSocialUrl('x', 'https://twitter.com/rasa')).toContain('twitter.com/rasa');
    expect(safePublicSocialUrl('instagram', 'https://spam.example/rasa')).toBeNull();
    expect(safePublicSocialUrl('unknown', 'https://example.com')).toBeNull();
  });
});

describe('organization access to the public page', () => {
  it('excludes Pro Klasė by org id and by slug', () => {
    expect(isProKlaseOrg(PRO_KLASE_ORG_ID)).toBe(true);
    expect(isProKlaseOrg(PRO_KLASE_QA_ORG_ID)).toBe(true);
    expect(isProKlaseOrg('proklase')).toBe(true);
    expect(isProKlaseOrg('laisvi-vaikai')).toBe(false);
    expect(isProKlaseOrg(null)).toBe(false);
  });

  it('shows the nav entry for tutor organizations and schools alike', () => {
    expect(buildCompanyNavItems(false, '/company', translate, false, true).map((i) => i.href))
      .toContain('/company/public-page');
    expect(buildCompanyNavItems(true, '/school', translate, false, true).map((i) => i.href))
      .toContain('/school/public-page');
  });

  it('hides the nav entry when the organization is excluded', () => {
    expect(buildCompanyNavItems(true, '/school', translate, false, false).map((i) => i.href))
      .not.toContain('/school/public-page');
  });

  it('keeps instructions last even with the entry shown', () => {
    const paths = buildCompanyNavItems(false, '/company', translate, true, true).map((i) => i.href);
    expect(paths.at(-1)).toBe('/company/instructions');
    expect(paths.at(-2)).toBe('/company/team');
    expect(paths.at(-3)).toBe('/company/dynamic-pricing');
  });
});
