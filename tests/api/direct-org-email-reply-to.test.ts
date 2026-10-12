import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  resolveReplyTo: vi.fn(),
}));

vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('../../api/_lib/orgEmailReplyTo.js', () => ({
  resolveOrgEmailReplyToWithServiceClient: mocks.resolveReplyTo,
}));

import { sendTutorInviteEmail } from '../../api/_lib/sendTutorInviteResend';
import { sendParentInviteEmail } from '../../api/_lib/sendParentInviteEmail';
import { PRO_KLASE_ORG_ID } from '../../api/_lib/marketMoney';

const organizationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  mocks.send.mockResolvedValue({ data: { id: 'email-id' }, error: null });
  mocks.resolveReplyTo.mockResolvedValue(['admin@school.example']);
});

afterEach(() => vi.unstubAllEnvs());

describe('direct organization emails', () => {
  it('routes tutor-invitation replies to the organization admin address', async () => {
    const result = await sendTutorInviteEmail('tutor@example.com', {
      inviteToken: 'invite-token',
      orgName: 'Example School',
      inviteeName: 'Tutor',
      inviteeEmail: 'tutor@example.com',
      origin: 'https://tutlio.lt',
      organizationId,
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.resolveReplyTo).toHaveBeenCalledWith(organizationId);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['tutor@example.com'],
      replyTo: ['admin@school.example'],
    }));
  });

  it('routes parent-invitation replies to the organization admin address', async () => {
    const result = await sendParentInviteEmail('parent@example.com', {
      parentName: 'Parent',
      studentName: 'Student',
      registerLink: 'https://tutlio.lt/parent-register',
      code: 'invite-code',
      organizationId,
      orgName: 'Example School',
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.resolveReplyTo).toHaveBeenCalledWith(organizationId);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: ['parent@example.com'],
      replyTo: ['admin@school.example'],
    }));
  });

  it('omits Reply-To when the organization has no reply address', async () => {
    mocks.resolveReplyTo.mockResolvedValueOnce(null);

    await sendTutorInviteEmail('tutor@example.com', {
      inviteToken: 'invite-token',
      orgName: 'Example School',
      inviteeName: 'Tutor',
      inviteeEmail: 'tutor@example.com',
      origin: 'https://tutlio.lt',
      organizationId,
    });

    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('replyTo');
  });

  it('includes both approved guides in the first Pro Klasė parent invitation', async () => {
    await sendParentInviteEmail('parent@example.com', {
      parentName: 'Parent', studentName: 'Student', organizationId: PRO_KLASE_ORG_ID,
      registerLink: 'https://tutlio.lt/parent-register?t=invite-token', code: 'INVITE', orgName: 'Pro Klasė',
    });
    const payload = mocks.send.mock.calls[0][0];
    expect(payload.html).toContain('https://tutlio.lt/parent-register?t=invite-token');
    expect(payload.html).toContain('cid:proklase-tevu-atmintine');
    expect(payload.html).toContain('cid:proklase-atsiskaitymo-tvarka');
    expect(payload.attachments).toHaveLength(2);
    for (const attachment of payload.attachments) {
      expect(attachment.contentType).toBe('image/png');
      expect(attachment.content.length).toBeGreaterThan(0);
    }
  });

  it('keeps the Pro Klasė guides out of other organization invitations', async () => {
    await sendParentInviteEmail('parent@example.com', {
      studentName: 'Student', registerLink: 'https://tutlio.lt/parent-register', organizationId, orgName: 'Example School',
    });
    expect(mocks.send.mock.calls[0][0].html).not.toContain('cid:proklase-');
    expect(mocks.send.mock.calls[0][0].attachments).toBeUndefined();
  });
});
