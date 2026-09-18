import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../api/_lib/marketMoney';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

vi.mock('../../api/_lib/mvPayerFeeNotice.js', () => ({
  appendMvPayerFeeNoticeBeforeFooter: (html: string) => html,
  finalizeMvPayerFirstFeeNoticeAfterSend: vi.fn(),
  maybeMvPayerFirstFeeNoticeFooter: vi.fn(async () => ''),
  mvPayerFeeNoticeFooterHtml: vi.fn(() => ''),
}));

import { sendMvAccountActivationEmail } from '../../api/_lib/sendMvFamilyAccountsEmail';

describe('Pro Klasė managed-account activation email', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('uses only Pro Klasė identity, including the sender, logo, colors and signature', async () => {
    const result = await sendMvAccountActivationEmail('parent@example.test', {
      role: 'parent',
      recipientName: 'Parent',
      studentName: 'Child',
      accountEmail: 'parent@example.test',
      tempPassword: 'Temporary-123',
      activationUrl: 'https://tutlio.lt/account-activate?t=test',
      orgName: 'Pro Klasė',
      organizationId: PRO_KLASE_ORG_ID,
      org: {
        name: 'Pro Klasė',
        logo_url: 'https://cdn.example/proklase.png',
        brand_color: '#004ec2',
        brand_color_secondary: '#0066ff',
        features: { public_name: 'Pro Klasė' },
      },
      locale: 'lt',
    });

    expect(result).toEqual({ ok: true });
    const payload = mocks.send.mock.calls[0][0];
    expect(payload.from).toMatch(/^ProKlasė Sistema </);
    expect(payload.subject).not.toContain('Mokslo vais');
    expect(payload.html).toContain('https://cdn.example/proklase.png');
    expect(payload.html).toContain('#004ec2');
    expect(payload.html).toContain('#0066ff');
    expect(payload.html).toContain('Pro Klasės komanda');
    expect(payload.html).not.toContain('Mokslo vais');
    expect(payload.html).not.toContain('Aktyvuokite Tutlio paskyrą');
  });

  it('uses the target white-label when the portable flag originated elsewhere', async () => {
    const result = await sendMvAccountActivationEmail('parent@example.test', {
      role: 'student',
      recipientName: 'Parent',
      studentName: 'Child',
      accountEmail: 'st-abcd-2345@student-login.tutlio.invalid',
      accountIdentifier: 'st-abcd-2345',
      tempPassword: 'Temporary-123',
      activationUrl: 'https://tutlio.lt/account-activate?t=test',
      orgName: 'Kita Akademija',
      organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      org: {
        name: 'Kita Akademija',
        logo_url: 'https://cdn.example/kita-akademija.png',
        brand_color: '#123456',
        brand_color_secondary: '#abcdef',
        features: {
          managed_family_accounts: true,
          custom_branding: true,
          public_name: 'Kita Akademija',
        },
      },
      locale: 'lt',
    });

    expect(result).toEqual({ ok: true });
    const payload = mocks.send.mock.calls[0][0];
    expect(payload.from).toMatch(/^Kita Akademija </);
    expect(payload.html).toContain('https://cdn.example/kita-akademija.png');
    expect(payload.html).toContain('#123456');
    expect(payload.html).toContain('#abcdef');
    expect(payload.html).toContain('Kita Akademija');
    expect(payload.html).not.toContain('Mokslo vais');
    expect(payload.html).not.toContain('Pro Klas');
  });
});
