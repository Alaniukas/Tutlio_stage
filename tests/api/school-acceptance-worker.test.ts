import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ convert: vi.fn(), invite: vi.fn() }));
vi.mock('../../api/_lib/docxConverter.js', () => ({ convertDocxBufferToPdfWithFallbacks: state.convert }));
vi.mock('../../api/_lib/extraLessonsFirstLessonInvite.js', () => ({ sendFirstLessonInvite: state.invite }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ internalApiOrigin: () => 'https://internal.example' }));
import { processAcceptanceJob, acceptanceRetrySeconds } from '../../api/_lib/schoolAcceptanceJobs';

const job = () => ({ id: 'job', organization_id: 'org', contract_id: 'contract', lease_id: 'lease', attempts: 1,
  payload: { source: { kind: 'docx', base64: Buffer.from('frozen').toString('base64') }, confirmation: { to: '' }, invite: { payerEmail: '' } } });
function database() {
  const writes: any[] = [];
  const chain: any = { eq: () => chain, gt: () => chain, select: async () => ({ data: [{ id: 'job' }], error: null }) };
  const db: any = { from: () => ({ update: (v: any) => { writes.push(v); return chain; } }),
    rpc: vi.fn(async () => ({ data: true, error: null })),
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
  };
  return { db, writes };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.convert.mockResolvedValue(Buffer.from('%PDF-1.7\nvalid'));
  state.invite.mockResolvedValue({ sent: false });
});
it('converter failure leaves the contract untouched and schedules a retry', async () => {
  const { db, writes } = database();
  state.convert.mockRejectedValue(new Error('thread exhaustion'));
  expect(await processAcceptanceJob(db, {} as any, job())).toEqual({ completed: false });
  expect(db.rpc).not.toHaveBeenCalled();
  expect(writes[0]).toMatchObject({ status: 'queued', lease_id: null });
  expect(Date.parse(writes[0].available_at)).toBeGreaterThan(Date.now());
});

it('converts frozen bytes then atomically finalizes before notification completion', async () => {
  const { db, writes } = database();
  await processAcceptanceJob(db, {} as any, job());
  expect(state.convert.mock.calls[0][0].toString()).toBe('frozen');
  expect(db.rpc.mock.calls[0][0]).toBe('finalize_school_acceptance');
  expect(writes.at(-1).status).toBe('completed');
});

it('a crash after finalization resumes delivery without reconversion', async () => {
  const { db, writes } = database();
  await processAcceptanceJob(db, {} as any, { ...job(), finalized_at: '2026-09-08', confirmation_sent: true });
  expect(state.convert).not.toHaveBeenCalled();
  expect(db.rpc).not.toHaveBeenCalled();
  expect(writes.at(-1).status).toBe('completed');
});

it('does not deliver when an obsolete lease fails finalization', async () => {
  const { db } = database();
  db.rpc.mockResolvedValue({ data: false });
  await processAcceptanceJob(db, {} as any, job());
  expect(state.invite).not.toHaveBeenCalled();
});

it('backs off repeated outages without overflowing or dropping the job', () => {
  expect(acceptanceRetrySeconds(1)).toBe(30);
  expect(acceptanceRetrySeconds(100000)).toBe(3600);
});
