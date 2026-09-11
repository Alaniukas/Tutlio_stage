import { beforeEach, expect, it, vi } from 'vitest';
import { buildExtraLessonsOrderSnapshot } from '../../src/lib/extraLessonsContract';

const state = vi.hoisted(() => ({ contract: {} as any, render: vi.fn(), update: vi.fn(), sign: vi.fn(), job: null as any, freeze: vi.fn(), rpc: vi.fn() }));
vi.mock('../../api/_lib/schoolAcceptanceJobs.js', async importOriginal => ({
  ...await importOriginal<any>(), getAcceptanceJob: async () => state.job,
}));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: vi.fn(async () => null) }));
vi.mock('../../api/_lib/extraLessonsFirstLessonInvite.js', () => ({ sendFirstLessonInvite: vi.fn() }));
vi.mock('../../api/_lib/extraLessonsPdf.js', () => ({
  renderAndStoreExtraLessonsPdf: state.render,
  freezeExtraLessonsPdfSource: state.freeze,
  renderExtraLessonsAnnexPdf: vi.fn(),
  signSchoolContractPdf: state.sign,
}));
vi.mock('../../api/_lib/extraLessonsContractShared.js', async importOriginal => ({
  ...await importOriginal<any>(),
  serviceSupabase: () => ({ from: () => ({ update: state.update }), rpc: state.rpc }),
  loadExtraLessonsContractByToken: async () => ({ contract: state.contract, tokenRow: { id: 'token-id' } }),
}));
import handler from '../../api/extra-lessons-contract-accept';

beforeEach(() => {
  vi.clearAllMocks();
  state.job = null;
  state.freeze.mockResolvedValue({ kind: 'docx', base64: 'frozen-source' });
  state.rpc.mockResolvedValue({ data: { id: 'job', contract_id: 'contract', status: 'queued', attempts: 0 }, error: null });
  state.contract = { id: 'contract', organization_id: 'school', contract_number: 'QA', pdf_url: 'stored.pdf',
    student: { full_name: 'Test child' }, organizations: { name: 'Test school' },
    order_snapshot: buildExtraLessonsOrderSnapshot({ service_name: 'Math', service_type: 'individual',
      duration_minutes: 60, start_date: '2026-09-01', end_date: '2027-06-01', unit_price_eur: 20,
      base_lessons_per_month: 4, schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '17:00' }] }),
  };
  state.sign.mockImplementation(async (_db, path) => path ? `signed:${path}` : null);
  state.render.mockResolvedValue({ uploadedPath: 'new.pdf', pdfBase64: 'PDF' });
});
async function request(method = 'GET', body = {}) {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockImplementation(value => value) };
  return handler({ method, query: { token: 'test' }, body } as any, response);
}

it('opens a saved offer without contacting an unavailable converter', async () => {
  state.render.mockRejectedValue(new Error('converter down'));
  expect((await request()).pdfUrl).toBe('signed:stored.pdf');
  expect(state.render).not.toHaveBeenCalled();
});

it('renders edited fields without changing the saved contract', async () => {
  const result = await request('POST', { preview: true, order_patch: {} });
  expect(result.pdfUrl).toBe('signed:new.pdf');
  expect(state.render).toHaveBeenCalledOnce();
  expect(state.update).not.toHaveBeenCalled();
});

it('never substitutes an old PDF when rendering changed fields fails', async () => {
  state.render.mockRejectedValue(new Error('converter down'));
  expect((await request('POST', { preview: true })).pdfUrl).toBeNull();
  expect(state.sign).not.toHaveBeenCalled();
});

it('accepted contracts always use their frozen PDF', async () => {
  state.contract.accepted_at = '2026-09-08T12:00:00Z';
  state.contract.signed_contract_url = 'frozen.pdf';
  expect((await request()).pdfUrl).toBe('signed:frozen.pdf');
  expect(state.render).not.toHaveBeenCalled();
});

it('saves acceptance without invoking the broken converter', async () => {
  state.render.mockRejectedValue(new Error('converter down'));
  const result = await request('POST', { accepted_terms: true, start_within_14_days: false });
  expect(result.pending).toBe(true);
  expect(state.render).not.toHaveBeenCalled();
  expect(state.rpc.mock.calls[0][0]).toBe('enqueue_school_acceptance');
  const payload = state.rpc.mock.calls[0][1].p_payload;
  expect(payload.source.base64).toBe('frozen-source');
  expect(payload.acceptance.accepted_terms).toBe(true);
  expect(payload.acceptance.document_sha256).toHaveLength(64);
  expect(state.update).not.toHaveBeenCalled();
});

it('duplicate submissions return the saved job without changing its snapshot', async () => {
  state.job = { contract_id: 'contract', status: 'queued', attempts: 2 };
  expect((await request('POST', { accepted_terms: true })).pending).toBe(true);
  expect(state.freeze).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
});

it('does not claim success when the durable write fails', async () => {
  state.rpc.mockResolvedValue({ data: null, error: { message: 'DB offline' } });
  expect((await request('POST', { accepted_terms: true })).code).toBe('acceptance_not_saved');
});
