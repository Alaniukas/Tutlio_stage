import { describe, expect, it } from 'vitest';
import { PRO_KLASE_ORG_ID, MANO_KOREPETITORIUS_ORG_ID, MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';
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
    const mk = optimisticBrandingForSlug('mb-mano-korepetitorius');
    expect(mk?.name).toBe('Mano Korepetitorius');
    expect(mk?.brand_color).toBe('#5C2D91');
    const mv = optimisticBrandingForSlug('mokslovaisiai');
    expect(mv?.name).toBe('Mokslo vaisiai');
    expect(mv?.brand_color).toBe('#124410');
    expect(mv?.logo_on_dark).toBe(true);
    expect(mv?.hide_powered_by).toBe(true);
    expect(mv?.logo_url).toContain('mokslo-vaisiai');
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

  it('uses Mano Korepetitorius login copy when no custom text is set', () => {
    const lt = resolveOrgLoginDescription({ orgId: MANO_KOREPETITORIUS_ORG_ID, locale: 'lt' });
    expect(lt).toContain('Kokybiškos individualios pamokos');
    expect(lt).toContain('ryšys su tėvais');
  });

  it('uses Mokslo vaisiai login copy when no custom text is set', () => {
    const lt = resolveOrgLoginDescription({ orgId: MOKSLO_VAISIAI_ORG_ID, locale: 'lt' });
    expect(lt).toContain('Profesionalūs korepetitoriai nuotoliu');
  });
});
