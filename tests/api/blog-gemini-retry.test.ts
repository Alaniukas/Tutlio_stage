import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBlogEditorialBrief } from '../../api/_lib/blogAiProvider';

const fetchMock = vi.fn();
const success = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"topic":"Tutoring","angles":{}}' }] } }] }), { status: 200 });
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('GEMINI_API_KEY', 'test');
  vi.stubEnv('GEMINI_MODEL', '');
  fetchMock.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Gemini blog requests', () => {
  it('uses the replacement model and still honors explicit configuration', async () => {
    fetchMock.mockImplementation(success);
    await generateBlogEditorialBrief({ keyword: 'Tutoring' });
    expect(fetchMock.mock.calls[0][0]).toContain('/gemini-3.1-pro-preview:');
    vi.stubEnv('GEMINI_MODEL', ' configured-model ');
    await generateBlogEditorialBrief({ keyword: 'Tutoring' });
    expect(fetchMock.mock.calls[1][0]).toContain('/configured-model:');
  });
  it.each([400, 401, 403, 404])('does not retry permanent HTTP %s even for non-JSON errors', async (status) => {
    fetchMock.mockResolvedValue(new Response('Unavailable model', { status }));
    await expect(generateBlogEditorialBrief({ keyword: 'Tutoring' })).rejects.toThrow(`error ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([429, 503])('backs off and recovers from HTTP %s', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"Busy"}}', { status })).mockImplementation(success);
    const result = generateBlogEditorialBrief({ keyword: 'Tutoring' });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({ topic: 'Tutoring' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('stops after three transient failures', async () => {
    fetchMock.mockImplementation(() => new Response('Busy', { status: 503 }));
    const result = expect(generateBlogEditorialBrief({ keyword: 'Tutoring' })).rejects.toThrow('after 3 attempts');
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
