import { createRequire } from 'node:module';
import type { Locale } from './seo-routing.js';

const requireDict = createRequire(import.meta.url);
const extraCache: Partial<Record<Locale, Record<string, string>>> = {};

/**
 * Extra UI dictionaries (everything beyond the 13 legacy locales) are loaded on
 * first use rather than imported statically: importing all 36 at module load
 * blew the Vercel cold-start memory limit on the email and invite functions.
 *
 * Two loaders share one cache:
 * - `preloadExtraLocaleDict` uses real dynamic `import()` with literal paths
 *   (traced by Vercel, resolved to .ts by Vite/vitest/tsx). Server renderers
 *   await it through `preloadSsrLocales` before rendering.
 * - `loadExtraLocaleDict` is the synchronous fallback for callers that cannot
 *   await (email copy). It uses `require`, which works on Vercel's compiled
 *   output and under tsx but not under vitest, so tests must preload first.
 */
type DictModule = Record<string, Record<string, string>>;

const IMPORTERS: Partial<Record<Locale, () => Promise<DictModule>>> = {
  it: () => import('../../src/lib/i18n/it.js') as Promise<DictModule>,
  fil: () => import('../../src/lib/i18n/fil.js') as Promise<DictModule>,
  th: () => import('../../src/lib/i18n/th.js') as Promise<DictModule>,
  tr: () => import('../../src/lib/i18n/tr.js') as Promise<DictModule>,
  'zh-hk': () => import('../../src/lib/i18n/zh-hk.js') as Promise<DictModule>,
  pt: () => import('../../src/lib/i18n/pt.js') as Promise<DictModule>,
  ro: () => import('../../src/lib/i18n/ro.js') as Promise<DictModule>,
  cs: () => import('../../src/lib/i18n/cs.js') as Promise<DictModule>,
  el: () => import('../../src/lib/i18n/el.js') as Promise<DictModule>,
  hu: () => import('../../src/lib/i18n/hu.js') as Promise<DictModule>,
  bg: () => import('../../src/lib/i18n/bg.js') as Promise<DictModule>,
  hr: () => import('../../src/lib/i18n/hr.js') as Promise<DictModule>,
  sk: () => import('../../src/lib/i18n/sk.js') as Promise<DictModule>,
  sl: () => import('../../src/lib/i18n/sl.js') as Promise<DictModule>,
  hi: () => import('../../src/lib/i18n/hi.js') as Promise<DictModule>,
  ko: () => import('../../src/lib/i18n/ko.js') as Promise<DictModule>,
  ja: () => import('../../src/lib/i18n/ja.js') as Promise<DictModule>,
  id: () => import('../../src/lib/i18n/id.js') as Promise<DictModule>,
  ar: () => import('../../src/lib/i18n/ar.js') as Promise<DictModule>,
  he: () => import('../../src/lib/i18n/he.js') as Promise<DictModule>,
  uk: () => import('../../src/lib/i18n/uk.js') as Promise<DictModule>,
  'pt-br': () => import('../../src/lib/i18n/pt-br.js') as Promise<DictModule>,
  'es-mx': () => import('../../src/lib/i18n/es-mx.js') as Promise<DictModule>,
};

/** Dictionary export name: `zh-hk` → `zhHk`, `pt-br` → `ptBr`, otherwise the code itself. */
function exportName(locale: Locale): string {
  return locale.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function pickExport(locale: Locale, mod: DictModule | undefined): Record<string, string> | undefined {
  if (!mod) return undefined;
  const dict = mod[exportName(locale)] ?? mod[locale] ?? mod.default;
  return dict && typeof dict === 'object' ? dict : undefined;
}

export async function preloadExtraLocaleDict(locale: Locale): Promise<Record<string, string> | undefined> {
  if (extraCache[locale]) return extraCache[locale];
  const importer = IMPORTERS[locale];
  if (!importer) return undefined;
  try {
    const dict = pickExport(locale, await importer());
    if (dict) extraCache[locale] = dict;
    return dict;
  } catch {
    return undefined;
  }
}

function requireEither(locale: Locale): Record<string, string> | undefined {
  const name = exportName(locale);
  for (const ext of ['js', 'ts']) {
    try {
      const mod = requireDict(`../../src/lib/i18n/${locale}.${ext}`) as DictModule;
      const dict = mod[name] ?? mod[locale] ?? mod.default;
      if (dict && typeof dict === 'object') return dict;
    } catch {
      /* try the next extension */
    }
  }
  return undefined;
}

/** Synchronous access; returns undefined until the dictionary is loaded. */
export function loadExtraLocaleDict(locale: Locale): Record<string, string> | undefined {
  if (extraCache[locale]) return extraCache[locale];
  if (!IMPORTERS[locale]) return undefined;
  const dict = requireEither(locale);
  if (dict) extraCache[locale] = dict;
  return dict;
}
