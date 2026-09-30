import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInAppSupportTrelloCard } from '../../api/_lib/inAppSupportTrello';

const ENV_NAMES = [
  'TRELLO_API_KEY',
  'TRELLO_TOKEN',
  'TRELLO_BOARD_ID',
  'TRELLO_LIST_NEW_ID',
  'TRELLO_LIST_IN_PROGRESS_ID',
  'TRELLO_LIST_RESOLVED_ID',
  'TRELLO_FEATURE_LIST_NEW_ID',
  'TRELLO_FEATURE_LIST_IN_PROGRESS_ID',
  'TRELLO_FEATURE_LIST_RESOLVED_ID',
] as const;
const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

const baseInput = {
  reference: 'SUP-17EE7859',
  title: 'Alice Student: invoice to pupil@example.com at +370 612 34567 is blank',
  category: 'bug' as const,
  status: 'registered' as const,
  priority: 'high' as const,
  page: '/finance/invoices?token=private',
  dueAt: null,
};

const featureLists = {
  registered: '1'.repeat(24), inProgress: '2'.repeat(24), resolved: '3'.repeat(24),
};

function configureFeatureLists() {
  process.env.TRELLO_FEATURE_LIST_NEW_ID = featureLists.registered;
  process.env.TRELLO_FEATURE_LIST_IN_PROGRESS_ID = featureLists.inProgress;
  process.env.TRELLO_FEATURE_LIST_RESOLVED_ID = featureLists.resolved;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  process.env.TRELLO_API_KEY = 'test-key';
  process.env.TRELLO_TOKEN = 'test-token';
  process.env.TRELLO_BOARD_ID = 'board-id';
  process.env.TRELLO_LIST_NEW_ID = 'registered-list';
  process.env.TRELLO_LIST_IN_PROGRESS_ID = 'progress-list';
  process.env.TRELLO_LIST_RESOLVED_ID = 'resolved-list';
  delete process.env.TRELLO_FEATURE_LIST_NEW_ID;
  delete process.env.TRELLO_FEATURE_LIST_IN_PROGRESS_ID;
  delete process.env.TRELLO_FEATURE_LIST_RESOLVED_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('in-app support Trello sync', () => {
  it('skips cleanly if server-side configuration is incomplete', async () => {
    delete process.env.TRELLO_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncInAppSupportTrelloCard(baseInput)).resolves.toEqual({ synced: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches the configured board before creating a card, with only safe backlog details', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ cards: [] }))
      .mockResolvedValueOnce(response({ id: 'abcdef123456abcdef123456', url: 'https://trello.com/c/example' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncInAppSupportTrelloCard(baseInput);

    expect(result).toEqual({
      synced: true,
      cardId: 'abcdef123456abcdef123456',
      cardUrl: 'https://trello.com/c/example',
      created: true,
    });
    const [searchUrl, searchOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(searchOptions.method).toBe('GET');
    expect(new URL(searchUrl).searchParams.get('idBoards')).toBe('board-id');
    expect(new URL(searchUrl).searchParams.get('query')).toBe('SUP-17EE7859');

    const [cardUrl, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(cardUrl).toBe('https://api.trello.com/1/cards');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      Authorization: expect.stringContaining('test-token'),
      'X-Trello-Client-Identifier': 'tutlio-support-sync',
    });
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({ idList: 'registered-list' });
    expect(body.name).toContain('SUP-17EE7859');
    expect(body.name).not.toContain('Alice Student');
    expect(body.name).not.toContain('pupil@example.com');
    expect(body.name).not.toContain('+370 612 34567');
    expect(body.desc).toContain('Page: /finance/invoices');
    expect(body.desc).not.toContain('token=private');
    expect(body.desc).not.toContain('pupil@example.com');
  });

  it('updates a persisted card and moves it to the progress list with a deadline', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: 'abcdef123456abcdef123456', url: 'https://trello.com/c/example' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncInAppSupportTrelloCard({
      ...baseInput,
      status: 'in_progress',
      dueAt: '2026-10-03T12:00:00Z',
      cardId: 'abcdef123456abcdef123456',
    });

    expect(result).toMatchObject({ synced: true, created: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.trello.com/1/cards/abcdef123456abcdef123456');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(String(options.body))).toMatchObject({
      idList: 'progress-list',
      due: '2026-10-03T12:00:00.000Z',
    });
  });

  it('masks names and IDs in the page path before sending them to Trello', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ cards: [] }))
      .mockResolvedValueOnce(response({ id: 'abcdef123456abcdef123456' }));
    vi.stubGlobal('fetch', fetchMock);

    await syncInAppSupportTrelloCard({ ...baseInput, page: '/students/Alice-123/invoices?token=private' });

    const body = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(body.desc).toContain('Page: /students/:detail/:detail');
    expect(body.desc).not.toContain('Alice-123');
  });

  it('recovers an already-created card by exact reference when its ID was not persisted', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ cards: [
        { id: 'unrelated', idBoard: 'board-id', name: 'SUP-17EE78590 · Different ticket' },
        { id: 'wrong-board', idBoard: 'other-board', name: 'SUP-17EE7859 · Wrong board' },
        { id: 'existing-card', idBoard: 'board-id', name: 'SUP-17EE7859 · Original title', url: 'https://trello.com/c/original' },
      ] }))
      .mockResolvedValueOnce(response({ id: 'existing-card' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncInAppSupportTrelloCard({ ...baseInput, status: 'resolved' });

    expect(result).toEqual({ synced: true, cardId: 'existing-card', cardUrl: 'https://trello.com/c/original', created: false });
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.trello.com/1/cards/existing-card');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(String(options.body)).idList).toBe('resolved-list');
  });

  it('does not create a duplicate card if the lookup fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ error: 'unavailable' }, 503));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncInAppSupportTrelloCard(baseInput)).rejects.toThrow('Trello support card lookup failed (503).');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['registered', featureLists.registered, 'registered-list'],
    ['in_progress', featureLists.inProgress, 'progress-list'],
    ['resolved', featureLists.resolved, 'resolved-list'],
  ] as const)('routes %s features separately while preserving the bug pipeline', async (status, featureList, bugList) => {
    configureFeatureLists();
    const fetchMock = vi.fn().mockImplementation(async () => response({ id: 'abcdef123456abcdef123456' }));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      ...baseInput, status, cardId: 'abcdef123456abcdef123456',
      dueAt: status === 'in_progress' ? '2026-10-03T12:00:00Z' : null,
    };

    await syncInAppSupportTrelloCard({ ...input, category: 'feature' });
    await syncInAppSupportTrelloCard(input);

    const featureBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const bugBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(featureBody.idList).toBe(featureList);
    expect(featureBody.name).toContain('[P1] Feature');
    expect(featureBody.desc).toContain('Type: Feature request');
    expect(featureBody.desc).not.toContain('pupil@example.com');
    expect(bugBody.idList).toBe(bugList);
    expect(bugBody.name).toContain('[P1] Bug');
    if (status === 'in_progress') expect(featureBody.due).toBe('2026-10-03T12:00:00.000Z');
  });

  it('keeps feature cards in the shared pipeline until all feature settings are introduced', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ cards: [] }))
      .mockResolvedValueOnce(response({ id: 'abcdef123456abcdef123456' }));
    vi.stubGlobal('fetch', fetchMock);

    await syncInAppSupportTrelloCard({ ...baseInput, category: 'feature' });

    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)))
      .toMatchObject({ idList: 'registered-list', pos: 'top' });
  });

  it('moves a legacy feature card into the feature pipeline by its original reference without creating a duplicate', async () => {
    configureFeatureLists();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ cards: [{
        id: 'existing-feature', idBoard: 'board-id', name: 'SUP-17EE7859 · [P1] Feature /finance',
        desc: 'Tutlio support reference: SUP-17EE7859\nType: Feature request',
        url: 'https://trello.com/c/original-feature',
      }] }))
      .mockResolvedValueOnce(response({ id: 'existing-feature' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncInAppSupportTrelloCard({ ...baseInput, category: 'feature' });

    expect(result).toMatchObject({ cardId: 'existing-feature', created: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://api.trello.com/1/cards/existing-feature',
      expect.objectContaining({ method: 'PUT', body: expect.any(String) }),
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).idList)
      .toBe(featureLists.registered);
  });

  it.each([
    ['partial', () => { delete process.env.TRELLO_FEATURE_LIST_RESOLVED_ID; }],
    ['malformed', () => { process.env.TRELLO_FEATURE_LIST_NEW_ID = 'not-a-list-id'; }],
    ['duplicate', () => { process.env.TRELLO_FEATURE_LIST_RESOLVED_ID = featureLists.registered; }],
    ['overlapping support', () => { process.env.TRELLO_LIST_NEW_ID = featureLists.registered; }],
  ] as const)('rejects %s feature settings without interrupting bug sync', async (_name, invalidate) => {
    configureFeatureLists();
    invalidate();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ cards: [] }))
      .mockResolvedValueOnce(response({ id: 'abcdef123456abcdef123456' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncInAppSupportTrelloCard({ ...baseInput, category: 'feature' }))
      .rejects.toThrow('TRELLO_FEATURE_LIST_*_ID');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(syncInAppSupportTrelloCard(baseInput)).resolves.toMatchObject({ synced: true });
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).idList)
      .toBe(process.env.TRELLO_LIST_NEW_ID);
  });
});
