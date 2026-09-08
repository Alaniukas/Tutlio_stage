import { afterEach, describe, expect, it, vi } from 'vitest';
import { startVisiblePolling } from '../../src/lib/visiblePolling';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('bounded visible polling', () => {
  it('skips background queries, reconciles on return, and stops at its budget', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const run = vi.fn().mockResolvedValue(undefined);
    const stop = startVisiblePolling(run, 15000, 2);
    await vi.advanceTimersByTimeAsync(120000);
    expect(run).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(15000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });
  it('does not overlap slow requests and cleanup prevents further queries', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const stop = startVisiblePolling(run, 15000, 8);
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(1);
    stop(); finish();
    await vi.advanceTimersByTimeAsync(60000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(run).toHaveBeenCalledTimes(1);
  });
});
