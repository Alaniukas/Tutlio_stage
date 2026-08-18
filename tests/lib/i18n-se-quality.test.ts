import { beforeAll, describe, expect, it } from 'vitest';
import { loadLocaleDict, t } from '../../src/lib/i18n/core';
import { en } from '../../src/lib/i18n/en';
import { lt } from '../../src/lib/i18n/lt';
import { se } from '../../src/lib/i18n/se';
import { sharedOrganizationWorkflowTranslations } from '../../src/lib/i18n/sharedOrganizationWorkflowTranslations';

const reference = [...new Set([
  ...Object.keys(en),
  ...Object.keys(lt),
  ...Object.keys(sharedOrganizationWorkflowTranslations),
])].filter((key) => !key.startsWith('quiz.'));

const legalKeys = new Set(['tos.bodyHtml', 'priv.bodyHtml', 'dpa.bodyHtml']);

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
  .map((match) => match[1])
  .sort();

const htmlTags = (value: string) => [...value.matchAll(/<(\/?)([A-Za-z][\w-]*)\b[^>]*>/g)]
  .map((match) => `${match[1]}${match[2].toLowerCase()}`);

// These EN entries are incomplete, but their call sites provide the listed
// parameters. Swedish keeps the intended runtime copy instead of reproducing
// the broken source text.
const runtimePlaceholderCases: Array<[string, Record<string, string | number>]> = [
  ['cal.addStudentsSuccess', { count: 2 }],
  ['cal.cancelledCount', { count: 3 }],
  ['cal.groupFull', { max: 5 }],
  ['cal.notEnoughSpots', { needed: 2, available: 1 }],
  ['cal.studentGrade', { grade: 8 }],
  ['cal.syncSendFailed', { error: 'fel' }],
  ['cal.syncSessionError', { error: 'fel' }],
  ['cal.syncSuccess', { sessions: 4, avail: 2 }],
  ['compSch.seriesSummaryHtml', { fromDate: '2026-08-10', timeRange: '16:00–17:00', weekday: 'måndag' }],
  ['compStu.cancellationInfo', { hours: 24, percent: 50 }],
  ['compStu.packageSent', { name: 'Anna' }],
  ['compStu.pricingSaveFailed', { msg: 'fel' }],
  ['em.afterLessonStudentPart', { student: 'Anna' }],
  ['em.invoiceBody', { tutor: 'Erik', period: 'augusti', studentPart: ' för Anna' }],
  ['em.packageSuccessBody', { count: 5, label: 'lektioner', subject: 'matematik' }],
  ['finance.deadlineWarning', { hours: 24 }],
  ['invoice.emailNote', { days: 14 }],
  ['orgFinance.completedLessons', { range: '2026-08-01–2026-08-31' }],
  ['register.orgInvite', { orgName: 'Skolan' }],
  ['stuSched.queueClosedDesc', { deadline: '2026-08-10 18:00' }],
];

const sourcePlaceholderDefects = new Set(runtimePlaceholderCases.map(([key]) => key));

beforeAll(async () => {
  await loadLocaleDict('se');
});

describe('Swedish locale quality regressions', () => {
  it('has exact coverage and no unintended empty translations', () => {
    const missing = reference.filter((key) => !(key in se));
    const extra = Object.keys(se).filter((key) => !reference.includes(key));
    const unintendedEmpty = reference.filter((key) => se[key] === '' && (en[key] ?? lt[key] ?? '') !== '');

    expect(missing, `Swedish is missing:\n${missing.join('\n')}`).toEqual([]);
    expect(extra, `Swedish has unknown keys:\n${extra.join('\n')}`).toEqual([]);
    expect(unintendedEmpty, `Swedish has empty translations:\n${unintendedEmpty.join('\n')}`).toEqual([]);
  });

  it('overrides every temporary English organization-workflow string', () => {
    const unchanged = Object.entries(sharedOrganizationWorkflowTranslations)
      .filter(([key, englishValue]) => se[key] === englishValue)
      .map(([key]) => key);

    expect(unchanged, `Swedish still renders English for:\n${unchanged.join('\n')}`).toEqual([]);
  });

  it('preserves source placeholders except for documented source defects', () => {
    const mismatches = reference.filter((key) => {
      if (sourcePlaceholderDefects.has(key)) return false;
      const source = en[key] ?? lt[key] ?? sharedOrganizationWorkflowTranslations[key] ?? '';
      return JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(se[key] ?? ''));
    });

    expect(mismatches, `Swedish placeholder mismatch for:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it.each(runtimePlaceholderCases)('%s resolves all runtime placeholders', (key, params) => {
    expect(t('se', key, params)).not.toMatch(/\{[^}]+\}/);
  });

  it('preserves source HTML tag structure', () => {
    const mismatches = reference.filter((key) => {
      const source = en[key] ?? lt[key] ?? sharedOrganizationWorkflowTranslations[key] ?? '';
      return JSON.stringify(htmlTags(source)) !== JSON.stringify(htmlTags(se[key] ?? ''));
    });

    expect(mismatches, `Swedish HTML tag mismatch for:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('does not retain unchanged English prose', () => {
    const permitted = new Set(['companyWait.inQueueSince', 'nav.brandSchools']);
    const unchanged = reference.filter((key) => {
      const source = en[key];
      return typeof source === 'string'
        && se[key] === source
        && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(source)
        && !permitted.has(key);
    });

    expect(unchanged, `Swedish still contains English prose:\n${unchanged.join('\n')}`).toEqual([]);
  });

  it('does not translate terse EN labels when LT contains the user-facing explanation', () => {
    const permittedConciseCopy = new Set(['onboard.joinTutor', 'pricing.freeTrial']);
    const plainText = (value: string) => value.replace(/<[^>]+>|\{[^}]+\}/g, ' ').trim();
    const omissions = reference.filter((key) => {
      if (permittedConciseCopy.has(key)) return false;
      const english = plainText(en[key] ?? '');
      const lithuanian = plainText(lt[key] ?? '');
      const swedish = plainText(se[key] ?? '');
      return english.split(/\s+/).length <= 4
        && lithuanian.length > english.length * 2.4
        && lithuanian.length > 35
        && swedish.length < english.length * 2;
    });

    expect(omissions, `Swedish copy is suspiciously abbreviated for:\n${omissions.join('\n')}`).toEqual([]);
  });

  it('avoids machine-translation residue and visible plural hacks', () => {
    const uiCopy = Object.entries(se)
      .filter(([key]) => !legalKeys.has(key))
      .map(([, value]) => value)
      .join('\n');

    expect(uiCopy).not.toMatch(/handledare|handledningscenter|e-postnotering|prisnotering|sammanfattningsnotering|föräldra-e-post/i);
    expect(uiCopy).not.toMatch(/(?:lektion|faktura|kommentar)\((?:er|or)\)|faktura\/fakturor/i);
    expect(uiCopy).not.toContain('„');
    expect(uiCopy).not.toMatch(/€(?:\d|\{)/);
    expect(uiCopy).not.toMatch(/(?:\d|\})%/);
  });

  it('does not contain nonfunctional HTML anchors', () => {
    const keys = Object.entries(se)
      .filter(([, value]) => /<a(?=\s|>)(?![^>]*\bhref=)[^>]*>/i.test(value))
      .map(([key]) => key);

    expect(keys, `Swedish contains inert links in:\n${keys.join('\n')}`).toEqual([]);
  });

  it('keeps critical Swedish meanings explicit', () => {
    expect(se['auth.saveNewPassword']).toBe('Spara det nya lösenordet');
    expect(se['settings.monthlyPlan']).toBe('Månadsvis');
    expect(se['companyWait.notesPlaceholder']).toBe('Skriv anteckningar…');
    expect(se['status.completed']).toBe('Genomförd');
    expect(se['compSch.trialPriceNote']).toContain('provlektion');
    expect(se['em.manualPkgActivation']).toContain('aktiveras');
    expect(se['cal.recurringNoEndHint']).not.toMatch(/två år|2 år/i);
    expect(se['landing.trustText']).toContain('världen');
    expect(se['onboard.emailPlaceholder']).toBe('namn@exempel.se');
  });
});
