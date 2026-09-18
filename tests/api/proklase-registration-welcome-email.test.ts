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

import { sendProKlaseRegistrationWelcomeEmail } from '../../api/_lib/sendProKlaseRegistrationWelcomeEmail';

describe('Pro Klasė registration welcome email', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-key');
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('sends the requested copy and both supplied memos to a newly registered parent', async () => {
    const result = await sendProKlaseRegistrationWelcomeEmail({
      organizationId: PRO_KLASE_ORG_ID,
      to: 'PARENT@example.test',
      parentName: 'Agnė',
    });

    expect(result).toEqual({ ok: true });
    const payload = mocks.send.mock.calls[0][0];
    expect(payload.from).toMatch(/^ProKlasė Sistema </);
    expect(payload.to).toEqual(['parent@example.test']);
    expect(payload.subject).toBe('Sėkmingai užsiregistravote ProKlasės sistemoje! 🎉');
    expect(payload.html).toContain('Savo paskyroje galėsite matyti suplanuotas pamokas');
    expect(payload.html).toContain('info@proklase.lt');
    expect(payload.html).toContain('+370 656 87 287');
    expect(payload.html).toContain('cid:proklase-tevu-atmintine');
    expect(payload.html).toContain('cid:proklase-atsiskaitymo-tvarka');
    expect(payload.attachments).toHaveLength(2);
    expect(payload.attachments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename: 'ProKlase - Tevu atmintine.png',
        contentType: 'image/png',
        contentId: 'proklase-tevu-atmintine',
        content: expect.any(Buffer),
      }),
      expect.objectContaining({
        filename: 'ProKlase - Atsiskaitymo tvarka.png',
        contentType: 'image/png',
        contentId: 'proklase-atsiskaitymo-tvarka',
        content: expect.any(Buffer),
      }),
    ]));
  });

  it('does not send this Pro Klasė-only email for another organization', async () => {
    const result = await sendProKlaseRegistrationWelcomeEmail({
      organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      to: 'parent@example.test',
    });

    expect(result).toEqual({ ok: true, skipped: true });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
