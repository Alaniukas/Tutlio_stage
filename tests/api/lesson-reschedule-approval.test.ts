// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), proposal: vi.fn(), notify: vi.fn(), preview: vi.fn(), verifyToken: vi.fn(),
  request: {} as any, recipient: {} as any,
  calls: [] as Array<{ table: string; kind: string; key?: string; value?: unknown }>,
}));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('../../api/_lib/lessonRescheduleApproval.js', () => ({
  emailRescheduleProposal: mocks.proposal, notifyRescheduleDecision: mocks.notify,
  reschedulePreview: mocks.preview, verifyRescheduleApprovalToken: mocks.verifyToken,
}));
vi.mock('../../api/_lib/schoolConsultationsAccess.js', () => ({ serviceSupabase: () => ({
  rpc: mocks.rpc,
  from(table: string) {
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      contains: (key: string, value: unknown) => { mocks.calls.push({ table, kind: 'contains', key, value }); return q; },
      eq: (key: string, value: unknown) => { mocks.calls.push({ table, kind: 'eq', key, value }); return q; },
      update: (value: unknown) => { mocks.calls.push({ table, kind: 'update', value }); return q; },
      single: async () => ({ data: table === 'lesson_reschedule_requests' ? mocks.request : mocks.recipient, error: null }),
      maybeSingle: async () => ({ data: table === 'lesson_reschedule_requests' ? mocks.request : mocks.recipient, error: null }),
      then: (resolve: any) => resolve({ data: [mocks.request], error: null }),
    };
    return q;
  },
}) }));
import handler from '../../api/lesson-reschedule-approval';
const requestId = '00000000-0000-4000-8000-000000000001';
const recipientId = '00000000-0000-4000-8000-000000000002';
const tutorId = '00000000-0000-4000-8000-000000000003';
const sessionId = '00000000-0000-4000-8000-000000000004';
function response() {
  const output: any = { statusCode: 0, body: null, headers: {} };
  const res: any = {
    setHeader: (name: string, value: string) => { output.headers[name] = value; },
    status: (code: number) => { output.statusCode = code; return res; },
    json: (body: any) => { output.body = body; return res; }, output,
  };
  return res;
}
function request(body: any, method = 'POST') {
  return { method, body: method === 'POST' ? body : {}, query: method === 'GET' ? body : {}, headers: { authorization: 'Bearer tutor-token' } } as any;
}
const proposal = {
  action: 'request', sessionId, oldStart: '2030-10-22T10:00:00Z', oldEnd: '2030-10-22T11:00:00Z',
  newStart: '2030-10-23T12:00:00Z', newEnd: '2030-10-23T13:00:00Z', scope: 'single',
  reason: 'Keičiamas darbo grafikas', requestedBy: 'tutor', fields: { topic: 'Tema' },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls = [];
  mocks.request = { id: requestId, status: 'pending', scope: 'single', changes: [{ id: sessionId }], expires_at: '2030-10-22' };
  mocks.recipient = { id: recipientId, email: 'parent@example.com', status: 'pending', student_ids: [] };
  mocks.auth.mockResolvedValue({ userId: tutorId });
  mocks.rpc.mockResolvedValue({ data: requestId, error: null });
  mocks.proposal.mockResolvedValue(true);
  mocks.notify.mockResolvedValue(undefined);
  mocks.verifyToken.mockReturnValue(true);
  mocks.preview.mockImplementation(async (_db, row) => ({ status: row.status }));
});
describe('lesson reschedule approval API access and delivery', () => {
  it('requires a real tutor session before creating any proposal', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = response();
    await handler(request(proposal), res);
    expect(res.output.statusCode).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.proposal).not.toHaveBeenCalled();
  });
  it('takes the tutor from authentication and publishes only after email delivery', async () => {
    const res = response();
    await handler(request({ ...proposal, tutorId: 'someone-else' }), res);
    expect(res.output.statusCode).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('create_lesson_reschedule_request', expect.objectContaining({
      p_tutor: tutorId, p_session: sessionId, p_scope: 'single', p_fields: { topic: 'Tema' },
    }));
    expect(mocks.calls).toContainEqual({ table: 'lesson_reschedule_requests', kind: 'update', value: { email_ready: true } });
  });
  it('cancels a failed delivery so an older or partially delivered link cannot move the lesson', async () => {
    mocks.proposal.mockResolvedValue(false);
    const res = response();
    await handler(request(proposal), res);
    expect(res.output.statusCode).toBe(503);
    expect(res.output.body.code).toBe('reschedule_email_failed');
    expect(mocks.calls.some(c => c.kind === 'update' && (c.value as any).status === 'cancelled')).toBe(true);
    expect(mocks.calls.some(c => c.kind === 'update' && (c.value as any).email_ready)).toBe(false);
  });
  it('does not mutate a proposal when an email scanner opens either choice URL', async () => {
    const res = response();
    await handler(request({ request: requestId, recipient: recipientId, t: 'token', choice: 'approved' }, 'GET'), res);
    expect(res.output.statusCode).toBe(200);
    expect(res.output.headers['Cache-Control']).toBe('no-store');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('refuses invalid or cross-recipient signed links before reading personal records', async () => {
    mocks.verifyToken.mockReturnValue(false);
    const res = response();
    await handler(request({ request: requestId, recipient: recipientId, t: 'wrong', decision: 'approved' }), res);
    expect(res.output.statusCode).toBe(404);
    expect(mocks.calls).toHaveLength(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('retains a persisted answer if notification delivery fails', async () => {
    mocks.rpc.mockImplementation(async () => { mocks.request.status = 'rejected'; return { data: { status: 'rejected' }, error: null }; });
    mocks.notify.mockRejectedValue(new Error('Temporary email outage'));
    const res = response();
    await handler(request({ request: requestId, recipient: recipientId, t: 'token', decision: 'rejected' }), res);
    expect(res.output.statusCode).toBe(200);
    expect(res.output.body.status).toBe('rejected');
    expect(mocks.rpc).toHaveBeenCalledWith('respond_lesson_reschedule_request', {
      p_request: requestId, p_email: 'parent@example.com', p_decision: 'rejected',
    });
  });
  it('limits the status list to the authenticated tutor and requested lesson', async () => {
    const res = response();
    await handler(request({ action: 'list', session: sessionId, tutorId: 'someone-else' }, 'GET'), res);
    expect(res.output.statusCode).toBe(200);
    expect(mocks.calls).toContainEqual({ table: 'lesson_reschedule_requests', kind: 'eq', key: 'tutor_id', value: tutorId });
    expect(mocks.calls).toContainEqual({ table: 'lesson_reschedule_requests', kind: 'contains', key: 'changes', value: JSON.stringify([{ id: sessionId }]) });
    expect(res.output.body.requests[0]).not.toHaveProperty('recipient');
  });
  it('encodes the status filter as valid JSON through the actual Supabase SDK', async () => {
    await handler(request({ action: 'list', session: sessionId }, 'GET'), response());
    const filter = mocks.calls.find(call => call.kind === 'contains')!;
    const requests: URL[] = [];
    const db = createClient('https://example.supabase.co', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async input => {
        requests.push(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url));
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      } },
    });
    await db.from('lesson_reschedule_requests').select('id').contains(filter.key!, filter.value as string);
    expect(requests).toHaveLength(1);
    const encoded = requests[0].searchParams.get('changes')!;
    expect(encoded.startsWith('cs.')).toBe(true);
    expect(JSON.parse(encoded.slice(3))).toEqual([{ id: sessionId }]);
  });
});
