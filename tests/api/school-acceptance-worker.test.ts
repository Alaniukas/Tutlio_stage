import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ convert: vi.fn(), invite: vi.fn() }));
vi.mock('../../api/_lib/docxConverter.js', () => ({ convertDocxBufferToPdfWithFallbacks: state.convert }));
vi.mock('../../api/_lib/extraLessonsFirstLessonInvite.js', () => ({ sendFirstLessonInvite: state.invite }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ internalApiOrigin: () => 'https://internal.example' }));
import {
  processAcceptanceJob,
  acceptanceRetrySeconds,
  stripAcceptanceSourceBytes,
  acceptanceSourceBytesPresent,
} from '../../api/_lib/schoolAcceptanceJobs';

const frozen = Buffer.from('frozen').toString('base64');
const job = () => ({
  id: 'job', organization_id: 'org', contract_id: 'contract', lease_id: 'lease', attempts: 1,
  payload: {
    source: { kind: 'docx', base64: frozen },
    confirmation: { to: '', data: { schoolName: 'Demo' } },
    invite: { payerEmail: '' },
    acceptance: { accepted_terms: true },
  },
});
function database() {
  const writes: any[] = [];
  const chain: any = { eq: () => chain, gt: () => chain, select: async () => ({ data: [{ id: 'job' }], error: null }) };
  const db: any = {
    from: () => ({ update: (v: any) => { writes.push(v); return chain; } }),
    rpc: vi.fn(async () => ({ data: true, error: null })),
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        download: vi.fn(async () => ({
          error: null,
          data: { arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer },
        })),
      }),
    },
  };
  return { db, writes };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  state.convert.mockResolvedValue(Buffer.from('%PDF-1.7\nvalid'));
  state.invite.mockResolvedValue({ sent: false });
});

it('converter failure leaves the contract untouched and schedules a retry', async () => {
  const { db, writes } = database();
  state.convert.mockRejectedValue(new Error('thread exhaustion'));
  expect(await processAcceptanceJob(db, {} as any, job())).toEqual({ completed: false });
  expect(db.rpc).not.toHaveBeenCalled();
  expect(writes[0]).toMatchObject({ status: 'queued', lease_id: null });
  expect(writes.some((w) => w.payload)).toBe(false);
  expect(Date.parse(writes[0].available_at)).toBeGreaterThan(Date.now());
});

it('converts frozen bytes then atomically finalizes before notification completion', async () => {
  const { db, writes } = database();
  await processAcceptanceJob(db, {} as any, job());
  expect(state.convert.mock.calls[0][0].toString()).toBe('frozen');
  expect(db.rpc.mock.calls[0][0]).toBe('finalize_school_acceptance');
  expect(writes.at(-1).status).toBe('completed');
});

it('drops source bytes from Postgres after the final PDF is stored', async () => {
  const { db, writes } = database();
  await processAcceptanceJob(db, {} as any, job());
  const stripped = writes.find((w) => w.payload);
  expect(stripped.payload.source.base64).toBeUndefined();
  expect(stripped.payload.source.kind).toBe('docx');
  expect(stripped.payload.acceptance).toEqual({ accepted_terms: true });
  expect(stripped.payload.confirmation).toEqual({ to: '', data: { schoolName: 'Demo' } });
});

it('a crash after finalization resumes delivery without reconversion', async () => {
  const { db, writes } = database();
  await processAcceptanceJob(db, {} as any, { ...job(), finalized_at: '2026-09-08', confirmation_sent: true });
  expect(state.convert).not.toHaveBeenCalled();
  expect(db.rpc).not.toHaveBeenCalled();
  expect(writes.at(-1).status).toBe('completed');
});

it('resumes a finalized job after source bytes were already stripped', async () => {
  const { db, writes } = database();
  const resumed = job();
  resumed.finalized_at = '2026-09-08';
  resumed.confirmation_sent = true;
  resumed.pdf_path = 'org/contracts/contract/accepted.pdf';
  resumed.payload = stripAcceptanceSourceBytes(resumed.payload);
  expect(acceptanceSourceBytesPresent(resumed.payload)).toBe(false);
  expect(await processAcceptanceJob(db, {} as any, resumed)).toEqual({ completed: true });
  expect(state.convert).not.toHaveBeenCalled();
  expect(writes.some((w) => w.payload)).toBe(false);
  expect(writes.at(-1).status).toBe('completed');
});

it('confirmation failure after finalization keeps the stripped payload on retry', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('mail down'); }));
  const { db, writes } = database();
  const pending = job();
  pending.payload.confirmation.to = 'payer@example.com';
  expect(await processAcceptanceJob(db, {} as any, pending)).toEqual({ completed: false });
  const stripped = writes.find((w) => w.payload);
  expect(stripped.payload.source.base64).toBeUndefined();
  expect(stripped.payload.source.kind).toBe('docx');
  const queued = writes.at(-1);
  expect(queued).toMatchObject({ status: 'queued', lease_id: null });
  expect(queued.payload).toBeUndefined();
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

it('stripAcceptanceSourceBytes is a no-op when bytes are already gone', () => {
  const payload = { source: { kind: 'pdf' }, invite: { payerEmail: 'a@b.lt' } };
  expect(stripAcceptanceSourceBytes(payload)).toBe(payload);
  expect(acceptanceSourceBytesPresent(payload)).toBe(false);
});
