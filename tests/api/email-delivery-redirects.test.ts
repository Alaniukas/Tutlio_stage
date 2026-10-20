import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { emailDeliveryRedirect, redirectEmailDelivery } from '../../api/_lib/emailDeliveryRedirects';
import { Resend } from '../../api/_lib/resendClient';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
const source = 'parent@retired.example';
const inbox = 'family@example.test';
beforeEach(() => {
  vi.stubEnv('EMAIL_DELIVERY_REDIRECTS', JSON.stringify({ [source]: inbox }));
  send.mockResolvedValue({ data: { id: 'accepted' }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('operator-approved email delivery redirects', () => {
  it('redirects exact addresses and named mailboxes, deduplicates recipients, and preserves the original payload', () => {
    const original = { to: [source, inbox, 'other@example.test'], cc: `Parent <${source.toUpperCase()}>`,
      bcc: ['private@example.test', source], subject: 'Same subject', html: 'Same body',
      replyTo: source, attachments: [{ filename: 'contract.pdf', content: 'unchanged' }] };
    const snapshot = structuredClone(original);
    expect(redirectEmailDelivery(original)).toEqual({ ...original, to: [inbox, 'other@example.test'], bcc: ['private@example.test'], cc: undefined });
    expect(original).toEqual(snapshot);
    expect(redirectEmailDelivery({ to: `Parent <${source.toUpperCase()}>` })).toEqual({ to: `Parent <${inbox}>` });
    expect(emailDeliveryRedirect(source.toUpperCase())).toBe(inbox);
  });

  it('keeps unrelated addresses and unconfigured environments unchanged', () => {
    expect(emailDeliveryRedirect('other@example.test')).toBeNull();
    expect(redirectEmailDelivery({ to: 'someone+parent@retired.example' }).to).toBe('someone+parent@retired.example');
    vi.stubEnv('EMAIL_DELIVERY_REDIRECTS', '');
    const payload = { to: [source, inbox], subject: 'untouched' };
    expect(redirectEmailDelivery(payload)).toBe(payload);
    expect(emailDeliveryRedirect(source)).toBeNull();
  });

  it.each(['invalid-json', '[]', 'null', '{"*@retired.example":"family@example.test"}',
    '{"parent@retired.example":null}', '{"parent@retired.example":"bad-address"}',
    '{"parent@retired.example":"family@example.test","PARENT@RETIRED.EXAMPLE":"other@example.test"}',
    '{"parent@retired.example":"family@example.test","family@example.test":"third@example.test"}',
    '{"parent@retired.example":"family@example.test","family@example.test":"parent@retired.example"}',
  ])('stops delivery instead of falling back to the retired inbox after invalid configuration: %s', async (raw) => {
    vi.stubEnv('EMAIL_DELIVERY_REDIRECTS', raw);
    expect(() => new Resend('test-key').emails.send({ from: 'sender@example.test', to: source, subject: 'Test', html: 'Body' })).toThrow('Invalid EMAIL_DELIVERY_REDIRECTS');
    expect(send).not.toHaveBeenCalled();
  });

  it('redirects frozen retry payloads at the provider boundary while preserving keys and attachment bytes', async () => {
    const payload = Object.freeze({ from: 'sender@example.test', to: [source], subject: 'Invoice',
      html: 'Body', attachments: [{ filename: 'invoice.pdf', content: Buffer.from('PDF bytes') }] });
    const options = { idempotencyKey: 'original-delivery-key' };
    await new Resend('test-key').emails.send(payload, options);
    expect(send).toHaveBeenCalledWith({ ...payload, to: [inbox] }, options);
    expect(send.mock.calls[0][0].attachments).toBe(payload.attachments);
    expect(payload.to).toEqual([source]);
  });

  it('preserves the provider call when no request options were supplied', async () => {
    const payload = { from: 'sender@example.test', to: source, subject: 'Invitation', html: 'Body' };
    await new Resend('test-key').emails.send(payload);
    expect(send).toHaveBeenCalledExactlyOnceWith({ ...payload, to: inbox });
  });

  it('keeps every application sender on the common delivery boundary', () => {
    const files = readdirSync('api', { recursive: true }).filter((name) => String(name).endsWith('.ts'));
    const bypasses = files.filter((name) => {
      if (String(name).replaceAll('\\', '/') === '_lib/resendClient.ts') return false;
      return /from\s+['"]resend['"]/.test(readFileSync(path.join('api', String(name)), 'utf8'));
    });
    expect(bypasses).toEqual([]);
  });
});
