import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../api/_lib/marketMoney';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  organization: null as Record<string, unknown> | null,
}));

vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === 'organizations' ? mocks.organization : null, error: null }),
      };
      return query;
    },
  }),
}));
vi.mock('../../api/_lib/registrationInviteGate.js', () => ({
  studentRegistrationAlreadyActive: async () => false,
}));
vi.mock('../../api/_lib/orgEmailReplyTo.js', () => ({
  resolveOrgEmailReplyTo: async () => ['office@example.test'],
}));

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  mocks.organization = {
    name: 'Pro Klasė',
    logo_url: 'https://cdn.example.test/proklase.png',
    brand_color: '#004ec2',
    preferred_locale: 'lt',
    entity_type: 'company',
    features: { public_name: 'ProKlasė' },
  };
});
afterEach(() => vi.unstubAllEnvs());

async function renderInvite(data: Record<string, unknown> = {}, locale = 'lt') {
  const { default: handler } = await import('../../api/send-email');
  const result = { status: 0, body: null as any };
  const res: any = {
    status(code: number) { result.status = code; return this; },
    json(body: unknown) { result.body = body; return this; },
    setHeader() { return this; },
  };
  await handler({
    method: 'POST', headers: { 'x-internal-key': 'test-service-key' }, query: {},
    body: {
      type: 'invite_email', to: 'student@example.test', locale, dryRun: true,
      data: {
        organizationId: PRO_KLASE_ORG_ID, studentName: 'Tautvydas', tutorName: 'Liepa Linkevičiūtė',
        inviteCode: 'T9KX2S', bookingUrl: 'https://tutlio.com/register?code=T9KX2S', ...data,
      },
    },
  } as any, res);
  expect(result.status).toBe(200);
  expect(mocks.send).not.toHaveBeenCalled();
  return result.body as { subject: string; html: string };
}

describe('student invitation sender copy', () => {
  it('names ProKlasė in the subject, subtitle and introduction instead of the assigned tutor', async () => {
    const { subject, html } = await renderInvite({ orgName: 'Caller supplied name' });
    expect(subject).toBe('ProKlasė registracijos nuoroda');
    expect(html).toContain('ProKlasė kviečia į platformą');
    expect(html).toContain('<strong>ProKlasė</strong> pridėjo Jus į sistemą. Kad galėtumėte matyti tvarkaraštį');
    expect(html).not.toContain('Jūsų korepetitorius');
    expect(html).not.toContain('Liepa Linkevičiūtė');
    expect(html).not.toContain('Caller supplied name');
    expect(html).toContain('https://cdn.example.test/proklase.png');
    expect(html).toContain('https://www.tutlio.lt/register?code=T9KX2S');
    expect(html).toContain('T9KX2S');
  });

  it('uses the target organization name even when custom branding is disabled', async () => {
    mocks.organization = { name: 'Kita akademija', features: {}, entity_type: 'company' };
    const { subject, html } = await renderInvite({ organizationId: 'other-org' });
    expect(subject).toBe('Kita akademija registracijos nuoroda');
    expect(html).toContain('<strong>Kita akademija</strong> pridėjo Jus į sistemą');
    expect(html).not.toContain('ProKlasė');
    expect(html).not.toContain('Liepa Linkevičiūtė');
  });

  it('escapes organization names once in HTML and keeps the subject readable', async () => {
    mocks.organization = { name: 'Tom & Jerry <Academy>', features: {} };
    const { subject, html } = await renderInvite({ organizationId: 'other-org' });
    expect(subject).toBe('Tom & Jerry <Academy> registracijos nuoroda');
    expect(html).toContain('<strong>Tom &amp; Jerry &lt;Academy&gt;</strong>');
    expect(html).not.toContain('<Academy>');
    expect(html).not.toContain('&amp;amp;');
  });

  it('keeps solo tutor wording when there is no organization', async () => {
    const { subject, html } = await renderInvite({ organizationId: undefined, orgName: 'Unverified organization' });
    expect(subject).toBe('Jūsų registracijos nuoroda pas korepetitorių');
    expect(html).toContain('Jūsų korepetitorius kviečia į platformą');
    expect(html).toContain('Jūsų korepetitorius <strong>Liepa Linkevičiūtė</strong> pridėjo Jus į sistemą');
    expect(html).not.toContain('Unverified organization');
  });

  it('keeps the dedicated school parent invitation wording', async () => {
    mocks.organization = { name: 'Kita mokykla', entity_type: 'school', features: {} };
    const { subject, html } = await renderInvite({ organizationId: 'school-org', context: 'school', tutorName: 'Kita mokykla' });
    expect(subject).toBe('Jūsų registracijos nuoroda mokykloje');
    expect(html).toContain('Jūsų vaikas <strong>Tautvydas</strong> užregistruotas mokykloje <strong>Kita mokykla</strong>');
  });

  it('renders the organization introduction in the requested English locale', async () => {
    const { subject, html } = await renderInvite({}, 'en');
    expect(subject).toBe('Your registration link from ProKlasė');
    expect(html).toContain('ProKlasė invites you to the platform');
    expect(html).toContain('<strong>ProKlasė</strong> added you to the system. To view the schedule and book lessons');
    expect(html).not.toContain('Your tutor');
  });
});
