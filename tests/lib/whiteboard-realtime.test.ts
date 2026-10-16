import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWhiteboardBroadcastQueue, whiteboardSceneKey } from '@/lib/whiteboardRealtime';

afterEach(() => vi.useRealTimers());

describe('whiteboard content identity', () => {
  it('detects edits, concurrent versions, ordering, deletion and image availability', () => {
    const a = { id: 'a', version: 1, versionNonce: 10 };
    const b = { id: 'b', version: 1, versionNonce: 20 };
    const original = whiteboardSceneKey([a, b], {});
    for (const changed of [
      [{ ...a, version: 2 }, b],
      [{ ...a, versionNonce: 30 }, b],
      [b, a],
      [{ ...a, isDeleted: true }, b],
    ]) expect(whiteboardSceneKey(changed, {})).not.toBe(original);
    const image = [{ id: 'image', version: 1, fileId: 'photo' }];
    const files = { photo: { dataURL: 'data:image/png;base64,original', mimeType: 'image/png' } };
    expect(whiteboardSceneKey(image, files)).not.toBe(whiteboardSceneKey(image, {}));
    expect(whiteboardSceneKey(image, files)).toBe(whiteboardSceneKey(image, {
      photo: { ...files.photo, lastRetrieved: Date.now() },
      unused: { dataURL: 'data:image/png;base64,unused' },
    }));
  });

  it('detects changes in imported elements without versions', () => {
    expect(whiteboardSceneKey([{ id: 'text', text: 'before' }], {}))
      .not.toBe(whiteboardSceneKey([{ id: 'text', text: 'after' }], {}));
  });
});

describe('whiteboard broadcast queue', () => {
  it('keeps the first update immediate and the final update within 250ms while coalescing bursts', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(true);
    const queue = createWhiteboardBroadcastQueue({ ready: () => true, send, onError: vi.fn(), minGapMs: 250 });
    queue.enqueue(1, '1');
    expect(send).toHaveBeenCalledWith(1);
    await vi.advanceTimersByTimeAsync(10);
    for (let n = 2; n <= 100; n++) queue.enqueue(n, String(n));
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(240);
    expect(send.mock.calls.map(([value]) => value)).toEqual([1, 100]);
    queue.enqueue(100, '100');
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(send).toHaveBeenCalledTimes(2);
    queue.dispose();
  });

  it('serializes slow encodes and sends the newest scene when the encoder catches up', async () => {
    vi.useFakeTimers();
    let finish!: (sent: boolean) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue(true);
    const queue = createWhiteboardBroadcastQueue({ ready: () => true, send, onError: vi.fn(), minGapMs: 250 });
    queue.enqueue(1, '1');
    queue.enqueue(2, '2');
    queue.enqueue(3, '3');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(1);
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.map(([value]) => value)).toEqual([1, 3]);
    queue.dispose();
  });

  it('retains only the latest offline edit and recovers without an HTTP retry storm', async () => {
    vi.useFakeTimers();
    let ready = false;
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const queue = createWhiteboardBroadcastQueue({ ready: () => ready, send, onError: vi.fn(), minGapMs: 250 });
    queue.enqueue(1, '1');
    queue.enqueue(2, '2');
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(send).not.toHaveBeenCalled();
    ready = true;
    queue.resume();
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue(3, '3');
    await vi.advanceTimersByTimeAsync(2_999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send.mock.calls.map(([value]) => value)).toEqual([2, 3]);
    queue.dispose();
  });

  it('cancels queued work when its whiteboard closes', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(true);
    const queue = createWhiteboardBroadcastQueue({ ready: () => true, send, onError: vi.fn(), minGapMs: 250 });
    queue.enqueue(1, '1');
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue(2, '2');
    queue.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
