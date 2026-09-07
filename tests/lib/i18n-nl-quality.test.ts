import { beforeAll, describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { lt } from '../../src/lib/i18n/lt';
import { nl } from '../../src/lib/i18n/nl';
import { nlQuiz } from '../../src/lib/i18n/nlQuiz';
import { sharedOrganizationWorkflowTranslations } from '../../src/lib/i18n/sharedOrganizationWorkflowTranslations';
import { loadLocaleDict, t, tHtml } from '../../src/lib/i18n/core';
import { t as emailText } from '../../api/_lib/i18n';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { CHROME, chromeFor, formatShortDay, groupSlotsByDay, publicPageCanonicalUrl } from '../../src/lib/publicPage';
import { formatPublicPageSlotTime, publicPageSlotDay, publicPageTimeZone } from '../../src/lib/publicPageTime';
import { getLocalizedPhonePlaceholder, validateLocalizedPhone } from '../../src/lib/utils';
import { LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales';

const reference = [...new Set([
  ...Object.keys(en), ...Object.keys(lt), ...Object.keys(sharedOrganizationWorkflowTranslations),
])];
const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m => m[1]).sort();
const tags = (text: string) => [...text.matchAll(/<(\/?)([A-Za-z][\w-]*)\b[^>]*>/g)].map(m => `${m[1]}${m[2].toLowerCase()}`);

// The EN/LT dictionaries contain abbreviated or damaged source strings. These
// parameters come from the actual callers, not from a blanket parity exemption.
const callerParams: Record<string, Record<string, string | number>> = {
  'cal.addStudentsSuccess': { count: 2 },
  'cal.cancelledCount': { count: 2 },
  'cal.groupFull': { max: 3 },
  'cal.notEnoughSpots': { needed: 3, available: 1 },
  'cal.studentGrade': { name: 'Noor', grade: 4 },
  'cal.syncSuccess': { sessions: 3, avail: 2 },
  'compSch.seriesSummaryHtml': { fromDate: '2026-09-01', weekday: 'dinsdag', timeRange: '16:00–17:00' },
  'compStu.cancellationInfo': { hours: 24, percent: 50 },
  'compStu.packageSent': { name: 'Noor' },
  'companyWait.inQueueSince': { date: '1 september 2026' },
  'em.afterLessonStudentPart': { student: 'Noor' },
  'em.invoiceBody': { tutor: 'Sanne', period: 'september', studentPart: ' voor leerling Noor' },
  'em.invoiceStudentPart': { student: 'Noor' },
  'em.packageReqStudentPart': { student: 'Noor' },
  'em.packageSuccessBody': { count: 1, label: 'les', subject: 'wiskunde' },
  'em.payReminderTiming': { hours: 24, timing: 'vóór de les' },
  'finance.deadlineWarning': { hours: 24 },
  'invoice.emailNote': { days: 14 },
  'orgFinance.completedLessons': { range: 'september 2026' },
  'register.orgInvite': { orgName: 'Bijlesvoorbeeld' },
  'stuSched.queueClosedDesc': { deadline: '1 september 2026 16:00' },
  'studentWait.addedOn': { date: '1 september' },
};

beforeAll(async () => { await loadLocaleDict('nl'); });

describe('Dutch locale production contracts', () => {
  it('covers the entire source dictionary, including the quiz and organization workflows', () => {
    expect(reference.filter(key => !Object.hasOwn(nl, key))).toEqual([]);
    expect(reference.filter(key => (en[key] ?? lt[key]) && !nl[key])).toEqual([]);
    expect(Object.keys(nlQuiz).sort()).toEqual(reference.filter(key => key.startsWith('quiz.')).sort());
  });

  it('overrides the temporary English team/access baseline', () => {
    // Accountant is also the correct Dutch role name.
    expect(Object.entries(sharedOrganizationWorkflowTranslations)
      .filter(([key, value]) => key !== 'orgTeam.role.accountant' && nl[key] === value)
      .map(([key]) => key)).toEqual([]);
  });

  it('does not silently retain English prose', () => {
    const allowed = new Set([
      'invoiceCreate.perWeek', 'layout.tutlioSchool', 'nav.brandSchools',
      'quiz.audience.school.title', // "Online school" is idiomatic Dutch too.
      'quiz.info.story.company.customerName', 'quiz.offer.testimonial.company.name1',
      'quiz.info.story.school.customerName', 'quiz.offer.testimonial.school.name1',
    ]);
    expect(reference.filter(key => !allowed.has(key) && typeof en[key] === 'string'
      && nl[key] === en[key] && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(en[key]))).toEqual([]);
  });

  it('preserves interpolation parameters, including recovered caller contracts', () => {
    expect(reference.filter(key => {
      const expected = callerParams[key]
        ? Object.keys(callerParams[key]).sort()
        : placeholders(en[key] ?? lt[key] ?? sharedOrganizationWorkflowTranslations[key]);
      return JSON.stringify(placeholders(nl[key] ?? '')) !== JSON.stringify(expected);
    })).toEqual([]);
  });

  it.each(Object.entries(callerParams))('%s retains every value supplied by its caller', (key, params) => {
    const rendered = t('nl', key, params);
    expect(rendered).not.toMatch(/\{[^}]+\}/);
    for (const value of Object.values(params)) expect(rendered).toContain(String(value));
  });

  it('preserves HTML structure and functional links', () => {
    expect(reference.filter(key => JSON.stringify(tags(nl[key] ?? ''))
      !== JSON.stringify(tags(en[key] ?? lt[key] ?? sharedOrganizationWorkflowTranslations[key])))).toEqual([]);
    expect(Object.entries(nl).filter(([, value]) => /<a(?=\s|>)(?![^>]*\bhref=)[^>]*>/i.test(value))
      .map(([key]) => key)).toEqual([]);
  });

  it('preserves quiz numerical claims and customer identities', () => {
    const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).sort();
    expect(Object.keys(nlQuiz).filter(key => JSON.stringify(numbers(nlQuiz[key]))
      !== JSON.stringify(numbers(en[key])))).toEqual([]);
    for (const key of Object.keys(nlQuiz).filter(key => /\.(?:name\d|customerName)$/.test(key)
      && ['PRO KLASĖ', 'VšĮ “Laisvi vaikai”'].includes(en[key]))) {
      expect(nlQuiz[key]).toBe(en[key]);
    }
  });

  it('uses Dutch through browser, email and SSR resolvers', () => {
    for (const translate of [t, emailText, ssrText]) {
      expect(translate('nl', 'quiz.audience.solo.title')).toBe('Zelfstandig bijlesdocent');
      expect(translate('nl', 'orgTeam.title')).toBe('Team en toegang');
      expect(translate('nl', 'settings.sessionExpired')).toContain('sessie');
    }
  });

  it('keeps student calendar controls and financial actions distinct', () => {
    expect(t('nl', 'stuSched.today')).toBe('Vandaag');
    expect(t('nl', 'stuSched.week')).toBe('Week');
    expect(t('nl', 'stuSched.month')).toBe('Maand');
    expect(t('nl', 'studentPaymentSection.saveForStudent')).toBe('Opslaan voor deze leerling');
    expect(t('nl', 'studentSettings.payerOptionSelf')).toBe('Ik betaal de lessen zelf');
    expect(t('nl', 'settings.monthlyPlan')).toBe('Maandelijks');
    expect(t('nl', 'studentWait.anyFreeLesson')).toBe('Elke beschikbare les');
    expect(t('nl', 'landing.ctaButton')).toBe('Ga nu aan de slag');
    expect(t('nl', 'nav.dashboard')).toBe('Overzicht');
    expect(t('nl', 'login.parentLoginTitle')).toBe('Inloggen als ouder');
    expect(t('nl', 'pricing.enterprise')).toBe('Voor organisaties');
    expect(t('nl', 'companyDash.confirmNoShow')).toBe('Bevestig niet verschenen');
  });

  it('renders Dutch public booking copy without the English fallback', () => {
    const copy = chromeFor('nl');
    expect(copy).toBe(CHROME.nl);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(CHROME.en).sort());
    expect(copy.book).toBe('Boek een les');
    expect(copy.sendEnquiry).toBe('Aanvraag verzenden');
    expect(copy.noSlots).toContain('beschikbare tijden');
    expect(formatShortDay('2026-10-01', 'nl')).toBe('1 okt');
    expect(publicPageCanonicalUrl('sanne', 'nl')).toBe('https://www.tutlio.com/nl/tutor/sanne');
  });

  it.each([
    ['2026-01-01T23:30:00Z', '2026-01-02', '00:30'],
    ['2026-07-01T22:30:00Z', '2026-07-02', '00:30'],
    ['2026-03-29T01:30:00Z', '2026-03-29', '03:30'],
    ['2026-10-25T01:30:00Z', '2026-10-25', '02:30'],
  ])('keeps the Dutch appointment day and time consistent for %s', (start, day, time) => {
    expect(publicPageSlotDay(start, 'Europe/Amsterdam')).toBe(day);
    expect(formatPublicPageSlotTime(start, 'nl-NL', 'Europe/Amsterdam')).toBe(time);
    expect(groupSlotsByDay([{ start, durationMinutes: 60 }], 'Europe/Amsterdam')[0].day).toBe(day);
  });

  it('uses the schema timezone fallback for an invalid saved timezone', () => {
    expect(publicPageTimeZone('not-a-timezone')).toBe('Europe/Vilnius');
  });

  it('keeps international phone guidance consistent with the validator', () => {
    expect(validateLocalizedPhone('+31 6 12345678', 'nl')).toBe(true);
    expect(validateLocalizedPhone('+32 470 123456', 'nl')).toBe(true);
    expect(validateLocalizedPhone('not-a-phone', 'nl')).toBe(false);
    expect(getLocalizedPhonePlaceholder('nl')).toContain('+31');
    for (const key of ['settings.phoneFormat', 'stu.phoneFormat', 'compStu.phoneFormat',
      'register.phoneError', 'register.phoneHint', 'onboard.phoneFormatError',
      'onboard.parentPhoneFormat', 'studentSettings.phoneFormatError']) {
      expect(nl[key]).toContain('+31');
      expect(nl[key]).not.toContain('+370');
    }
    expect(LOCALE_FORMAT_TAGS.nl).toBe('nl-NL');
    expect(new Intl.NumberFormat(LOCALE_FORMAT_TAGS.nl, { style: 'currency', currency: 'EUR' }).format(19.99))
      .toMatch(/€\s19,99/);
  });

  it('escapes user-controlled names in Dutch HTML messages', () => {
    const rendered = tHtml('nl', 'em.invoiceBody', {
      tutor: '<img src=x onerror=alert(1)>', period: 'september', studentPart: ' voor Noor',
    });
    expect(rendered).not.toContain('<img');
    expect(rendered).toContain('&lt;img');
    expect(rendered).toContain('<strong>september</strong>');
  });
});
