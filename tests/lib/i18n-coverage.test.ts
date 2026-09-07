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
import { nl } from '../../src/lib/i18n/nl';
import { sharedOrganizationWorkflowTranslations } from '../../src/lib/i18n/sharedOrganizationWorkflowTranslations';

/**
 * core.ts resolves a key as `dict[key] ?? en[key] ?? lt[key] ?? key`, so any
 * locale missing a key silently renders in English (or Lithuanian) instead of
 * the intended language. en + lt are the two always-bundled base dictionaries,
 * so the union of their keys is the canonical set the app can request. Every
 * locale must cover it fully to stay 100% translated (e.g. tutlio.pl in Polish).
 */
const isQuizKey = (key: string) => key.startsWith('quiz.');
/** Competitor comparisons (/compare) are hand-written market content that
 * exists only in the languages search-published for that surface
 * (SEO_LOCALES_BY_SURFACE.compare: en, lt, pl); other locales render them
 * noindex. Their completeness in those three dictionaries is enforced by
 * tests/lib/seo-visibility.test.ts, so they are not a fallback leak here. */
const isCompareKey = (key: string) => key.startsWith('compare.');
const reference = [...new Set([...Object.keys(en), ...Object.keys(lt)])].filter((key) => !isQuizKey(key) && !isCompareKey(key));
const quizReference = [...new Set([...Object.keys(en), ...Object.keys(lt)])].filter(isQuizKey);

const locales: Record<string, Record<string, string>> = { lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no, nl };

describe('i18n locale coverage — no fallback leaks', () => {
  for (const [name, dict] of Object.entries(locales)) {
    it(`${name} translates every key (no English/Lithuanian fallback)`, () => {
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

  it('lv overrides every shared English organization workflow string', () => {
    const inheritedEnglish = Object.keys(sharedOrganizationWorkflowTranslations)
      .filter((key) => lv[key] === sharedOrganizationWorkflowTranslations[key]);

    expect(
      inheritedEnglish,
      `lv.ts still inherits ${inheritedEnglish.length} English workflow string(s):\n${inheritedEnglish.join('\n')}`,
    ).toEqual([]);
  });

  it('lv preserves every source placeholder', () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key];
      return placeholders(source).join('|') !== placeholders(lv[key] ?? '').join('|');
    });

    expect(
      mismatches,
      `lv.ts has ${mismatches.length} placeholder mismatch(es):\n${mismatches.join('\n')}`,
    ).toEqual([]);
  });

  it('lv preserves source HTML tag structure', () => {
    const tags = (value: string) => [...value.matchAll(/<(\/?)([A-Za-z][\w-]*)\b[^>]*>/g)]
      .map((match) => `${match[1]}${match[2].toLowerCase()}`);
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key] ?? '';
      return JSON.stringify(tags(source)) !== JSON.stringify(tags(lv[key] ?? ''));
    });

    expect(
      mismatches,
      `lv.ts has ${mismatches.length} HTML tag mismatch(es):\n${mismatches.join('\n')}`,
    ).toEqual([]);
  });

  it('lv does not retain unchanged English prose', () => {
    const permittedNonProseKeys = new Set(['companyWait.inQueueSince', 'nav.brandSchools']);
    const unchangedEnglish = reference.filter((key) => {
      const source = en[key];
      return typeof source === 'string'
        && lv[key] === source
        && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(source)
        && !permittedNonProseKeys.has(key);
    });

    expect(
      unchangedEnglish,
      `lv.ts still contains unchanged English prose:\n${unchangedEnglish.join('\n')}`,
    ).toEqual([]);
  });
});

describe('Estonian locale quality guards', () => {
  it('overrides every temporary English organization-workflow string', () => {
    const validIdenticalTerms = new Set(['publicEditor.linkLabel']);
    const unchanged = Object.entries(sharedOrganizationWorkflowTranslations)
      .filter(([key, englishValue]) => ee[key] === englishValue && !validIdenticalTerms.has(key))
      .map(([key]) => key);

    expect(unchanged, `Estonian still renders English for:\n${unchanged.join('\n')}`).toEqual([]);
  });

  it('preserves all source placeholders', () => {
    const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
      .map((match) => match[1])
      .sort();
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key] ?? '';
      return JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(ee[key] ?? ''));
    });

    expect(mismatches, `Estonian placeholder mismatch for:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('preserves source HTML tag structure', () => {
    const tags = (value: string) => [...value.matchAll(/<(\/?)([A-Za-z][\w-]*)\b[^>]*>/g)]
      .map((match) => `${match[1]}${match[2].toLowerCase()}`);
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key] ?? '';
      return JSON.stringify(tags(source)) !== JSON.stringify(tags(ee[key] ?? ''));
    });

    expect(mismatches, `Estonian HTML tag mismatch for:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('uses count-neutral wording for variable quantities', () => {
    const fixedCountNoun = /\{(?:count|n|pending|available|total|lessons|days|hours|frequency)\}\s+(?:tundi|tunni|päeva|õpilast|õpetajat|arvet|makset|sessiooni|litsentsi|kommentaari|sõnumit|arvustust|paketti|kirjet|osamakset|kutset)\b/i;
    const pseudoPlural = /(?:õpilas|tund|arve|osamakse)\(t\)|tund\(i\)/i;
    const mismatches = Object.entries(ee)
      .filter(([, value]) => fixedCountNoun.test(value) || pseudoPlural.test(value))
      .map(([key]) => key);

    expect(mismatches, `Estonian strings require count-neutral wording:\n${mismatches.join('\n')}`).toEqual([]);
  });
});

describe('Polish locale quality guards', () => {
  it('overrides every temporary English organization-workflow string', () => {
    const unchanged = Object.entries(sharedOrganizationWorkflowTranslations)
      .filter(([key, englishValue]) => pl[key] === englishValue)
      .map(([key]) => key);

    expect(unchanged, `Polish still renders English for:\n${unchanged.join('\n')}`).toEqual([]);
  });

  it('preserves all source placeholders', () => {
    const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
      .map((match) => match[1])
      .sort();
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key] ?? '';
      return JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(pl[key] ?? ''));
    });

    expect(mismatches, `Polish placeholder mismatch for:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('preserves source HTML tag structure', () => {
    const tags = (value: string) => [...value.matchAll(/<(\/?)([A-Za-z][\w-]*)\b[^>]*>/g)]
      .map((match) => `${match[1]}${match[2].toLowerCase()}`);
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key] ?? '';
      return JSON.stringify(tags(source)) !== JSON.stringify(tags(pl[key] ?? ''));
    });

    expect(mismatches, `Polish HTML tag mismatch for:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('does not use mismatched Polish quotation marks', () => {
    const mismatches = Object.entries(pl)
      .filter(([, value]) => /„[^”]*"/.test(value))
      .map(([key]) => key);

    expect(mismatches, `Polish strings use an ASCII closing quote:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('avoids fixed Polish noun forms directly after variable counts', () => {
    const fixedCountNoun = /\{(?:count|n|pending|available|total|lessons|days|hours)\}\s+(?:lekcj\w*|uczni\w*|faktur\w*|rat\w*|umów|licencj\w*|dni|godzin\w*|korepetytor\w*)/i;
    const mismatches = Object.entries(pl)
      .filter(([, value]) => fixedCountNoun.test(value))
      .map(([key]) => key);

    expect(mismatches, `Polish strings require count-neutral wording or plural rules:\n${mismatches.join('\n')}`).toEqual([]);
  });
});

describe('Spanish locale quality guards', () => {
  it('overrides every temporary English organization-workflow string', () => {
    const unchanged = Object.entries(sharedOrganizationWorkflowTranslations)
      .filter(([key, englishValue]) => es[key] === englishValue)
      .map(([key]) => key);

    expect(unchanged, `Spanish still renders English for:\n${unchanged.join('\n')}`).toEqual([]);
  });

  it('preserves all source placeholders', () => {
    const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
      .map((match) => match[1])
      .sort();
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key] ?? '';
      return JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(es[key] ?? ''));
    });

    expect(mismatches, `Spanish placeholder mismatch for:\n${mismatches.join('\n')}`).toEqual([]);
  });
});
