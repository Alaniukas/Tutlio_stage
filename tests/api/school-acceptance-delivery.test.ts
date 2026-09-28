import { afterEach, expect, it, vi } from 'vitest';
import { deliverAcceptanceOnce, validAcceptanceDeliveryKey } from '../../api/_lib/schoolAcceptanceDelivery';
const jobId = '00000000-0000-4000-8000-000000000001';
const key = `school-acceptance/${jobId}/confirmation`;
afterEach(() => vi.restoreAllMocks());
function database(attemptedAt?: string) {
  let row: any = null;
  let failStamp = false;
  const db: any = { from: (table: string) => {
    let update: any;
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: table === 'school_acceptance_jobs' ? { finalized_at: 'today' } : row }),
      insert: (payload: any) => { row = { ...payload, attempted_at: attemptedAt ?? new Date().toISOString() }; return q; },
      single: async () => ({ data: row }),
      update: (payload: any) => { update = payload; return q; },
      then: (resolve: any) => { if (!failStamp) row = { ...row, ...update }; resolve({ error: failStamp ? { message: 'DB offline' } : null }); },
    }; return q;
  } };
  return { db, fail: (v: boolean) => { failStamp = v; }, age: () => { row.attempted_at = '2000-01-01'; } };
}

it('retries an uncertain send with the original payload and same provider key', async () => {
  const state = database();
  const send = vi.fn(async () => ({ id: 'provider-id' }));
  const run = (payload: any) => deliverAcceptanceOnce({ db: state.db, jobId, organizationId: 'org', key, payload, send });
  state.fail(true);
  expect((await run({ html: 'original' })).error).toContain('save failed');
  state.fail(false);
  await run({ html: 'new changing invitation date' });
  expect(send.mock.calls[1]).toEqual([{ html: 'original' }, key]);
  expect((await run({ html: 'again' })).alreadySent).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
});
it('does not duplicate uncertain mail after the provider deduplication window', async () => {
  const state = database();
  const send = vi.fn(async () => ({ error: 'timeout' }));
  const params = { db: state.db, jobId, organizationId: 'org', key, payload: { html: 'test' }, send };
  await deliverAcceptanceOnce(params);
  state.age();
  expect((await deliverAcceptanceOnce(params)).error).toContain('requires review');
  expect(send).toHaveBeenCalledOnce();
});

it.each([288, 60_000])('allows a new DB reservation %i ms ahead of the application clock', async (futureMs) => {
  const now = Date.parse('2026-09-28T16:04:01.022Z');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const state = database(new Date(now + futureMs).toISOString());
  const send = vi.fn(async () => ({ id: 'provider-id' }));
  const payload = { html: 'frozen confirmation' };
  expect(await deliverAcceptanceOnce({ db: state.db, jobId, organizationId: 'org', key, payload, send }))
    .toEqual({ id: 'provider-id' });
  expect(send).toHaveBeenCalledExactlyOnceWith(payload, key);
});

it.each([60_001, 5 * 60_000])('requires review for a DB reservation %i ms in the future', async (futureMs) => {
  const now = Date.parse('2026-09-28T16:04:01.022Z');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const state = database(new Date(now + futureMs).toISOString());
  const send = vi.fn(async () => ({ id: 'provider-id' }));
  expect(await deliverAcceptanceOnce({ db: state.db, jobId, organizationId: 'org', key, payload: {}, send }))
    .toEqual({ error: 'Delivery outcome requires review' });
  expect(send).not.toHaveBeenCalled();
});

it('requires review for an invalid reservation date', async () => {
  const state = database('not-a-date');
  const send = vi.fn(async () => ({ id: 'provider-id' }));
  expect(await deliverAcceptanceOnce({ db: state.db, jobId, organizationId: 'org', key, payload: {}, send }))
    .toEqual({ error: 'Delivery outcome requires review' });
  expect(send).not.toHaveBeenCalled();
});

it.each([23 * 3_600_000 - 1, 23 * 3_600_000])('retains the 23-hour cutoff for reservation age %i ms', async (ageMs) => {
  const now = Date.parse('2026-09-28T16:04:01.022Z');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const state = database(new Date(now - ageMs).toISOString());
  const send = vi.fn(async () => ({ id: 'provider-id' }));
  const result = await deliverAcceptanceOnce({ db: state.db, jobId, organizationId: 'org', key, payload: {}, send });
  if (ageMs < 23 * 3_600_000) {
    expect(result).toEqual({ id: 'provider-id' });
    expect(send).toHaveBeenCalledOnce();
  } else {
    expect(result).toEqual({ error: 'Delivery outcome requires review' });
    expect(send).not.toHaveBeenCalled();
  }
});

it('restricts provider keys to the correct job and email type', () => {
  expect(validAcceptanceDeliveryKey('school_contract_extra_accepted', jobId, key)).toBe(true);
  expect(validAcceptanceDeliveryKey('school_extra_first_lesson_invite', jobId, key)).toBe(false);
  expect(validAcceptanceDeliveryKey('password_reset', jobId, key)).toBeFalsy();
});
