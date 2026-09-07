/**
 * Lists marketing/SEO-surface dictionary keys whose value in a locale is still
 * byte-identical to English, i.e. untranslated fallbacks that crawlers would
 * see under a foreign lang code. Prefix filter matches the keys the server
 * renderers use for the search-published surfaces.
 *
 *   npx tsx scripts/i18n-marketing-gaps.ts            # all pending locales
 *   npx tsx scripts/i18n-marketing-gaps.ts it tr      # a subset
 */
import { en } from '../src/lib/i18n/en.js';
import { PENDING_TRANSLATION_LOCALES, type Locale } from '../src/lib/i18n/locales.js';

const MARKETING = /^(landing|feature|featuresIndex|pricing|about|contact|schoolsLanding|compare|nav|footer)\./;
const requested = process.argv.slice(2).filter((a) => !a.startsWith('-')) as Locale[];
const locales = requested.length ? requested : [...PENDING_TRANSLATION_LOCALES];

const union = new Map<string, string[]>();
for (const locale of locales) {
  const mod = await import(`../src/lib/i18n/${locale}.js`);
  const exportName = locale.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const dict: Record<string, string> = mod[exportName] ?? mod[locale] ?? Object.values(mod)[0];
  const gaps = Object.keys(en)
    .filter((k) => MARKETING.test(k) && String(en[k]).length > 3 && dict[k] === en[k])
    // Brand names and identical-in-every-language tokens are not gaps.
    .filter((k) => !/^(Tutlio|Stripe|Google Calendar|Blog|FAQ|PDF|Excel|WhatsApp|Email|E-mail|OK)$/i.test(String(en[k])));
  const missing = Object.keys(en).filter((k) => MARKETING.test(k) && !(k in dict));
  console.log(`${locale.padEnd(6)} identical-to-English marketing keys: ${String(gaps.length).padStart(3)}   missing outright: ${missing.length}`);
  for (const k of [...gaps, ...missing]) union.set(k, [...(union.get(k) ?? []), locale]);
}

const rows = [...union.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`\n${rows.length} distinct keys need translation in at least one locale:`);
for (const [key, locs] of rows) {
  const value = String(en[key]);
  console.log(`  ${key}  [${locs.length}: ${locs.join(' ')}]\n      EN: ${value.length > 110 ? value.slice(0, 110) + '…' : value}`);
}
