import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: [] as any[], send: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from() {
  let after = false;
  const query: any = { select: () => query, eq: () => query, is: () => query, order: () => query, limit: () => query,
    gt: () => { after = true; return query; }, then: (resolve: any) => resolve({ data: after ? [] : state.rows, error: null }) };
  return query;
} }) }));
vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));
vi.mock('../../api/_lib/publicLinkToken.js', () => ({ publicAppOrigin: () => 'https://example.com' }));
vi.mock('../../api/_lib/schoolMonthlyInvoiceEmail.js', () => ({ sendSchoolMonthlyInvoiceEmail: state.send }));
import handler from '../../api/retry-school-monthly-invoice-emails';
import { EXTRA_LESSONS_LEGAL_BODY } from '../../src/lib/extraLessonsLegalBody';

const invoice = { id: 'invoice', organization_id: 'org', payment_status: 'pending', student: {}, org: { id: 'org' }, contract: {} };
async function run() {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({ method: 'GET' } as any, response); return response;
}
beforeEach(() => { state.rows = []; state.send.mockReset().mockResolvedValue({ sent: true }); });

describe('school invoice retry outbox', () => {
  it('retries an unsent invoice without recreating it', async () => {
    state.rows = [invoice];
    const result = await run();
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(result.status).toHaveBeenCalledWith(200);
  });
  it('holds a canonical fixed invoice even when no historical delivery row exists', async () => {
    state.rows = [{ ...invoice, organization_id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', billing_model: 'fixed', contract: { filled_body: EXTRA_LESSONS_LEGAL_BODY } }];
    const result = await run();
    expect(state.send).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(409);
  });
  it('holds expired uncertain attempts and historical deliveries but permits stamp repair', async () => {
    state.rows = [
      { ...invoice, delivery: { attempted_at: '2020-01-01T00:00:00Z', payload: {} } },
      { ...invoice, id: 'legacy', delivery: { attempted_at: new Date().toISOString(), payload: null } },
      { ...invoice, id: 'repair', delivery: { attempted_at: '2020-01-01T00:00:00Z', sent_at: '2020-01-01T00:00:01Z', payload: {} } },
    ];
    const result = await run();
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send.mock.calls[0][1].id).toBe('repair');
    expect(result.json).toHaveBeenCalledWith(expect.objectContaining({ held: 2 }));
  });
  it('returns a failed run when delivery is still unavailable', async () => {
    state.rows = [invoice]; state.send.mockResolvedValue({ sent: false, reason: 'timeout' });
    const result = await run();
    expect(result.status).toHaveBeenCalledWith(503);
  });
});
