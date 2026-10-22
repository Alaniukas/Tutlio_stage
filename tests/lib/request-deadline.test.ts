import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRequestDeadline } from '@/lib/requestDeadline';

afterEach(() => vi.useRealTimers());

describe('withRequestDeadline', () => {
  it('aborts a hung read and rejects at the deadline', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const read = withRequestDeadline(async (value) => {
      signal = value;
      return new Promise(() => {});
    });
    const result = expect(read).rejects.toThrow('request_deadline_exceeded');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts sibling requests on an early failure', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    await expect(withRequestDeadline(async (value) => {
      signal = value;
      throw new Error('network unavailable');
    })).rejects.toThrow('network unavailable');
    expect(signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer after a successful read', async () => {
    vi.useFakeTimers();
    await expect(withRequestDeadline(async () => ['student'])).resolves.toEqual(['student']);
    expect(vi.getTimerCount()).toBe(0);
  });
});
