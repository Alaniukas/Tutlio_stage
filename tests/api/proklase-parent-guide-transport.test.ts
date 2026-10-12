import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { minimatch } from 'minimatch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_QA_ORG_ID } from '../../api/_lib/marketMoney';
import { resolveProKlaseRegistrationAsset } from '../../api/_lib/proKlaseParentGuide';

vi.mock('../../api/_lib/orgEmailReplyTo.js', () => ({
  resolveOrgEmailReplyToWithServiceClient: async () => ['office@example.test'],
}));
// Keep the actual Resend SDK: inspect its outgoing JSON without any delivery.
import { sendParentInviteEmail } from '../../api/_lib/sendParentInviteEmail';
import { sendMvAccountActivationEmail } from '../../api/_lib/sendMvFamilyAccountsEmail';
import { sendProKlaseRegistrationWelcomeEmail } from '../../api/_lib/sendProKlaseRegistrationWelcomeEmail';

let payload: any;
const fetcher = vi.fn(async (url: string, options: RequestInit) => {
  expect(url).toBe('https://api.resend.com/emails');
  payload = JSON.parse(String(options.body));
  return new Response(JSON.stringify({ id: 'qa-captured-without-delivery' }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
beforeEach(() => {
  payload = undefined; fetcher.mockClear();
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '0');
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const activation = (role: 'parent' | 'student') => sendMvAccountActivationEmail('qa@example.test', {
  role, studentName: 'QA Child', accountEmail: 'qa@example.test', tempPassword: 'test-password',
  activationUrl: 'https://tutlio.lt/account-activate?t=QA', organizationId: PRO_KLASE_QA_ORG_ID,
});
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('Pro Klasė guides through the real Resend serializer', () => {
  it('fits Vercel configuration limits and bundles guides in every sending function', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      functions: Record<string, { includeFiles?: string }>;
    };
    expect(Object.keys(config.functions).length).toBeLessThanOrEqual(50);
    for (const endpoint of [
      'register-parent', 'register-student', 'send-email', 'create-parent-invite',
      'parent-create-invites-for-student', 'student-invite-parent', 'mv-provision-family-accounts',
      'confirm-package-payment', 'confirm-manual-payment', 'create-manual-package',
      'create-package-checkout', 'create-trial-package', 'stripe-webhook',
    ]) {
      const match = Object.entries(config.functions).find(([pattern]) => minimatch(`api/${endpoint}.ts`, pattern));
      expect(match?.[1].includeFiles, endpoint).toBe('api/_lib/assets/proklase/**');
    }
  });

  it.each([
    ['parent invitation', () => sendParentInviteEmail('qa@example.test', {
      studentName: 'QA Child', registerLink: 'https://tutlio.lt/parent-register?token=QA', organizationId: PRO_KLASE_QA_ORG_ID,
    })],
    ['parent activation', () => activation('parent')],
    ['student activation', () => activation('student')],
    ['registration welcome', () => sendProKlaseRegistrationWelcomeEmail({ organizationId: PRO_KLASE_QA_ORG_ID, to: 'qa@example.test' })],
  ] as const)('keeps both PNGs intact and linked to their inline images in %s', async (_label, send) => {
    expect(await send()).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(payload.attachments).toHaveLength(2);
    expect(payload.reply_to).toEqual(['office@example.test']);
    for (const [index, file] of ['tevu-atmintine.png', 'atsiskaitymo-tvarka.png'].entries()) {
      const attachment = payload.attachments[index];
      expect(typeof attachment.content).toBe('string');
      expect(attachment.content_type).toBe('image/png');
      expect(payload.html).toContain(`cid:${attachment.content_id}`);
      expect(hash(Buffer.from(attachment.content, 'base64'))).toBe(hash(readFileSync(resolveProKlaseRegistrationAsset(file))));
    }
  });
});
