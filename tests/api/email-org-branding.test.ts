import { describe, expect, it } from 'vitest';
import {
  applyOrgBrandingToHtml,
  DEFAULT_TUTLIO_HEADER_MARKERS,
  resolveEmailOrgBranding,
} from '../../api/_lib/emailOrgBranding';
import { PRO_KLASE_ORG_ID } from '../../api/_lib/marketMoney';

describe('resolveEmailOrgBranding', () => {
  it('applies full Pro Klasė branding for any role (logo + from + signature)', () => {
    const resolved = resolveEmailOrgBranding(PRO_KLASE_ORG_ID, {
      name: 'Pro Klasė',
      logo_url: 'https://cdn.example/proklase.png',
      brand_color: '#004ec2',
      brand_color_secondary: '#0066ff',
      features: { custom_branding: true, public_name: 'PROKLASĖ' },
    });
    expect(resolved.isProKlase).toBe(true);
    expect(resolved.emailSenderName).toBe('ProKlasė Sistema');
    expect(resolved.emailTeamSignature).toBe('Pro Klasės komanda');
    expect(resolved.branding).toMatchObject({
      name: 'PROKLASĖ',
      logo_url: 'https://cdn.example/proklase.png',
      brand_color: '#004ec2',
      hidePoweredBy: true,
    });
  });

  it('still brands Pro Klasė when custom_branding flag is off', () => {
    const resolved = resolveEmailOrgBranding(PRO_KLASE_ORG_ID, {
      name: 'Pro Klasė',
      logo_url: 'https://cdn.example/proklase.png',
      brand_color: '#004ec2',
      features: { custom_branding: false },
    });
    expect(resolved.branding?.logo_url).toBe('https://cdn.example/proklase.png');
    expect(resolved.emailSenderName).toBe('ProKlasė Sistema');
  });

  it('requires custom_branding for non-Pro-Klasė orgs', () => {
    const without = resolveEmailOrgBranding('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      name: 'Other Org',
      logo_url: 'https://cdn.example/x.png',
      brand_color: '#111111',
      features: {},
    });
    expect(without.branding).toBeNull();
    expect(without.emailSenderName).toBeUndefined();

    const withFlag = resolveEmailOrgBranding('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      name: 'Other Org',
      logo_url: 'https://cdn.example/x.png',
      brand_color: '#111111',
      features: { custom_branding: true },
    });
    expect(withFlag.branding?.name).toBe('Other Org');
    expect(withFlag.branding?.hidePoweredBy).toBe(false);
  });
});

describe('applyOrgBrandingToHtml', () => {
  it('replaces Tutlio header markers and team signature', () => {
    const html = `<div>${DEFAULT_TUTLIO_HEADER_MARKERS[0]}</div><p>Tutlio komanda</p>`;
    const out = applyOrgBrandingToHtml(html, {
      branding: {
        name: 'PROKLASĖ',
        logo_url: 'https://cdn.example/proklase.png',
        brand_color: '#004ec2',
        hidePoweredBy: true,
      },
      emailTeamSignature: 'Pro Klasės komanda',
      locale: 'lt',
    });
    expect(out).toContain('https://cdn.example/proklase.png');
    expect(out).toContain('Pro Klasės komanda');
    expect(out).not.toContain('Tutlio 🎓');
    expect(out).not.toContain('powered by Tutlio');
  });
});
