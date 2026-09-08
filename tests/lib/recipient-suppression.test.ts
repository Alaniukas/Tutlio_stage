import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRecipientSuppression } from '../../api/_lib/recipientSuppression';
afterEach(() => vi.unstubAllGlobals());
const email = 'parent@example.test';
function provider(status: number, data: unknown) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, ok: status === 200, json: async () => data })); }
describe('recipient suppression diagnostics', () => {
  it('reports the bounce without exposing the provider source message', async () => {
    provider(200, { object: 'suppression', email, origin: 'bounce', source_id: 'private' });
    expect(await checkRecipientSuppression(email, 'key')).toEqual({ email, status: 'blocked', reason: 'bounce' });
  });
  it('absence of suppression does not claim delivery', async () => {
    provider(404, { name: 'not_found' });
    expect(await checkRecipientSuppression(email, 'key')).toEqual({ email, status: 'not_blocked' });
  });
  it.each([401, 403, 429, 500])('provider failure %s is unknown rather than healthy', async status => {
    provider(status, { name: 'error' });
    expect((await checkRecipientSuppression(email, 'key')).status).toBe('unknown');
  });
  it('does not trust an unrelated or malformed response', async () => {
    provider(200, { object: 'suppression', email: 'other@example.test', origin: 'bounce' });
    expect((await checkRecipientSuppression(email, 'key')).status).toBe('unknown');
  });
  it('handles network failures without leaking credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await checkRecipientSuppression(email, 'secret')).toEqual({ email, status: 'unknown' });
  });
});
