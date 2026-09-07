import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parentInviteProblem } from '../../src/lib/parentInviteFeedback';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  auth: vi.fn(),
  invite: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('../../api/_lib/parentInvite.js', () => ({ insertParentInviteAndSendEmail: mocks.invite }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: async () => ({ organizationId: 'org-1', role: 'owner', permissions: {} }),
}));

import handler from '../../api/parent-create-invites-for-student';

const existing = { skipped: true, reason: 'already_registered' };
const sent = { token: 'token', code: 'code', emailSent: true };
const t = (key: string) => key;

async function run(secondary = false) {
  mocks.from.mockImplementation((table: string) => {
    const data = table === 'students'
      ? { id: 'student-1', organization_id: 'org-1', full_name: 'Child', payer_email: 'parent@example.com',
          parent_secondary_email: secondary ? 'second@example.com' : null }
      : { name: 'Org', preferred_locale: 'lt' };
    const chain: any = { select: () => chain, eq: () => chain,
      single: async () => ({ data }), maybeSingle: async () => ({ data }) };
    return chain;
  });
  let body: any;
  const res: any = { statusCode: 0, setHeader: vi.fn(), end: (value: string) => { body = JSON.parse(value); } };
  await handler({ method: 'POST', body: { studentId: 'student-1' }, headers: { host: 'tutlio.lt' } } as any, res);
  return { status: res.statusCode, body };
}

describe('parent invite delivery feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    mocks.auth.mockResolvedValue({ userId: 'admin-1', isInternal: false });
  });

  it('reports an existing account without claiming an invitation was sent', async () => {
    mocks.invite.mockResolvedValue(existing);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ sent: 0, skipped: 1, results: [{ email: 'parent@example.com', ...existing }] });
    expect(parentInviteProblem(body, true, t)).toBe('parent@example.com: compStu.inviteSkippedAlreadyRegistered');
  });

  it('counts only delivered invitations and keeps the skipped recipient visible', async () => {
    mocks.invite.mockResolvedValueOnce(existing).mockResolvedValueOnce(sent);
    const { body } = await run(true);
    expect(body).toMatchObject({ sent: 1, skipped: 1 });
    const message = parentInviteProblem(body, true, t);
    expect(message).toContain('parent@example.com');
    expect(message).not.toContain('second@example.com');
  });

  it('surfaces a partial failure alongside a skipped account', async () => {
    mocks.invite.mockResolvedValueOnce(existing).mockResolvedValueOnce({ error: 'Delivery failed' });
    const { status, body } = await run(true);
    expect(status).toBe(200);
    expect(body.sent).toBe(0);
    expect(parentInviteProblem(body, true, t)).toBe(
      'parent@example.com: compStu.inviteSkippedAlreadyRegistered\nsecond@example.com: compStu.parentInviteEmailFailed',
    );
  });

  it('allows the usual success message when every invitation is sent', async () => {
    mocks.invite.mockResolvedValue(sent);
    const { body } = await run(true);
    expect(body).toMatchObject({ sent: 2, skipped: 0 });
    expect(parentInviteProblem(body, true, t)).toBeNull();
  });

  it('preserves delivery failure feedback when no invitations succeed', async () => {
    mocks.invite.mockResolvedValue({ emailSent: false, emailError: 'Delivery failed' });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(parentInviteProblem(body, false, t)).toContain('parent@example.com: compStu.parentInviteEmailFailed');
  });

  it('does not reveal account status to an unauthenticated caller', async () => {
    mocks.auth.mockResolvedValue(null);
    const { status } = await run();
    expect(status).toBe(401);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
});
