import { describe, expect, it } from 'vitest';
import { isProKlaseOrg, PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID } from '../../src/lib/marketMoney';

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
