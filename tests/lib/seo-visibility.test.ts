import { describe, it, expect } from 'vitest';
import {
  LOCALES,
  hreflangCode,
  generateHreflangLinks,
  hreflangTags,
} from '../../api/_lib/seo-routing.js';
import {
  BOT_UA,
  LOCALES as MIDDLEWARE_LOCALES,
  FEATURES as MIDDLEWARE_FEATURES,
  APP_ROUTES,
} from '../../middleware.js';
import { DISALLOW_PATHS } from '../../api/robots.js';
import { FEATURE_PAGES, FEATURE_PAGE_IDS } from '../../src/lib/featurePages.js';
import { en } from '../../src/lib/i18n/en.js';
import { lt } from '../../src/lib/i18n/lt.js';

// ISO 639-1 language codes valid as hreflang values for our markets.
const VALID_LANGUAGE_CODES = new Set([
  'lt', 'en', 'pl', 'lv', 'et', 'fr', 'es', 'de', 'sv', 'da', 'fi', 'no',
]);

describe('hreflang language codes', () => {
  it('maps country-flavored slugs to real ISO 639-1 language codes', () => {
    expect(hreflangCode('ee')).toBe('et'); // Estonian, not Ewe
    expect(hreflangCode('se')).toBe('sv'); // Swedish, not Northern Sami
    expect(hreflangCode('dk')).toBe('da'); // Danish ("dk" is not a language)
  });

  it('keeps already-valid codes unchanged', () => {
    for (const locale of ['lt', 'en', 'pl', 'lv', 'fr', 'es', 'de', 'fi', 'no'] as const) {
      expect(hreflangCode(locale)).toBe(locale);
    }
  });

  it('produces a valid language code for every locale', () => {
    for (const locale of LOCALES) {
      expect(VALID_LANGUAGE_CODES.has(hreflangCode(locale))).toBe(true);
    }
  });

  it('emits mapped codes in hreflang links while URLs keep internal slugs', () => {
    const links = generateHreflangLinks('/pricing');
    const langs = links.map((l) => l.lang);

    expect(langs).toContain('et');
    expect(langs).toContain('sv');
    expect(langs).toContain('da');
    expect(langs).not.toContain('ee');
    expect(langs).not.toContain('dk');
    // 12 locales + x-default
    expect(links).toHaveLength(13);

    const et = links.find((l) => l.lang === 'et');
    expect(et?.href).toBe('https://www.tutlio.com/ee/pricing');
    const sv = links.find((l) => l.lang === 'sv');
    expect(sv?.href).toBe('https://www.tutlio.com/se/pricing');
  });

  it('keeps lt on the .lt domain and x-default on .com', () => {
    const links = generateHreflangLinks('/');
    expect(links.find((l) => l.lang === 'lt')?.href).toBe('https://www.tutlio.lt/');
    expect(links.find((l) => l.lang === 'x-default')?.href).toBe('https://www.tutlio.com/');
  });

  it('renders hreflang tags without invalid codes', () => {
    const html = hreflangTags('/pricing');
    expect(html).toContain('hreflang="et"');
    expect(html).toContain('hreflang="sv"');
    expect(html).toContain('hreflang="da"');
    expect(html).not.toContain('hreflang="ee"');
    expect(html).not.toContain('hreflang="se"');
    expect(html).not.toContain('hreflang="dk"');
  });
});

describe('bot user-agent detection (middleware)', () => {
  const SHOULD_MATCH = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    // AI search and assistant crawlers — required for LLM citations.
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'Mozilla/5.0 (compatible; Claude-Web/1.0)',
    'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    'Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
    // Training-data crawlers — Common Crawl feeds most LLM corpora.
    'CCBot/2.0 (https://commoncrawl.org/faq/)',
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Mozilla/5.0 (compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)',
    'DuckAssistBot/1.0; (+http://www.duckduckgo.com)',
    'Mozilla/5.0 (compatible; YouBot/1.0; +https://about.you.com/youbot/)',
    'Mozilla/5.0 (compatible; cohere-training-data-crawler/1.0)',
  ];

  const SHOULD_NOT_MATCH = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  ];

  it.each(SHOULD_MATCH)('serves SSR to: %s', (ua) => {
    expect(BOT_UA.test(ua)).toBe(true);
  });

  it.each(SHOULD_NOT_MATCH)('serves the SPA to humans: %s', (ua) => {
    expect(BOT_UA.test(ua)).toBe(false);
  });
});

describe('middleware stays in sync with shared SEO config', () => {
  it('middleware locales match seo-routing locales', () => {
    expect([...MIDDLEWARE_LOCALES].sort()).toEqual([...LOCALES].sort());
  });

  it('middleware feature slugs match the shared feature-page config', () => {
    expect([...MIDDLEWARE_FEATURES].sort()).toEqual([...FEATURE_PAGE_IDS].sort());
  });

  it('middleware APP_ROUTES match robots.txt disallow paths', () => {
    const disallowSegments = DISALLOW_PATHS
      .map((p) => p.replace(/^\//, '').replace(/\/$/, ''))
      .filter((p) => p !== 'api');
    // Every robots-disallowed surface keeps its SPA shell in middleware…
    for (const segment of disallowSegments) {
      expect(APP_ROUTES.has(segment), `APP_ROUTES missing "${segment}"`).toBe(true);
    }
    // …and middleware never shelters a route robots does not also disallow.
    for (const route of APP_ROUTES) {
      expect(disallowSegments, `robots.txt missing "${route}"`).toContain(route);
    }
  });
});

describe('feature page config integrity', () => {
  it('every feature page has translations for all content keys (en + lt)', () => {
    for (const dict of [en, lt]) {
      for (const id of FEATURE_PAGE_IDS) {
        const cfg = FEATURE_PAGES[id];
        expect(dict[cfg.titleKey], cfg.titleKey).toBeTruthy();
        expect(dict[cfg.descKey], cfg.descKey).toBeTruthy();
        expect(dict[`feature.${id}.detailsTitle`], `feature.${id}.detailsTitle`).toBeTruthy();
        for (const k of cfg.detailKeys) {
          expect(dict[`feature.${id}.${k}`], `feature.${id}.${k}`).toBeTruthy();
          expect(dict[`feature.${id}.${k}Desc`], `feature.${id}.${k}Desc`).toBeTruthy();
        }
        for (const k of cfg.faqKeys) {
          expect(dict[`feature.${id}.faq.${k}Q`], `feature.${id}.faq.${k}Q`).toBeTruthy();
          expect(dict[`feature.${id}.faq.${k}A`], `feature.${id}.faq.${k}A`).toBeTruthy();
        }
      }
    }
  });

  it('feature page paths match their ids', () => {
    for (const id of FEATURE_PAGE_IDS) {
      expect(FEATURE_PAGES[id].path).toBe(`/features/${id}`);
    }
  });
});

describe('schools SSR content integrity', () => {
  it('every key rendered by schools-render has translations (en + lt)', async () => {
    const { SCHOOLS_FEATURE_KEYS, SCHOOLS_HIGHLIGHT_KEYS } = await import('../../api/schools-render.js');
    const baseKeys = [
      'schoolsLanding.heroTitle', 'schoolsLanding.heroTitleHighlight', 'schoolsLanding.heroSubtitle',
      'schoolsLanding.heroCta', 'schoolsLanding.stepsTitle', 'schoolsLanding.stepsDesc',
      'schoolsLanding.featuresHeading', 'schoolsLanding.featuresHighlight', 'schoolsLanding.featuresSubtitle',
      'schoolsLanding.highlightsTitle', 'schoolsLanding.highlightsHighlight', 'schoolsLanding.highlightsSubtitle',
      'schoolsLanding.highlightsBadge', 'schoolsLanding.integCta',
      'schoolsLanding.ctaBannerTitle', 'schoolsLanding.ctaBannerDesc', 'schoolsLanding.ctaBannerBtn',
      ...[1, 2, 3].flatMap((n) => [`schoolsLanding.step${n}Title`, `schoolsLanding.step${n}Desc`]),
      ...SCHOOLS_FEATURE_KEYS.flatMap((k: string) => [
        `schoolsLanding.feat.${k}`, `schoolsLanding.feat.${k}Desc`,
        `schoolsLanding.feat.${k}B1`, `schoolsLanding.feat.${k}B2`, `schoolsLanding.feat.${k}B3`,
      ]),
      ...SCHOOLS_HIGHLIGHT_KEYS.flatMap((k: string) => [`schoolsLanding.hl.${k}`, `schoolsLanding.hl.${k}Desc`]),
    ];
    for (const dict of [en, lt]) {
      for (const key of baseKeys) {
        expect(dict[key], key).toBeTruthy();
      }
    }
  });
});
