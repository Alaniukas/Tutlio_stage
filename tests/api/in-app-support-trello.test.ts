import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInAppSupportTrelloCard } from '../../api/_lib/inAppSupportTrello';

const ENV_NAMES = [
  'TRELLO_API_KEY',
  'TRELLO_TOKEN',
  'TRELLO_BOARD_ID',
  'TRELLO_LIST_NEW_ID',
  'TRELLO_LIST_IN_PROGRESS_ID',
  'TRELLO_LIST_RESOLVED_ID',
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
});
