import { describe, expect, it } from 'vitest';
import {
  DEMO_MOKYKLA_ORG_ID,
  LAISVI_VAIKIAI_EXTRA_DEFAULT_END_DATE,
  LAISVI_VAIKIAI_ORG_ID,
  laisviVaikaiExtraUnitPriceEur,
  usesLaisviStyleExtraLessonsPrefill,
} from '@/lib/laisviVaikaiExtraLessonsDefaults';

describe('extra-lessons QA org defaults', () => {
  it('treats Demo Mokykla and Laisvi vaikai as styled prefill orgs', () => {
    expect(usesLaisviStyleExtraLessonsPrefill(DEMO_MOKYKLA_ORG_ID)).toBe(true);
    expect(usesLaisviStyleExtraLessonsPrefill(LAISVI_VAIKIAI_ORG_ID)).toBe(true);
    expect(usesLaisviStyleExtraLessonsPrefill('other-org')).toBe(false);
    expect(usesLaisviStyleExtraLessonsPrefill(null)).toBe(false);
  });

  it('uses 6 € group / 20 € individual unit prices', () => {
    expect(laisviVaikaiExtraUnitPriceEur('group')).toBe(6);
    expect(laisviVaikaiExtraUnitPriceEur('individual')).toBe(20);
  });

  it('defaults offer end date to 11 June (school year)', () => {
    expect(LAISVI_VAIKIAI_EXTRA_DEFAULT_END_DATE).toBe('2027-06-11');
  });
});
