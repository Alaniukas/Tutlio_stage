// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  queue: vi.fn(), prepare: vi.fn(), deliver: vi.fn(), repair: vi.fn(), hold: vi.fn(), due: vi.fn(), provider: vi.fn(),
  db: { from: vi.fn() },
}));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => state.db }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => null, isInternalRequest: () => true }));
vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));
vi.mock('../../api/_lib/schoolMaterialDigest.js', () => ({ queueSchoolMaterialAudience: state.queue, prepareSchoolMaterialDigests: state.prepare,
  deliverSchoolMaterialDigest: state.deliver, repairSchoolMaterialDigestEntries: state.repair, holdExpiredSchoolMaterialDigests: state.hold, dueSchoolMaterialDigestIds: state.due }));
vi.mock('resend', () => ({ Resend: class { emails = { send: state.provider }; } }));
vi.mock('../../api/_lib/publicLinkToken.js', () => ({ publicAppOrigin: () => 'https://school.test' }));
import handler from '../../api/process-school-materials';

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T01:00:00Z'));
  vi.stubEnv('RESEND_API_KEY', 'test-key'); vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', ''); vi.stubEnv('SCHOOL_MATERIAL_DIGEST_HOUR', '20');
  state.queue.mockResolvedValue(3); state.prepare.mockResolvedValue([]); state.repair.mockResolvedValue(undefined); state.hold.mockResolvedValue(undefined); state.due.mockResolvedValue(['retry']);
  state.provider.mockResolvedValue({ data: { id: 'provider-confirmed' }, error: null });
  state.deliver.mockImplementation(async (_db, id, send) => {
    const result = await send({ from: 'School <info@school.test>', to: ['child@school.test'], subject: 'Materials', html: 'Synthetic test email', items: [] }, `school-material-digest/${id}`);
    return result.id ? 'sent' : 'deferred';
  });
  state.db.from.mockImplementation(() => {
    const query: any = { select: () => query, not: () => query, eq: () => query, order: () => query, limit: () => query,
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
    return query;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function run(query: Record<string, string> = {}) {
  const result: { status: number; body: any } = { status: 0, body: null };
  const response: any = { setHeader() {}, status(value: number) { result.status = value; return response; }, json(value: any) { result.body = value; return response; } };
  await handler({ method: 'GET', headers: {}, query } as any, response); return result;
}

it('retries an existing digest before the evening creation hour without making another daily batch', async () => {
  const result = await run();
  expect(result.status).toBe(200); expect(result.body.sent).toBe(1); expect(state.prepare).not.toHaveBeenCalled();
  expect(state.repair).toHaveBeenCalledTimes(1); expect(state.hold).toHaveBeenCalledTimes(1);
  expect(state.provider).toHaveBeenCalledWith({ from: 'School <info@school.test>', to: ['child@school.test'], subject: 'Materials', html: 'Synthetic test email' }, { idempotencyKey: 'school-material-digest/retry' });
});

it('keeps processing healthy deliveries after a retry error instead of letting one job block the batch', async () => {
  const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
  state.due.mockResolvedValue(['uncertain','healthy']); state.deliver.mockRejectedValueOnce(new Error('Temporary database failure'));
  const result = await run();
  expect(result.status).toBe(200); expect(result.body.sent).toBe(1); expect(result.body.failures).toEqual(['uncertain']);
  expect(state.deliver).toHaveBeenCalledTimes(2); expect(state.provider).toHaveBeenCalledTimes(1); logger.mockRestore();
});

it('prepares evening batches while honoring direct-send suppression', async () => {
  vi.setSystemTime(new Date('2026-09-28T18:00:00Z')); vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '1');
  const result = await run();
  expect(result.status).toBe(200); expect(result.body.sent).toBe(0); expect(state.prepare).toHaveBeenCalledTimes(1);
  expect(state.deliver).not.toHaveBeenCalled(); expect(state.provider).not.toHaveBeenCalled();
});

it('keeps existing retries working if a new evening reservation temporarily fails', async () => {
  const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.setSystemTime(new Date('2026-09-28T18:00:00Z')); state.prepare.mockRejectedValueOnce(new Error('Reservation unavailable'));
  const result = await run();
  expect(result.status).toBe(200); expect(result.body.sent).toBe(1); expect(result.body.failures).toEqual(['digest_preparation']);
  expect(state.provider).toHaveBeenCalledTimes(1); logger.mockRestore();
});

it('requires an authorized admin for preview and performs no fanout or provider call on rejection', async () => {
  const result = await run({ preview: '1' });
  expect(result.status).toBe(403); expect(state.queue).not.toHaveBeenCalled(); expect(state.provider).not.toHaveBeenCalled();
});
