import { createRequire } from 'node:module';
import type { Locale } from './seo-routing.js';

const requireDict = createRequire(import.meta.url);
const extraCache: Partial<Record<Locale, Record<string, string>>> = {};

function pick(
  js: () => Record<string, string>,
  ts: () => Record<string, string>,
): Record<string, string> | undefined {
  try {
    return js();
  } catch {
    try {
      return ts();
    } catch {
      return undefined;
    }
  }
}

/**
 * Load one extra UI dictionary on first use.
 * Paths are static so Vercel file tracing still copies the files, but Node
 * does not evaluate them on cold start (unlike `import { ar } from '.../ar.js'`).
 */
export function loadExtraLocaleDict(locale: Locale): Record<string, string> | undefined {
  if (extraCache[locale]) return extraCache[locale];
  let dict: Record<string, string> | undefined;
  switch (locale) {
    case 'it':
      dict = pick(() => requireDict('../../src/lib/i18n/it.js').it, () => requireDict('../../src/lib/i18n/it.ts').it);
      break;
    case 'fil':
      dict = pick(() => requireDict('../../src/lib/i18n/fil.js').fil, () => requireDict('../../src/lib/i18n/fil.ts').fil);
      break;
    case 'th':
      dict = pick(() => requireDict('../../src/lib/i18n/th.js').th, () => requireDict('../../src/lib/i18n/th.ts').th);
      break;
    case 'tr':
      dict = pick(() => requireDict('../../src/lib/i18n/tr.js').tr, () => requireDict('../../src/lib/i18n/tr.ts').tr);
      break;
    case 'zh-hk':
      dict = pick(() => requireDict('../../src/lib/i18n/zh-hk.js').zhHk, () => requireDict('../../src/lib/i18n/zh-hk.ts').zhHk);
      break;
    case 'pt':
      dict = pick(() => requireDict('../../src/lib/i18n/pt.js').pt, () => requireDict('../../src/lib/i18n/pt.ts').pt);
      break;
    case 'ro':
      dict = pick(() => requireDict('../../src/lib/i18n/ro.js').ro, () => requireDict('../../src/lib/i18n/ro.ts').ro);
      break;
    case 'cs':
      dict = pick(() => requireDict('../../src/lib/i18n/cs.js').cs, () => requireDict('../../src/lib/i18n/cs.ts').cs);
      break;
    case 'el':
      dict = pick(() => requireDict('../../src/lib/i18n/el.js').el, () => requireDict('../../src/lib/i18n/el.ts').el);
      break;
    case 'hu':
      dict = pick(() => requireDict('../../src/lib/i18n/hu.js').hu, () => requireDict('../../src/lib/i18n/hu.ts').hu);
      break;
    case 'bg':
      dict = pick(() => requireDict('../../src/lib/i18n/bg.js').bg, () => requireDict('../../src/lib/i18n/bg.ts').bg);
      break;
    case 'hr':
      dict = pick(() => requireDict('../../src/lib/i18n/hr.js').hr, () => requireDict('../../src/lib/i18n/hr.ts').hr);
      break;
    case 'sk':
      dict = pick(() => requireDict('../../src/lib/i18n/sk.js').sk, () => requireDict('../../src/lib/i18n/sk.ts').sk);
      break;
    case 'sl':
      dict = pick(() => requireDict('../../src/lib/i18n/sl.js').sl, () => requireDict('../../src/lib/i18n/sl.ts').sl);
      break;
    case 'hi':
      dict = pick(() => requireDict('../../src/lib/i18n/hi.js').hi, () => requireDict('../../src/lib/i18n/hi.ts').hi);
      break;
    case 'ko':
      dict = pick(() => requireDict('../../src/lib/i18n/ko.js').ko, () => requireDict('../../src/lib/i18n/ko.ts').ko);
      break;
    case 'ja':
      dict = pick(() => requireDict('../../src/lib/i18n/ja.js').ja, () => requireDict('../../src/lib/i18n/ja.ts').ja);
      break;
    case 'id':
      dict = pick(() => requireDict('../../src/lib/i18n/id.js').id, () => requireDict('../../src/lib/i18n/id.ts').id);
      break;
    case 'ar':
      dict = pick(() => requireDict('../../src/lib/i18n/ar.js').ar, () => requireDict('../../src/lib/i18n/ar.ts').ar);
      break;
    case 'he':
      dict = pick(() => requireDict('../../src/lib/i18n/he.js').he, () => requireDict('../../src/lib/i18n/he.ts').he);
      break;
    case 'uk':
      dict = pick(() => requireDict('../../src/lib/i18n/uk.js').uk, () => requireDict('../../src/lib/i18n/uk.ts').uk);
      break;
    case 'pt-br':
      dict = pick(() => requireDict('../../src/lib/i18n/pt-br.js').ptBr, () => requireDict('../../src/lib/i18n/pt-br.ts').ptBr);
      break;
    case 'es-mx':
      dict = pick(() => requireDict('../../src/lib/i18n/es-mx.js').esMx, () => requireDict('../../src/lib/i18n/es-mx.ts').esMx);
      break;
    default:
      return undefined;
  }
  if (dict) extraCache[locale] = dict;
  return dict;
}
