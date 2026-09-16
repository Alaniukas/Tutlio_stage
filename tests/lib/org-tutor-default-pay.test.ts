import { describe, expect, it } from 'vitest';
import {
  buildTutorPayUpdatePatch,
  resolveDefaultTutorPayForSave,
} from '../../src/lib/orgTutorDefaultPay';

describe('buildTutorPayUpdatePatch', () => {
  it('does not write either pay field during an unrelated tutor save', () => {
    expect(buildTutorPayUpdatePatch({
      basePayEdited: false,
      basePay: 0,
      subjectPayEdited: false,
      subjectPay: {},
      subjectPayEnabled: true,
    })).toEqual({});
  });

  it('writes only the base pay when only that field was edited', () => {
    expect(buildTutorPayUpdatePatch({
      basePayEdited: true,
      basePay: 15,
      subjectPayEdited: false,
      subjectPay: { math: 20 },
      subjectPayEnabled: true,
    })).toEqual({ company_commission_percent: 15 });
  });

  it('writes subject overrides independently for the enabled organization', () => {
    expect(buildTutorPayUpdatePatch({
      basePayEdited: false,
      basePay: 0,
      subjectPayEdited: true,
      subjectPay: { math: 20 },
      subjectPayEnabled: true,
    })).toEqual({ company_commission_by_subject: { math: 20 } });
  });

  it('never writes subject overrides for organizations without that feature', () => {
    expect(buildTutorPayUpdatePatch({
      basePayEdited: false,
      basePay: 0,
      subjectPayEdited: true,
      subjectPay: { math: 20 },
      subjectPayEnabled: false,
    })).toEqual({});
  });
});

describe('resolveDefaultTutorPayForSave', () => {
  it('keeps the fresher database value when the cached field was not edited', () => {
    expect(resolveDefaultTutorPayForSave(0, 20, false)).toBe(20);
  });

  it('uses the administrator value when the field was edited', () => {
    expect(resolveDefaultTutorPayForSave(12.5, 20, true)).toBe(12.5);
  });
});
