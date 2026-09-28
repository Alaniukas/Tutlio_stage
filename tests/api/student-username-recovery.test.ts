import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolFamilyMemoryDatabase } from '../fixtures/schoolFamilyMemoryDatabase';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
  send: vi.fn(),
  org: vi.fn(),
}));

vi.mock('../../api/_lib/findAuthUserByEmail.js', () => ({ findAuthUserByEmail: mocks.find }));
vi.mock('../../api/_lib/resendConfig.js', () => ({
  getResendApiKey: () => 'test-key',
  getFromEmail: () => 'test@example.test',
}));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));

import { sendStudentUsernameRecovery } from '../../api/_lib/studentUsernameRecovery';

const authEmail = 'mv-0123456789abcdef@student-login.tutlio.invalid';
const redirect = 'https://tutlio.lt/auth/callback?next=/reset-password';
const db = {
  from: vi.fn(() => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: mocks.org,
    };
    return query;
  }),
  auth: { admin: {
    getUserById: mocks.get,
    updateUserById: mocks.update,
    generateLink: mocks.generate,
  } },
} as any;
const user = {
  id: 'child',
  email: authEmail,
  email_confirmed_at: '2026-09-08',
  user_metadata: { full_name: 'Child' },
  app_metadata: {
    provisioned_by_organization: 'c1f36796-c281-4650-bed2-1bd6874764f1',
    student_login_name: 'mv-0123456789abcdef',
    student_contact_email: 'parent@example.test',
  },
};

beforeEach(() => {
  vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '0');
  vi.clearAllMocks();
  mocks.find.mockResolvedValue({ id: 'child' });
  mocks.get.mockResolvedValue({ data: { user } });
  mocks.update.mockResolvedValue({ error: null });
  mocks.generate.mockResolvedValue({
    data: { properties: { action_link: 'https://auth.example.test/recovery' } },
  });
  mocks.send.mockResolvedValue({ error: null });
  mocks.org.mockResolvedValue({
    data: {
      name: 'Mokslo vaisiai',
      logo_url: 'https://cdn.example/mv.png',
      brand_color: '#124410',
      brand_color_secondary: '#3a761f',
      features: {},
    },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('student username password recovery', () => {
  it('generates recovery for the child and sends only to the server-stored parent contact', async () => {
    await sendStudentUsernameRecovery(db, authEmail, redirect);
    expect(mocks.generate).toHaveBeenCalledWith({
      type: 'recovery',
      email: authEmail,
      options: { redirectTo: redirect },
    });
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: 'parent@example.test' });
    expect(mocks.send.mock.calls[0][0].html).not.toContain('student-login.tutlio.invalid');
    expect(mocks.update.mock.calls[0][0]).toBe('child');
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('password');
  });

  it('uses Pro Klasė white-label instead of the original MV recovery identity', async () => {
    const proAuthEmail = 'pk-abcd-2345@student-login.tutlio.invalid';
    mocks.get.mockResolvedValue({ data: { user: {
      ...user,
      email: proAuthEmail,
      app_metadata: {
        ...user.app_metadata,
        provisioned_by_organization: '3422031d-6e21-424d-980b-35a9c6d7b8f1',
        student_login_name: 'pk-abcd-2345',
      },
    } } });
    mocks.org.mockResolvedValue({
      data: {
        name: 'Pro Klasė',
        logo_url: 'https://cdn.example/proklase.png',
        brand_color: '#004ec2',
        brand_color_secondary: '#0066ff',
        features: { public_name: 'Pro Klasė' },
      },
      error: null,
    });

    await sendStudentUsernameRecovery(db, proAuthEmail, redirect);

    const payload = mocks.send.mock.calls[0][0];
    expect(payload.from).toMatch(/^ProKlasė Sistema </);
    expect(payload.subject).toContain('Pro Klasė');
    expect(payload.html).toContain('https://cdn.example/proklase.png');
    expect(payload.html).not.toContain('Mokslo vais');
  });

  it('uses the target white-label for another organization with the portable flag', async () => {
    const portableAuthEmail = 'st-abcd-2345@student-login.tutlio.invalid';
    mocks.get.mockResolvedValue({ data: { user: {
      ...user,
      email: portableAuthEmail,
      app_metadata: {
        ...user.app_metadata,
        provisioned_by_organization: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        student_login_name: 'st-abcd-2345',
      },
    } } });
    mocks.org.mockResolvedValue({
      data: {
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
      error: null,
    });

    await sendStudentUsernameRecovery(db, portableAuthEmail, redirect);

    const payload = mocks.send.mock.calls[0][0];
    expect(payload.from).toMatch(/^Kita Akademija </);
    expect(payload.subject).toContain('Kita Akademija');
    expect(payload.html).toContain('https://cdn.example/kita-akademija.png');
    expect(payload.html).not.toContain('Mokslo vais');
    expect(payload.html).not.toContain('Pro Klas');
  });

  it.each(['missing', 'inactive', 'foreign', 'throttled', 'mismatched'])('does not send recovery for %s accounts', async (state) => {
    if (state === 'missing') mocks.find.mockResolvedValue(null);
    else mocks.get.mockResolvedValue({ data: { user: {
      ...user,
      email_confirmed_at: state === 'inactive' ? null : user.email_confirmed_at,
      app_metadata: {
        ...user.app_metadata,
        ...(state === 'foreign' ? { provisioned_by_organization: 'other' } : {}),
        ...(state === 'throttled' ? { student_recovery_sent_at: Date.now() } : {}),
        ...(state === 'mismatched' ? { student_login_name: 'mv-ffffffffffffffff' } : {}),
      },
    } } });
    await sendStudentUsernameRecovery(db, authEmail, redirect);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('uses live annual guardian evidence during school preparation instead of an old or edited card email', async () => {
    const alias = 'st-abcd-2345@student-login.tutlio.invalid';
    const strictUser = { ...user, email: alias, app_metadata: { provisioned_by_organization: 'school-one',
      student_login_name: 'st-abcd-2345', student_contact_email: 'obsolete@example.test' } };
    const memory = schoolFamilyMemoryDatabase({
      organizations: [{ id: 'school-one', name: 'Demo School', entity_type: 'school', features: { school_family_accounts_setup: true } }],
      students: [{ id: 'child-row', organization_id: 'school-one', linked_user_id: 'child', enrollment_status: 'active', detached_at: null,
        payer_email: 'edited-contact@example.test' }],
      school_contracts: [{ id: 'annual-one', organization_id: 'school-one', student_id: 'child-row', kind: 'annual', signing_status: 'signed', archived_at: null, terminated_at: null }],
      school_family_guardians: [{ organization_id: 'school-one', student_id: 'child-row', annual_contract_id: 'annual-one', guardian_user_id: 'parent',
        guardian_email: 'verified-guardian@example.test', guardian_name: 'Verified Parent', evidence_source: 'admin_verified', signature_id: null }],
    }, [strictUser]);
    memory.db.auth.admin.generateLink = mocks.generate;
    await sendStudentUsernameRecovery(memory.db, alias, redirect);
    expect(mocks.send.mock.calls[0][0].to).toBe('verified-guardian@example.test');
    expect(mocks.generate).toHaveBeenCalledWith({ type: 'recovery', email: alias, options: { redirectTo: redirect } });
    expect(memory.updateUserById.mock.calls[0][1]).not.toHaveProperty('password');
    mocks.send.mockClear(); mocks.generate.mockClear();
    memory.tables.school_contracts[0].terminated_at = '2026-09-28T00:00:00Z';
    await sendStudentUsernameRecovery(memory.db, alias, redirect);
    expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('suppresses username recovery before any Auth operation in local Demo QA', async () => {
    vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '1');
    await sendStudentUsernameRecovery(db, authEmail, redirect);
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
