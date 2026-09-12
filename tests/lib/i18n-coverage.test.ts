import { describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { lt } from '../../src/lib/i18n/lt';

/** Coverage is enforced only for the two always-bundled base dictionaries. */
const COVERAGE_LOCALES = ['lt', 'en'] as const;

/**
 * core.ts resolves a key as `dict[key] ?? en[key] ?? lt[key] ?? key`, so any
 * locale missing a key silently renders in English (or Lithuanian) instead of
 * the intended language. en + lt are the two always-bundled base dictionaries,
 * so the union of their keys is the canonical set the app can request.
 */
const isQuizKey = (key: string) => key.startsWith('quiz.');
/** Competitor comparisons (/compare) are hand-written market content that
 * exists only in the languages search-published for that surface
 * (SEO_LOCALES_BY_SURFACE.compare: en, lt, pl); other locales render them
 * noindex. Their completeness in those three dictionaries is enforced by
 * tests/lib/seo-visibility.test.ts, so they are not a fallback leak here. */
const isCompareKey = (key: string) => key.startsWith('compare.');
/** MV first-lesson tutor notify — Lithuanian copy only; not part of the lt/en parity set. */
const isMvLtOnlyKey = (key: string) =>
  key.startsWith('em.mvFirstLesson') || key.startsWith('push.mv_first_lesson_planned_tutor');
const reference = [...new Set([...Object.keys(en), ...Object.keys(lt)])].filter(
  (key) => !isQuizKey(key) && !isCompareKey(key) && !isMvLtOnlyKey(key),
);
const quizReference = [...new Set([...Object.keys(en), ...Object.keys(lt)])].filter(isQuizKey);

const locales: Record<(typeof COVERAGE_LOCALES)[number], Record<string, string>> = { lt, en };

describe('i18n locale coverage — no fallback leaks (lt + en only)', () => {
  for (const name of COVERAGE_LOCALES) {
    it(`${name} translates every key (no English/Lithuanian fallback)`, () => {
      const dict = locales[name];
      const missing = reference.filter((key) => !(key in dict));
      expect(missing, `${name}.ts is missing ${missing.length} key(s):\n${missing.join('\n')}`).toEqual([]);
    });
  }

  it('keeps the intentionally LT/EN-only quiz dictionaries in sync', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
    const missing = quizReference.filter((key) => !(key in en) || !(key in lt));
    const mismatches = quizReference.filter(
      (key) => placeholders(en[key] ?? '').join('|') !== placeholders(lt[key] ?? '').join('|'),
    );

    expect(missing, `Quiz translations missing from LT or EN:\n${missing.join('\n')}`).toEqual([]);
    expect(mismatches, `Quiz placeholder mismatch:\n${mismatches.join('\n')}`).toEqual([]);
  });
});
