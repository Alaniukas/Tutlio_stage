import { describe, expect, it } from 'vitest';
import { PRO_KLASE_ORG_ID } from '@/lib/marketMoney';
import {
  orgLoginPath,
  parseOrgLoginPortal,
  resolveOrgLoginDescription,
} from '@/lib/orgLoginLinks';
import { optimisticBrandingForSlug } from '@/hooks/useOrgBranding';

describe('org login links', () => {
  it('parses portal query values', () => {
    expect(parseOrgLoginPortal('student')).toBe('student');
    expect(parseOrgLoginPortal('PARENT')).toBe('parent');
    expect(parseOrgLoginPortal('admin')).toBeNull();
  });

  it('builds branded login URLs', () => {
    expect(orgLoginPath('proklase', 'tutor')).toBe('/login?org=proklase&portal=tutor');
  });

  it('paints Pro Klasė chrome before the branding API returns', () => {
    const hint = optimisticBrandingForSlug('proklase');
    expect(hint?.name).toBe('Pro Klasė');
    expect(hint?.brand_color).toBe('#004ec2');
    expect(hint?.hide_powered_by).toBe(true);
    expect(optimisticBrandingForSlug('other-school')).toBeNull();
  });

  it('uses Pro Klasė philosophy when no custom text is set', () => {
    const lt = resolveOrgLoginDescription({ orgId: PRO_KLASE_ORG_ID, locale: 'lt' });
    expect(lt).toContain('Mokomės tavo ritmu');
    const custom = resolveOrgLoginDescription({
      orgId: PRO_KLASE_ORG_ID,
      custom: 'Mūsų tekstas',
    });
    expect(custom).toBe('Mūsų tekstas');
  });
});
