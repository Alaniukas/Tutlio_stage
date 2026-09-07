import { describe, expect, it } from 'vitest';
import {
  DEMO_MOKYKLA_ORG_ID,
  DEMO_MOKYKLA_SLUG,
  isProKlaseOrg,
  LAISVI_VAIKIAI_ORG_ID,
  LAISVI_VAIKIAI_SLUG,
  orgInstructionVideoUrl,
  PRO_KLASE_ORG_ID,
  PRO_KLASE_QA_ORG_ID,
  SCHOOL_ADMIN_INSTRUCTION_VIDEO_URL,
} from '../../src/lib/marketMoney';

describe('isProKlaseOrg', () => {
  it('matches production and QA org ids and slugs', () => {
    expect(isProKlaseOrg(PRO_KLASE_ORG_ID)).toBe(true);
    expect(isProKlaseOrg(PRO_KLASE_QA_ORG_ID)).toBe(true);
    expect(isProKlaseOrg('proklase')).toBe(true);
    expect(isProKlaseOrg('ProKlase')).toBe(true);
    expect(isProKlaseOrg('proklase-qa')).toBe(true);
    expect(isProKlaseOrg('proklase-staging')).toBe(true);
  });

  it('does not match unrelated orgs', () => {
    expect(isProKlaseOrg('other-org')).toBe(false);
    expect(isProKlaseOrg(null)).toBe(false);
    expect(isProKlaseOrg('')).toBe(false);
  });
});

describe('orgInstructionVideoUrl', () => {
  it('uses Google Drive preview for Laisvi vaikai and Demo Mokykla', () => {
    expect(orgInstructionVideoUrl(LAISVI_VAIKIAI_ORG_ID)).toBe(SCHOOL_ADMIN_INSTRUCTION_VIDEO_URL);
    expect(orgInstructionVideoUrl(LAISVI_VAIKIAI_SLUG)).toBe(SCHOOL_ADMIN_INSTRUCTION_VIDEO_URL);
    expect(orgInstructionVideoUrl(DEMO_MOKYKLA_ORG_ID)).toBe(SCHOOL_ADMIN_INSTRUCTION_VIDEO_URL);
    expect(orgInstructionVideoUrl(DEMO_MOKYKLA_SLUG)).toBe(SCHOOL_ADMIN_INSTRUCTION_VIDEO_URL);
  });

  it('falls back to default YouTube embed for other orgs', () => {
    expect(orgInstructionVideoUrl('other-org')).toBe('https://www.youtube.com/embed/FSOmO86hiQE');
    expect(orgInstructionVideoUrl(null)).toBe('https://www.youtube.com/embed/FSOmO86hiQE');
  });
});
