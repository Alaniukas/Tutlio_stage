import { Blob as NodeBlob } from 'node:buffer';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ download: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ download: mocks.download, upload: mocks.upload }) },
    channel: () => {
      const channel: any = { on: () => channel, subscribe: () => channel, send: vi.fn(), track: vi.fn() };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { NEVER: 'never' },
  reconcileElements: (_local: unknown, remote: unknown) => remote,
}));

import { useWhiteboardSync } from '@/hooks/useWhiteboardSync';

const user = { id: 'proklase-tutor', name: 'QA Tutor' };
const storage = new Map<string, string>();
function createBoard() {
  let elements: any[] = [];
  const files: Record<string, any> = {};
  return {
    getSceneElementsIncludingDeleted: () => elements,
    getSceneElements: () => elements,
    getAppState: () => ({ viewBackgroundColor: '#fff', gridSize: 10, gridModeEnabled: true }),
    getFiles: () => files,
    updateScene: vi.fn((scene: any) => { elements = scene.elements; }),
    addFiles: vi.fn((added: any[]) => { added.forEach((file) => { files[file.id] = file; }); }),
    edit: (next: any[], nextFiles = {}) => { elements = next; Object.assign(files, nextFiles); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Blob', NodeBlob);
  storage.clear();
  mocks.download.mockReset().mockImplementation(async (path: string) => storage.has(path)
    ? { data: { text: async () => storage.get(path) }, error: null }
    : { data: null, error: { statusCode: '404', message: 'Object not found' } });
  mocks.upload.mockReset().mockImplementation(async (path: string, blob: NodeBlob) => {
    storage.set(path, await blob.text());
    return { data: { path }, error: null };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function openBoard(board = createBoard(), persist = true) {
  const hook = renderHook(() => useWhiteboardSync('lesson', board, user, persist));
  await act(async () => {});
  return { ...hook, board };
}

describe('whiteboard persistence', () => {
  it('restores saved lesson material and image assets after closing and reopening', async () => {
    const first = await openBoard();
    expect(first.result.current.loaded).toBe(true);
    const elements = [
      { id: 'notes', type: 'text', text: 'Prepared lesson material', version: 1 },
      { id: 'picture', type: 'image', fileId: 'image', version: 1 },
    ];
    first.board.edit(elements, { image: { id: 'image', dataURL: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png' } });
    await act(async () => { expect(await first.result.current.saveScene(true)).toBe(true); });
    expect(first.result.current.saved).toBe(true);
    expect(mocks.upload).toHaveBeenCalledWith('lesson/scene.json', expect.any(NodeBlob), expect.objectContaining({ cacheControl: '0' }));
    first.unmount();

    const reopened = await openBoard();
    expect(reopened.board.getSceneElements()).toEqual(elements);
    expect(reopened.board.getFiles().image.dataURL).toBe('data:image/png;base64,aGVsbG8=');
    expect(mocks.download).toHaveBeenCalledWith('lesson/scene.json', {}, expect.objectContaining({ cache: 'no-store' }));
  });

  it('reports Storage failures and allows an immediate explicit retry during the autosave cooldown', async () => {
    const hook = await openBoard();
    hook.board.edit([{ id: 'notes', type: 'text', text: 'Keep these notes' }]);
    mocks.upload.mockResolvedValueOnce({ data: null, error: { statusCode: '544', message: 'Database timeout' } });
    await act(async () => { expect(await hook.result.current.saveScene(true)).toBe(false); });
    expect(hook.result.current.saveError).toBe(true);
    expect(hook.result.current.saved).toBe(false);
    await act(async () => { expect(await hook.result.current.saveScene(true)).toBe(true); });
    expect(hook.result.current.saveError).toBe(false);
    expect(JSON.parse(storage.get('lesson/scene.json')!).elements).toEqual(hook.board.getSceneElements());
  });

  it('locks saves during image preparation and saves the latest edits after an in-flight autosave', async () => {
    const hook = await openBoard();
    hook.board.edit([{ id: 'old', type: 'image', fileId: 'image' }], {
      image: { id: 'image', dataURL: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png' },
    });
    let finishAsset!: () => void;
    const assetGate = new Promise<void>((resolve) => { finishAsset = resolve; });
    mocks.upload.mockImplementation(async (path: string, blob: NodeBlob) => {
      if (path.includes('/files/')) await assetGate;
      storage.set(path, await blob.text());
      return { data: { path }, error: null };
    });
    let autoSave!: Promise<boolean>;
    await act(async () => { autoSave = hook.result.current.saveScene(); });
    expect(hook.result.current.saving).toBe(true);
    const latest = [{ id: 'latest', type: 'image', fileId: 'image' }];
    hook.board.edit(latest);
    let explicitSave!: Promise<boolean>;
    await act(async () => { explicitSave = hook.result.current.saveScene(true); });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    await act(async () => { finishAsset(); await Promise.all([autoSave, explicitSave]); });
    expect(JSON.parse(storage.get('lesson/scene.json')!).elements).toEqual(latest);
    expect(mocks.upload.mock.calls.filter(([path]) => path.includes('/files/'))).toHaveLength(1);
  });

  it('blocks editing and persistence after a failed read until the saved scene can be reloaded', async () => {
    const existing = [{ id: 'saved-notes', type: 'text', text: 'Already saved' }];
    storage.set('lesson/scene.json', JSON.stringify({ elements: existing }));
    mocks.download.mockResolvedValueOnce({ data: null, error: { statusCode: '544', message: 'Database timeout' } });
    const hook = await openBoard();
    expect(hook.result.current.loadError).toBe(true);
    expect(hook.result.current.loaded).toBe(false);
    await act(async () => { expect(await hook.result.current.saveScene(true)).toBe(false); });
    expect(mocks.upload).not.toHaveBeenCalled();
    await act(async () => { hook.result.current.retryLoadScene(); });
    expect(hook.result.current.loaded).toBe(true);
    expect(hook.board.getSceneElements()).toEqual(existing);
  });

  it('waits for a slow scene download instead of exposing an empty board after eight seconds', async () => {
    let finishDownload!: (value: any) => void;
    mocks.download.mockImplementationOnce(() => new Promise((resolve) => { finishDownload = resolve; }));
    const hook = await openBoard();
    await act(async () => { await vi.advanceTimersByTimeAsync(8500); });
    expect(hook.result.current.loaded).toBe(false);
    await act(async () => {
      finishDownload({ data: { text: async () => JSON.stringify({ elements: [{ id: 'saved' }] }) }, error: null });
    });
    expect(hook.result.current.loaded).toBe(true);
    expect(hook.board.getSceneElements()).toEqual([{ id: 'saved' }]);
  });

  it('keeps a timed-out or corrupt scene closed and reports the load error', async () => {
    mocks.download.mockImplementationOnce(() => new Promise(() => {}));
    const hook = await openBoard();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(hook.result.current.loadError).toBe(true);
    expect(hook.result.current.loaded).toBe(false);
    storage.set('lesson/scene.json', 'invalid JSON');
    await act(async () => { hook.result.current.retryLoadScene(); });
    expect(hook.result.current.loadError).toBe(true);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('reports an oversized scene instead of silently ignoring Save', async () => {
    const hook = await openBoard();
    hook.board.edit([{ id: 'large', type: 'text', text: 'x'.repeat(2_000_001) }]);
    await act(async () => { expect(await hook.result.current.saveScene(true)).toBe(false); });
    expect(hook.result.current.saveError).toBe(true);
    expect(hook.result.current.saved).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('does not persist a scene for a participant other than its tutor', async () => {
    const hook = await openBoard(createBoard(), false);
    hook.board.edit([{ id: 'student-change' }]);
    await act(async () => { expect(await hook.result.current.saveScene(true)).toBe(false); });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('does not re-upload identical content just because the save timestamp changed', async () => {
    const hook = await openBoard();
    hook.board.edit([{ id: 'notes' }]);
    await act(async () => { await hook.result.current.saveScene(true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); await hook.result.current.saveScene(true); });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
});
