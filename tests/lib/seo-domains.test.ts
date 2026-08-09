import { describe, it, expect } from 'vitest';
import {
  LOCALES,
  canonicalDomain,
  getDefaultLocale,
  buildCanonicalUrl,
  buildPlatformPath,
  buildPlatformCanonicalUrl,
  buildPublicPageCanonicalUrl,
  localizedPagePath,
  generateHreflangLinks,
  generateHreflangLinksFor,
} from '../../api/_lib/seo-routing.js';
import { localizedPagePath as spaLocalizedPagePath } from '../../src/lib/i18n/index.js';
import {
  ssrDestination,
  canonicalSlugRedirect,
  defaultLocale as middlewareDefaultLocale,
  defaultLocaleStripRedirect,
  crossDomainLocaleRedirect,
  sameDomainCanonicalPath,
  canonicalPublicPagePrefixRedirect,
  isBrowserNavigation,
} from '../../middleware.js';
import { STATIC_PAGES, alternatesXmlFor, publicPageBelongsInSitemap } from '../../api/sitemap.js';

function botRequest(url: string, host: string): Request {
  return new Request(url, { headers: { host, 'user-agent': 'Googlebot' } });
}

describe('tutlio.pl as canonical Polish domain', () => {
  it('maps pl locale to the .pl domain, lt to .lt, the rest to .com', () => {
    expect(canonicalDomain('pl')).toBe('pl');
    expect(canonicalDomain('lt')).toBe('lt');
    for (const locale of LOCALES.filter((l) => l !== 'pl' && l !== 'lt')) {
      expect(canonicalDomain(locale)).toBe('com');
    }
  });

  it('uses pl as the default locale on the .pl domain', () => {
    expect(getDefaultLocale('pl')).toBe('pl');
    expect(middlewareDefaultLocale('www.tutlio.pl')).toBe('pl');
    expect(middlewareDefaultLocale('www.tutlio.com')).toBe('en');
    expect(middlewareDefaultLocale('www.tutlio.lt')).toBe('lt');
  });

  it('canonicalizes pl URLs to tutlio.pl without a locale prefix', () => {
    expect(buildCanonicalUrl('/', 'pl')).toBe('https://www.tutlio.pl/');
    expect(buildCanonicalUrl('/pricing', 'pl')).toBe('https://www.tutlio.pl/pricing');
    expect(buildCanonicalUrl('/pricing', 'de')).toBe('https://www.tutlio.com/de/pricing');
  });

  it('emits the .pl domain in hreflang clusters with x-default on .com', () => {
    const links = generateHreflangLinks('/pricing');
    expect(links.find((l) => l.lang === 'pl')?.href).toBe('https://www.tutlio.pl/pricing');
    expect(links.find((l) => l.lang === 'lt')?.href).toBe('https://www.tutlio.lt/pricing');
    expect(links.find((l) => l.lang === 'x-default')?.href).toBe('https://www.tutlio.com/pricing');
  });
});

describe('platform-prefixed (schools) URLs', () => {
  it('nests the locale after the platform prefix', () => {
    expect(buildPlatformPath('/schools', '/', 'en', 'com')).toBe('/schools');
    expect(buildPlatformPath('/schools', '/pricing', 'en', 'com')).toBe('/schools/pricing');
    expect(buildPlatformPath('/schools', '/pricing', 'fr', 'com')).toBe('/schools/fr/pricing');
    expect(buildPlatformPath('/schools', '/', 'lt', 'lt')).toBe('/schools');
  });

  it('builds cross-domain canonical schools URLs', () => {
    expect(buildPlatformCanonicalUrl('/schools', '/', 'en')).toBe('https://www.tutlio.com/schools');
    expect(buildPlatformCanonicalUrl('/schools', '/', 'lt')).toBe('https://www.tutlio.lt/schools');
    expect(buildPlatformCanonicalUrl('/schools', '/', 'pl')).toBe('https://www.tutlio.pl/schools');
    expect(buildPlatformCanonicalUrl('/schools', '/pricing', 'ee')).toBe('https://www.tutlio.com/schools/ee/pricing');
  });

  it('keeps the hreflang cluster complete for schools pages', () => {
    const links = generateHreflangLinksFor((l) => buildPlatformCanonicalUrl('/schools', '/', l));
    expect(links).toHaveLength(14);
    expect(links.find((l) => l.lang === 'x-default')?.href).toBe('https://www.tutlio.com/schools');
  });
});

describe('public tutor/agency canonical URLs', () => {
  it('uses one canonical domain and locale path for the page authored locale', () => {
    expect(buildPublicPageCanonicalUrl('rasa', 'lt')).toBe('https://www.tutlio.lt/korepetitorius/rasa');
    expect(buildPublicPageCanonicalUrl('anna', 'en')).toBe('https://www.tutlio.com/tutor/anna');
    expect(buildPublicPageCanonicalUrl('claire', 'fr')).toBe('https://www.tutlio.com/fr/tutor/claire');
    expect(buildPublicPageCanonicalUrl('ewa', 'pl')).toBe('https://www.tutlio.pl/tutor/ewa');
  });

  it('redirects the non-canonical profile noun for every visitor', () => {
    expect(canonicalPublicPagePrefixRedirect('/tutor/rasa', 'www.tutlio.lt'))
      .toBe('/korepetitorius/rasa');
    expect(canonicalPublicPagePrefixRedirect('/korepetitorius/anna', 'www.tutlio.com'))
      .toBe('/tutor/anna');
    expect(canonicalPublicPagePrefixRedirect('/fr/korepetitorius/claire', 'www.tutlio.com'))
      .toBe('/fr/tutor/claire');
    expect(canonicalPublicPagePrefixRedirect('/fr/tutor/claire', 'www.tutlio.com')).toBeNull();
  });
});

describe('domain-flavored about/contact slugs', () => {
  it('keeps Lithuanian slugs for lt, English everywhere else', () => {
    expect(localizedPagePath('about', 'lt')).toBe('/apie-mus');
    expect(localizedPagePath('contacts', 'lt')).toBe('/kontaktai');
    for (const locale of LOCALES.filter((l) => l !== 'lt')) {
      expect(localizedPagePath('about', locale)).toBe('/about');
      expect(localizedPagePath('contacts', locale)).toBe('/contacts');
    }
  });

  it('SPA helper stays in sync with the API helper', () => {
    for (const locale of LOCALES) {
      expect(spaLocalizedPagePath('about', locale)).toBe(localizedPagePath('about', locale));
      expect(spaLocalizedPagePath('contacts', locale)).toBe(localizedPagePath('contacts', locale));
    }
  });
});

describe('middleware canonical-slug 308 redirects', () => {
  it('redirects the alias to the canonical slug per locale', () => {
    expect(canonicalSlugRedirect('/about', 'www.tutlio.lt')).toBe('/apie-mus');
    expect(canonicalSlugRedirect('/contacts', 'www.tutlio.lt')).toBe('/kontaktai');
    expect(canonicalSlugRedirect('/apie-mus', 'www.tutlio.com')).toBe('/about');
    expect(canonicalSlugRedirect('/kontaktai', 'www.tutlio.pl')).toBe('/contacts');
    expect(canonicalSlugRedirect('/fr/apie-mus', 'www.tutlio.com')).toBe('/fr/about');
    expect(canonicalSlugRedirect('/lt/about', 'www.tutlio.com')).toBe('/lt/apie-mus');
  });

  it('does not redirect canonical slugs or unrelated paths', () => {
    expect(canonicalSlugRedirect('/apie-mus', 'www.tutlio.lt')).toBeNull();
    expect(canonicalSlugRedirect('/about', 'www.tutlio.com')).toBeNull();
    expect(canonicalSlugRedirect('/pricing', 'www.tutlio.com')).toBeNull();
    expect(canonicalSlugRedirect('/schools/about', 'www.tutlio.com')).toBeNull();
    expect(canonicalSlugRedirect('/robots.txt', 'www.tutlio.com')).toBeNull();
  });
});

describe('middleware SSR routing', () => {
  it('distinguishes real browser navigations from unknown crawler-like clients', () => {
    const browser = new Request('https://www.tutlio.com/fr', {
      headers: {
        host: 'www.tutlio.com',
        'user-agent': 'Mozilla/5.0',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
      },
    });
    const unknownCrawler = new Request('https://www.tutlio.com/fr', {
      headers: { host: 'www.tutlio.com', 'user-agent': 'NewSearchCrawler/1.0' },
    });

    expect(isBrowserNavigation(browser)).toBe(true);
    expect(isBrowserNavigation(unknownCrawler)).toBe(false);
  });

  it('keeps browser UAs on the SPA path when Fetch Metadata is normalized', () => {
    const browser = new Request('https://www.tutlio.com/fr', {
      headers: {
        host: 'www.tutlio.com',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        'sec-fetch-mode': 'cors',
      },
    });
    const crawler = new Request('https://www.tutlio.com/fr', {
      headers: {
        host: 'www.tutlio.com',
        'user-agent': 'Mozilla/5.0 (compatible; NewSearchCrawler/1.0)',
      },
    });

    expect(isBrowserNavigation(browser)).toBe(true);
    expect(isBrowserNavigation(crawler)).toBe(false);
  });

  it('routes /schools and /teachers to the schools renderer', () => {
    expect(ssrDestination(botRequest('https://www.tutlio.com/schools', 'www.tutlio.com')))
      .toBe('/api/schools-render?page=landing&locale=en');
    expect(ssrDestination(botRequest('https://www.tutlio.com/schools/pricing', 'www.tutlio.com')))
      .toBe('/api/schools-render?page=pricing&locale=en');
    expect(ssrDestination(botRequest('https://www.tutlio.com/schools/fr/pricing', 'www.tutlio.com')))
      .toBe('/api/schools-render?page=pricing&locale=fr');
    expect(ssrDestination(botRequest('https://www.tutlio.com/teachers', 'www.tutlio.com')))
      .toBe('/api/schools-render?page=landing&locale=en');
    expect(ssrDestination(botRequest('https://www.tutlio.lt/schools', 'www.tutlio.lt')))
      .toBe('/api/schools-render?page=landing&locale=lt');
  });

  it('uses pl as default locale for SSR on tutlio.pl', () => {
    expect(ssrDestination(botRequest('https://www.tutlio.pl/', 'www.tutlio.pl')))
      .toBe('/api/page-render?page=landing&locale=pl');
    expect(ssrDestination(botRequest('https://www.tutlio.pl/pricing', 'www.tutlio.pl')))
      .toBe('/api/page-render?page=pricing&locale=pl');
    expect(ssrDestination(botRequest('https://www.tutlio.lt/features', 'www.tutlio.lt')))
      .toBe('/api/features-index-render?locale=lt');
    expect(ssrDestination(botRequest('https://www.tutlio.com/en/features', 'www.tutlio.com')))
      .toBe('/api/features-index-render?locale=en');
  });

  it('returns null (→ 404) for unknown marketing-shaped URLs', () => {
    expect(ssrDestination(botRequest('https://www.tutlio.com/foo-bar', 'www.tutlio.com'))).toBeNull();
    expect(ssrDestination(botRequest('https://www.tutlio.com/xx/pricing', 'www.tutlio.com'))).toBeNull();
    expect(ssrDestination(botRequest('https://www.tutlio.com/features/unknown', 'www.tutlio.com'))).toBeNull();
    expect(ssrDestination(botRequest('https://www.tutlio.com/schools/blog', 'www.tutlio.com'))).toBeNull();
  });

  it('routes canonical public tutor pages to their renderer', () => {
    expect(ssrDestination(botRequest('https://www.tutlio.com/tutor/anna', 'www.tutlio.com')))
      .toBe('/api/public-page-render?slug=anna&locale=en&requestedPath=%2Ftutor%2Fanna');
    expect(ssrDestination(botRequest('https://www.tutlio.com/fr/tutor/claire', 'www.tutlio.com')))
      .toBe('/api/public-page-render?slug=claire&locale=fr&requestedPath=%2Ffr%2Ftutor%2Fclaire');
  });
});

describe('sitemap', () => {
  const completeProfile = {
    slug: 'rasa-math',
    locale: 'lt',
    owner_type: 'tutor',
    user_id: 'tutor-1',
    organization_id: null,
    display_name: 'Rasa Žukauskaitė',
    headline: 'Matematikos korepetitorė 9–12 klasėms',
    bio: 'Padedu mokiniams suprasti matematiką nuo pagrindų, pasiruošti kontroliniams darbams ir brandos egzaminui. Kiekvienam sudarau individualų mokymosi planą.',
    published: true,
  };

  it('only admits complete, owned profiles with real offerings', () => {
    expect(publicPageBelongsInSitemap(completeProfile, new Set(['tutor-1']))).toBe(true);
    expect(publicPageBelongsInSitemap(completeProfile, new Set())).toBe(false);
    expect(publicPageBelongsInSitemap({ ...completeProfile, bio: 'Trumpai apie mane.' }, new Set(['tutor-1']))).toBe(false);
    expect(publicPageBelongsInSitemap({ ...completeProfile, user_id: null }, new Set(['tutor-1']))).toBe(false);
    expect(publicPageBelongsInSitemap({ ...completeProfile, published: false }, new Set(['tutor-1']))).toBe(false);
  });

  it('allows a complete organization profile without a tutor subject', () => {
    expect(publicPageBelongsInSitemap({
      ...completeProfile,
      slug: 'kalbu-studija',
      owner_type: 'organization',
      user_id: null,
      organization_id: 'org-1',
    }, new Set())).toBe(true);
  });

  it('includes schools pages and domain-flavored about/contact slugs', () => {
    const urls = STATIC_PAGES.map((p) => p.urlFor('en'));
    expect(urls).toContain('https://www.tutlio.com/schools');
    expect(urls).toContain('https://www.tutlio.com/schools/pricing');
    expect(urls).toContain('https://www.tutlio.com/about');
    expect(urls).toContain('https://www.tutlio.com/contacts');
    expect(urls).toContain('https://www.tutlio.com/features');
    expect(urls).toContain('https://www.tutlio.com/features/digital-business-card');

    const ltUrls = STATIC_PAGES.map((p) => p.urlFor('lt'));
    expect(ltUrls).toContain('https://www.tutlio.lt/apie-mus');
    expect(ltUrls).toContain('https://www.tutlio.lt/kontaktai');

    const plUrls = STATIC_PAGES.map((p) => p.urlFor('pl'));
    expect(plUrls).toContain('https://www.tutlio.pl/about');
    expect(plUrls).toContain('https://www.tutlio.pl/schools');
  });

  it('emits reciprocal cross-domain alternates for every static page', () => {
    for (const page of STATIC_PAGES) {
      const xml = alternatesXmlFor(page.urlFor);
      expect(xml).toContain('https://www.tutlio.lt');
      expect(xml).toContain('https://www.tutlio.pl');
      expect(xml).toContain('https://www.tutlio.com');
      expect(xml).toContain('hreflang="x-default"');
    }
  });

  it('limits blog alternates to translated locales and drops x-default without an EN translation', () => {
    const urlFor = (l: (typeof LOCALES)[number]) => buildCanonicalUrl('/blog/test', l);
    const noEn = alternatesXmlFor(urlFor, ['lt', 'pl'], false);
    expect(noEn).not.toContain('x-default');
    expect(noEn).toContain('hreflang="lt"');
    expect(noEn).toContain('hreflang="pl"');
    expect(noEn).not.toContain('hreflang="de"');

    const withEn = alternatesXmlFor(urlFor, ['lt', 'en'], true);
    expect(withEn).toContain('x-default');
  });
});

describe('default-locale prefix strip redirect (all visitors)', () => {
  it('strips the default-locale prefix on each domain', () => {
    expect(defaultLocaleStripRedirect('/en', 'www.tutlio.com')).toBe('/');
    expect(defaultLocaleStripRedirect('/en/', 'www.tutlio.com')).toBe('/');
    expect(defaultLocaleStripRedirect('/en/pricing', 'www.tutlio.com')).toBe('/pricing');
    expect(defaultLocaleStripRedirect('/en/blog/some-post', 'www.tutlio.com')).toBe('/blog/some-post');
    expect(defaultLocaleStripRedirect('/lt', 'www.tutlio.lt')).toBe('/');
    expect(defaultLocaleStripRedirect('/lt/pricing', 'www.tutlio.lt')).toBe('/pricing');
    expect(defaultLocaleStripRedirect('/pl/pricing', 'www.tutlio.pl')).toBe('/pricing');
  });

  it('strips the default locale nested after a platform prefix', () => {
    expect(defaultLocaleStripRedirect('/schools/en', 'www.tutlio.com')).toBe('/schools');
    expect(defaultLocaleStripRedirect('/schools/en/pricing', 'www.tutlio.com')).toBe('/schools/pricing');
    expect(defaultLocaleStripRedirect('/teachers/lt', 'www.tutlio.lt')).toBe('/teachers');
  });

  it('leaves non-default locales, bare paths, and unknown segments alone', () => {
    expect(defaultLocaleStripRedirect('/lt/pricing', 'www.tutlio.com')).toBeNull();
    expect(defaultLocaleStripRedirect('/fr/pricing', 'www.tutlio.com')).toBeNull();
    expect(defaultLocaleStripRedirect('/en/pricing', 'www.tutlio.lt')).toBeNull();
    expect(defaultLocaleStripRedirect('/pricing', 'www.tutlio.com')).toBeNull();
    expect(defaultLocaleStripRedirect('/', 'www.tutlio.com')).toBeNull();
    expect(defaultLocaleStripRedirect('/schools', 'www.tutlio.com')).toBeNull();
    expect(defaultLocaleStripRedirect('/english/pricing', 'www.tutlio.com')).toBeNull();
  });

  it('strips locale-prefixed app routes to their bare SPA path', () => {
    expect(defaultLocaleStripRedirect('/en/login', 'www.tutlio.com')).toBe('/login');
    expect(defaultLocaleStripRedirect('/lt/register', 'www.tutlio.lt')).toBe('/register');
  });
});

describe('cross-domain locale redirect (bots)', () => {
  it('sends wrong-domain locales to their canonical domain, dropping a now-default prefix', () => {
    expect(crossDomainLocaleRedirect('/lt', 'www.tutlio.com')).toBe('https://www.tutlio.lt/');
    expect(crossDomainLocaleRedirect('/lt/pricing', 'www.tutlio.com')).toBe('https://www.tutlio.lt/pricing');
    expect(crossDomainLocaleRedirect('/pl/pricing', 'www.tutlio.com')).toBe('https://www.tutlio.pl/pricing');
    expect(crossDomainLocaleRedirect('/en/pricing', 'www.tutlio.lt')).toBe('https://www.tutlio.com/pricing');
    expect(crossDomainLocaleRedirect('/lt/blog/irasas', 'www.tutlio.com')).toBe('https://www.tutlio.lt/blog/irasas');
  });

  it('keeps the locale prefix when it is not the default on the target domain', () => {
    expect(crossDomainLocaleRedirect('/fr/pricing', 'www.tutlio.lt')).toBe('https://www.tutlio.com/fr/pricing');
    expect(crossDomainLocaleRedirect('/de', 'www.tutlio.lt')).toBe('https://www.tutlio.com/de');
    expect(crossDomainLocaleRedirect('/se/features/calendar', 'www.tutlio.pl')).toBe('https://www.tutlio.com/se/features/calendar');
  });

  it('handles platform-prefixed paths', () => {
    expect(crossDomainLocaleRedirect('/schools/lt/pricing', 'www.tutlio.com')).toBe('https://www.tutlio.lt/schools/pricing');
    expect(crossDomainLocaleRedirect('/schools/fr', 'www.tutlio.lt')).toBe('https://www.tutlio.com/schools/fr');
  });

  it('returns null for same-domain locales, unprefixed paths, and unknown hosts', () => {
    expect(crossDomainLocaleRedirect('/fr/pricing', 'www.tutlio.com')).toBeNull();
    expect(crossDomainLocaleRedirect('/lt/pricing', 'www.tutlio.lt')).toBeNull();
    expect(crossDomainLocaleRedirect('/pricing', 'www.tutlio.com')).toBeNull();
    expect(crossDomainLocaleRedirect('/', 'www.tutlio.com')).toBeNull();
    expect(crossDomainLocaleRedirect('/lt/pricing', 'tutlio-abc123.vercel.app')).toBeNull();
  });
});

describe('sameDomainCanonicalPath (single-hop URL canonicalization)', () => {
  it('strips trailing slashes', () => {
    expect(sameDomainCanonicalPath('/pricing/', 'www.tutlio.com')).toBe('/pricing');
    expect(sameDomainCanonicalPath('/blog/post/', 'www.tutlio.lt')).toBe('/blog/post');
    expect(sameDomainCanonicalPath('/', 'www.tutlio.com')).toBeNull();
  });

  it('collapses slash + default-locale prefix + slug alias into one hop', () => {
    expect(sameDomainCanonicalPath('/en/apie-mus', 'www.tutlio.com')).toBe('/about');
    expect(sameDomainCanonicalPath('/en/apie-mus/', 'www.tutlio.com')).toBe('/about');
    expect(sameDomainCanonicalPath('/lt/about/', 'www.tutlio.lt')).toBe('/apie-mus');
    expect(sameDomainCanonicalPath('/en/pricing/', 'www.tutlio.com')).toBe('/pricing');
  });

  it('returns null for already-canonical paths', () => {
    expect(sameDomainCanonicalPath('/pricing', 'www.tutlio.com')).toBeNull();
    expect(sameDomainCanonicalPath('/about', 'www.tutlio.com')).toBeNull();
    expect(sameDomainCanonicalPath('/apie-mus', 'www.tutlio.lt')).toBeNull();
    expect(sameDomainCanonicalPath('/fr/pricing', 'www.tutlio.com')).toBeNull();
    expect(sameDomainCanonicalPath('/schools', 'www.tutlio.lt')).toBeNull();
  });
});
