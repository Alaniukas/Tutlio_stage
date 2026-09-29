import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  getClient: vi.fn(),
  resolveReporter: vi.fn(),
  verifyAttachments: vi.fn(),
  sendTeam: vi.fn(),
  notifyStatus: vi.fn(),
  syncTicket: vi.fn(),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.verifyAuth }));
vi.mock('../../api/_lib/supportRequest.js', () => ({ allowSupportRequest: () => true }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({ getSupportServiceClient: mocks.getClient }));
vi.mock('../../api/_lib/inAppSupport.js', () => ({
  resolveInAppSupportReporter: mocks.resolveReporter,
  verifyInAppSupportAttachments: mocks.verifyAttachments,
}));
vi.mock('../../api/_lib/inAppSupportEmail.js', () => ({ sendInAppSupportNotification: mocks.sendTeam }));
vi.mock('../../api/_lib/inAppSupportStatusEmail.js', () => ({
  allowedInAppSupportSiteOrigin: (origin: unknown) => origin === 'https://tutlio.pl' ? origin : null,
  inAppSupportReference: (id: string) => `SUP-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
  inAppSupportStatusSignature: () => 'current-signature',
  notifyInAppSupportStatus: mocks.notifyStatus,
}));
vi.mock('../../api/_lib/inAppSupportTicketSync.js', () => ({
  priorityForSupportImpact: () => 'high',
  syncInAppSupportTicket: mocks.syncTicket,
}));

import handler from '../../api/in-app-support';

const requestId = '8cb31cd5-7c88-43ea-b850-a337c92099c1';
const storedId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const input = {
  requestId,
  category: 'bug',
  title: 'A different report title',
  context: 'This is different text in the second submission.',
  steps: ['Open the page', 'Repeat the original click'],
  expectedOutcome: 'The page should show the saved result.',
  actualOutcome: 'The page unexpectedly showed an error.',
  impact: 'high',
  impactDetails: 'This blocks some of the work.',
  page: '/calendar',
  locale: 'en',
  portal: 'tutor',
  environment: {
    userAgent: 'Second browser', platform: 'Windows', viewport: '900x600',
    language: 'en-US', occurredAt: '2026-09-29T10:00:00.000Z',
  },
  transcript: [{ role: 'user', content: 'New, changed conversation' }],
  attachments: [],
};

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: storedId,
    request_id: requestId,
    reporter_user_id: 'owner-user',
    reporter_name: 'Original Reporter',
    reporter_email: 'original@example.com',
    reporter_role: 'tutor',
    organization_id: null,
    organization_name: null,
    category: 'bug',
    title: 'Original saved title',
    context: 'This original context must never change.',
    steps: ['First original step'],
    expected_outcome: 'The original expected result.',
    actual_outcome: 'The original actual result.',
    impact: 'high',
    impact_details: 'Original impact.',
    page: '/students',
    locale: 'lt',
    environment: { ...input.environment, supportPortal: 'tutor', siteOrigin: 'https://tutlio.pl' },
    transcript: [{ role: 'user', content: 'Original conversation' }],
    attachments: [{ path: 'in-app/owner-user/original.png', name: 'original.png', type: 'image/png', size: 100 }],
    coding_agent_prompt: 'Original generated prompt',
    status: 'registered',
    priority: 'high',
    target_date: null,
    status_updated_at: '2026-09-29T09:00:00.000Z',
    status_notified_signature: 'current-signature',
    trello_card_id: 'existing-card',
    trello_sync_error: null,
    team_notified_at: '2026-09-29T09:00:02.000Z',
    created_at: '2026-09-29T09:00:00.000Z',
    ...overrides,
  };
}

function database(rows: Array<Record<string, unknown> | null>, insertError?: { code: string }) {
  const updates: Record<string, unknown>[] = [];
  const insert = vi.fn(() => query);
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: rows.shift() ?? null, error: null })),
    insert,
    single: vi.fn(async () => ({ data: null, error: insertError || null })),
    update: vi.fn((patch: Record<string, unknown>) => { updates.push(patch); return query; }),
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  };
  const from = vi.fn(() => query);
  return { client: { from }, insert, updates };
}

function response() {
  const result = { statusCode: 200, body: null as unknown };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => { result.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { result.body = body; return res; }),
  };
  return { res, result };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyAuth.mockResolvedValue({ userId: 'owner-user', isInternal: false });
  mocks.resolveReporter.mockResolvedValue({
    name: 'New Reporter', email: 'new@example.com', role: 'tutor', organizationId: null, organizationName: null,
  });
  mocks.verifyAttachments.mockResolvedValue([]);
  mocks.sendTeam.mockResolvedValue('team-email-1');
  mocks.notifyStatus.mockResolvedValue(true);
  mocks.syncTicket.mockResolvedValue(true);
});

describe('in-app support request ID retries', () => {
  it('returns the original ticket without rewriting it or repeating completed deliveries', async () => {
    const db = database([storedRow()]);
    mocks.getClient.mockReturnValue(db.client);
    const { res, result } = response();

    await handler({ method: 'POST', headers: {}, body: input } as any, res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ id: storedId, reference: 'SUP-17EE7859', status: 'registered' });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
    expect(mocks.resolveReporter).not.toHaveBeenCalled();
    expect(mocks.verifyAttachments).not.toHaveBeenCalled();
    expect(mocks.sendTeam).not.toHaveBeenCalled();
    expect(mocks.notifyStatus).not.toHaveBeenCalled();
    expect(mocks.syncTicket).not.toHaveBeenCalled();
  });

  it('retries failed deliveries using only the original stored ticket content', async () => {
    const db = database([storedRow({
      team_notified_at: null,
      status_notified_signature: null,
      trello_card_id: null,
      trello_sync_error: 'Previous sync failed',
    })]);
    mocks.getClient.mockReturnValue(db.client);
    const { res, result } = response();

    await handler({ method: 'POST', headers: {}, body: input } as any, res);

    expect(result.statusCode).toBe(200);
    expect(mocks.sendTeam).toHaveBeenCalledWith(expect.objectContaining({
      reporter: expect.objectContaining({ email: 'original@example.com', name: 'Original Reporter' }),
      report: expect.objectContaining({
        title: 'Original saved title', context: 'This original context must never change.',
        page: '/students', transcript: [{ role: 'user', content: 'Original conversation' }],
      }),
      codingAgentPrompt: 'Original generated prompt',
    }));
    expect(mocks.notifyStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: 'Original saved title', reporter_email: 'original@example.com', page: '/students',
      environment: expect.objectContaining({ siteOrigin: 'https://tutlio.pl' }),
    }));
    expect(mocks.syncTicket).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: 'Original saved title', page: '/students', trello_card_id: null,
    }));
    expect(db.updates).toEqual([expect.objectContaining({
      team_notification_email_id: 'team-email-1', team_notification_error: null,
    })]);
    expect(db.updates[0]).not.toHaveProperty('title');
    expect(db.updates[0]).not.toHaveProperty('context');
  });

  it('does not mark the team notified when the provider returns no email ID', async () => {
    const db = database([storedRow({ team_notified_at: null })]);
    mocks.getClient.mockReturnValue(db.client);
    mocks.sendTeam.mockResolvedValue(null);
    const { res, result } = response();

    await handler({ method: 'POST', headers: {}, body: input } as any, res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ notificationSent: false });
    expect(db.updates).toEqual([{
      team_notification_error: 'The team email could not be delivered or recorded.',
    }]);
  });

  it('does not move a linked Trello card on reporter retry after an inbound sync error', async () => {
    const db = database([storedRow({ trello_sync_error: 'Set a due date before moving to Vykdoma.' })]);
    mocks.getClient.mockReturnValue(db.client);
    const { res, result } = response();

    await handler({ method: 'POST', headers: {}, body: input } as any, res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ trelloSynced: false });
    expect(mocks.syncTicket).not.toHaveBeenCalled();
  });

  it('rejects a request ID belonging to another reporter', async () => {
    const db = database([storedRow({ reporter_user_id: 'someone-else' })]);
    mocks.getClient.mockReturnValue(db.client);
    const { res, result } = response();

    await handler({ method: 'POST', headers: {}, body: input } as any, res);

    expect(result.statusCode).toBe(409);
    expect(db.insert).not.toHaveBeenCalled();
    expect(mocks.sendTeam).not.toHaveBeenCalled();
  });

  it('loads the winner of a concurrent insert instead of replacing it', async () => {
    const db = database([null, storedRow()], { code: '23505' });
    mocks.getClient.mockReturnValue(db.client);
    const { res, result } = response();

    await handler({ method: 'POST', headers: { origin: 'https://tutlio.pl' }, body: input } as any, res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ id: storedId, reference: 'SUP-17EE7859' });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({
      environment: expect.objectContaining({ siteOrigin: 'https://tutlio.pl' }),
    }));
    expect(db.updates).toEqual([]);
    expect(mocks.sendTeam).not.toHaveBeenCalled();
  });
});
