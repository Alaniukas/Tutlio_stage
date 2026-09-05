import { describe, expect, it } from 'vitest';
import {
  DEMO_MOKYKLA_ORG_ID,
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
});
