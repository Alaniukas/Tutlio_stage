import { beforeAll, describe, expect, it } from 'vitest';
import { loadLocaleDict, t } from '../../src/lib/i18n/core';
import { lt } from '../../src/lib/i18n/lt';
import { en } from '../../src/lib/i18n/en';

/** Keys that rendered as raw strings on the company dashboard after i18n HMR. */
const DASHBOARD_KEYS = [
  'companyDash.tutors',
  'companyDash.tutorStatSubLicenses',
  'companyDash.lessonsThisMonth',
  'companyDash.planned',
  'companyDash.earningsThisMonth',
  'companyDash.totalEarnings',
  'companyDash.sinceStart',
  'companyDash.upcomingLessons',
  'companyDash.allLabel',
  'companyDash.noUpcoming',
  'companyDash.needsAttention',
  'companyDash.entries',
  'companyDash.recentPayments',
  'companyDash.cancelledPaid',
  'companyDash.noCancelledPaid',
  'status.awaitingPayment',
  'status.completedUnpaid',
  'dash.hoursLeft',
  'dash.deadlinePassed',
  'common.finance',
] as const;

const PARENT_REGISTER_KEYS = [
  'parent.registerTitle',
  'parent.fullName',
  'parent.childInfoTitle',
  'parent.childGrade',
  'parent.childGradePlaceholder',
  'parent.childBirthDate',
  'parent.password',
  'parent.registerBtn',
  'parent.gradeRequired',
  'auth.agreeWith',
  'auth.privacyPolicy',
  'auth.termsOfService',
  'auth.proklasePrivacyPolicy',
  'auth.proklaseTermsOfService',
  'common.email',
  'common.optional',
  'onboard.gradeN',
] as const;

describe('runtime i18n dictionaries — company dashboard', () => {
  beforeAll(async () => {
    await loadLocaleDict('lt');
    await loadLocaleDict('en');
  });

  it('static LT/EN maps contain every dashboard key', () => {
    const missingLt = DASHBOARD_KEYS.filter((key) => !(key in lt));
    const missingEn = DASHBOARD_KEYS.filter((key) => !(key in en));
    expect(missingLt, `lt.ts missing:\n${missingLt.join('\n')}`).toEqual([]);
    expect(missingEn, `en.ts missing:\n${missingEn.join('\n')}`).toEqual([]);
  });

  it('t() returns translated copy, not the key itself', () => {
    for (const key of DASHBOARD_KEYS) {
      expect(t('lt', key), `lt ${key}`).not.toBe(key);
      expect(t('en', key), `en ${key}`).not.toBe(key);
    }
  });

  it('loads a populated LT dictionary (not an empty module)', async () => {
    expect(Object.keys(lt).length).toBeGreaterThan(1000);
    expect(lt['companyDash.needsAttention']).toBe('Reikia dėmesio');
  });
});

describe('runtime i18n dictionaries — parent register', () => {
  beforeAll(async () => {
    await loadLocaleDict('lt');
  });

  it('static LT map contains every parent-register key', () => {
    const missing = PARENT_REGISTER_KEYS.filter((key) => !(key in lt));
    expect(missing, `lt.ts missing:\n${missing.join('\n')}`).toEqual([]);
  });

  it('t() returns translated copy for parent register', () => {
    for (const key of PARENT_REGISTER_KEYS) {
      expect(t('lt', key), `lt ${key}`).not.toBe(key);
    }
    expect(t('lt', 'parent.registerTitle')).toBe('Tėvų paskyros registracija');
    expect(t('lt', 'onboard.gradeN', { n: 5 })).toBe('5 klasė');
  });
});
