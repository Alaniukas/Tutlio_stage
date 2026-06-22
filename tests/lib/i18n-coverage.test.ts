import { describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { lt } from '../../src/lib/i18n/lt';
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

/**
 * core.ts resolves a key as `dict[key] ?? en[key] ?? lt[key] ?? key`, so any
 * locale missing a key silently renders in English (or Lithuanian) instead of
 * the intended language. en + lt are the two always-bundled base dictionaries,
 * so the union of their keys is the canonical set the app can request. Every
 * locale must cover it fully to stay 100% translated (e.g. tutlio.pl in Polish).
 */
const reference = [...new Set([...Object.keys(en), ...Object.keys(lt)])];

const locales: Record<string, Record<string, string>> = { lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no };

describe('i18n locale coverage — no fallback leaks', () => {
  for (const [name, dict] of Object.entries(locales)) {
    it(`${name} translates every key (no English/Lithuanian fallback)`, () => {
      const missing = reference.filter((key) => !(key in dict));
      expect(missing, `${name}.ts is missing ${missing.length} key(s):\n${missing.join('\n')}`).toEqual([]);
    });
  }
});
