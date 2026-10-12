import { afterEach, describe, expect, it, vi } from 'vitest';
import { annulSessionPayment, canAnnulSessionPayment } from '../../src/lib/sessionPaymentAnnulment';
import { sessionPaymentAnnulmentCopy, sessionPaymentAnnulmentText } from '../../src/lib/i18n/sessionPaymentAnnulmentCopy';
import { LEGACY_LOCALES } from '../../src/lib/i18n/locales';
import { getCached, invalidateCache, setCache } from '../../src/lib/dataCache';

vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' }) }));
afterEach(() => { vi.unstubAllGlobals(); invalidateCache(); });

describe('client payment annulment', () => {
  it.each(['active', 'completed', 'no_show'])('offers annulment for an unpaid %s lesson', status => {
    expect(canAnnulSessionPayment({ status, paid: false })).toBe(true);
  });
  it.each([
    null, { status: 'cancelled' }, { status: 'no_show', paid: true },
    { status: 'no_show', payment_status: 'paid' }, { status: 'completed', is_complimentary: true },
    { status: 'completed', class_group_id: 'group' },
  ])('does not offer annulment for %j', session => {
    expect(canAnnulSessionPayment(session)).toBe(false);
  });
  it('sends only the lesson ID with administrator authentication', async () => {
    const session = { id: 'lesson-1', is_complimentary: true, paid: true, payment_status: 'paid' };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session }) });
    vi.stubGlobal('fetch', fetcher);
    setCache('company_sessions', { sessions: [{ id: 'lesson-1', paid: false }] });
    setCache('company_stats:org-1', { outstanding: 30 });
    expect(await annulSessionPayment('lesson-1')).toEqual({ ok: true, session });
    expect(getCached('company_sessions')).toBeNull();
    expect(getCached('company_stats:org-1')).toBeNull();
    expect(fetcher).toHaveBeenCalledWith('/api/annul-session-payment', {
      method: 'POST', headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'lesson-1' }),
    });
  });
  it.each([null, { id: 'another-lesson' }, { id: 'lesson-1', paid: false }])('does not accept an unconfirmed save %j', async session => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session }) }));
    expect(await annulSessionPayment('lesson-1')).toEqual({ ok: false, code: 'failed' });
  });
  it('retains a server conflict code for translated feedback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ code: 'billed' }) }));
    expect(await annulSessionPayment('lesson-1')).toEqual({ ok: false, code: 'billed' });
  });
  it('handles connection failures without changing the UI to saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    expect(await annulSessionPayment('lesson-1')).toEqual({ ok: false, code: 'failed' });
  });
  it.each(LEGACY_LOCALES)('provides native annulment copy for %s', locale => {
    const copy = sessionPaymentAnnulmentCopy[locale];
    expect(copy).toHaveLength(8);
    expect(copy.every(value => value.trim().length > 0)).toBe(true);
    expect(copy[1]).toContain('6');
    expect(sessionPaymentAnnulmentText(locale, 'action')).toBe(copy[0]);
    if (locale !== 'en') expect(copy.every((value, index) => value !== sessionPaymentAnnulmentCopy.en[index])).toBe(true);
  });
});
