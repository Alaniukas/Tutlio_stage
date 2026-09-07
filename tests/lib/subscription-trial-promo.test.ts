import { describe, expect, it } from 'vitest';
import { de } from '../../src/lib/i18n/de';
import { dk } from '../../src/lib/i18n/dk';
import { ee } from '../../src/lib/i18n/ee';
import { en } from '../../src/lib/i18n/en';
import { es } from '../../src/lib/i18n/es';
import { fi } from '../../src/lib/i18n/fi';
import { fr } from '../../src/lib/i18n/fr';
import { lt } from '../../src/lib/i18n/lt';
import { lv } from '../../src/lib/i18n/lv';
import { nl } from '../../src/lib/i18n/nl';
import { no } from '../../src/lib/i18n/no';
import { pl } from '../../src/lib/i18n/pl';
import { se } from '../../src/lib/i18n/se';
import {
  EXTENDED_SUBSCRIPTION_TRIAL_CODE,
  normalizeExtendedTrialPromoCode,
  withSubscriptionTrialDays,
} from '../../src/lib/subscriptionTrialPromo';

const dictionaries = { de, dk, ee, en, es, fi, fr, lt, lv, nl, no, pl, se };

describe('subscription trial promotion', () => {
  it('accepts only the TRIAL14D campaign code, case-insensitively', () => {
    expect(normalizeExtendedTrialPromoCode(' trial14d ')).toBe(EXTENDED_SUBSCRIPTION_TRIAL_CODE);
    expect(normalizeExtendedTrialPromoCode('TRIAL7D')).toBeUndefined();
    expect(normalizeExtendedTrialPromoCode('SAVE20')).toBeUndefined();
    expect(normalizeExtendedTrialPromoCode(null)).toBeUndefined();
  });

  it.each(Object.entries(dictionaries))('renders 14-day pricing copy in %s', (_locale, dict) => {
    for (const key of [
      'pricing.freeTrial',
      'pricing.start7DayTrial',
      'pricing.faq.trialQ',
      'pricing.faq.trialA',
    ]) {
      const localized = withSubscriptionTrialDays(dict[key], 14);
      expect(localized).toContain('14');
      expect(localized).not.toMatch(/\b(?:7|zeven)\b/i);
    }
    expect(dict['subscribe.extendedTrialCodeApplied']).toContain('14');
  });

  it('leaves the default 7-day pricing copy unchanged', () => {
    expect(withSubscriptionTrialDays(en['pricing.freeTrial'], 7)).toBe(en['pricing.freeTrial']);
  });
});
