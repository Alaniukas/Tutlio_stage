import { describe, expect, it } from 'vitest';
import { effectiveSessionOutcome, orgRequiresTutorStatusConfirmation } from '@/lib/sessionStatusConfirmation';
import {
  DEMO_MOKYKLA_ORG_ID,
  LAISVI_VAIKIAI_ORG_ID,
  LAISVI_VAIKIAI_SLUG,
  PRO_KLASE_ORG_ID,
  PRO_KLASE_QA_ORG_ID,
} from '@/lib/marketMoney';

describe('explicit lesson outcome policy', () => {
  it('always requires Laisvi vaikai confirmation, including absent or disabled flags', () => {
    for (const organizationId of [LAISVI_VAIKIAI_ORG_ID, LAISVI_VAIKIAI_SLUG, 'Laisvi-Vaikai']) {
      for (const features of [undefined, null, {}, { tutor_lesson_status_confirmation: false }]) {
        expect(orgRequiresTutorStatusConfirmation(organizationId, features)).toBe(true);
      }
    }
  });

  it('preserves Pro Klasė and explicit feature behavior without changing other schools or companies', () => {
    expect(orgRequiresTutorStatusConfirmation(PRO_KLASE_ORG_ID)).toBe(true);
    expect(orgRequiresTutorStatusConfirmation(PRO_KLASE_QA_ORG_ID)).toBe(true);
    expect(orgRequiresTutorStatusConfirmation('company', { tutor_lesson_status_confirmation: true })).toBe(true);
    for (const organizationId of ['company', DEMO_MOKYKLA_ORG_ID, null, undefined]) {
      expect(orgRequiresTutorStatusConfirmation(organizationId)).toBe(false);
      expect(orgRequiresTutorStatusConfirmation(organizationId, { tutor_lesson_status_confirmation: false })).toBe(false);
    }
    expect(orgRequiresTutorStatusConfirmation('company', { tutor_lesson_status_confirmation: 'true' })).toBe(false);
  });

  it('keeps unstamped historical outcomes pending without mutating stored history', () => {
    for (const status of ['completed', 'no_show']) {
      const session = { status, status_confirmed_at: null };
      expect(effectiveSessionOutcome(session, true)).toBe('active');
      expect(session).toEqual({ status, status_confirmed_at: null });
      expect(effectiveSessionOutcome(session, false)).toBe(status);
      expect(effectiveSessionOutcome({ ...session, status_confirmed_at: '2026-09-30T11:00:00Z' }, true)).toBe(status);
    }
  });

  it('preserves cancelled and planned sessions regardless of confirmation requirements', () => {
    for (const status of ['cancelled', 'active']) {
      expect(effectiveSessionOutcome({ status }, true)).toBe(status);
    }
  });
});
