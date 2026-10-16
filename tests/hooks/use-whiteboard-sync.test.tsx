import { Blob as NodeBlob } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { setTimeout as waitForEncoder } from 'node:timers/promises';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  download: vi.fn(), upload: vi.fn(), reconcile: vi.fn(), channels: [] as any[], connected: true,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ download: mocks.download, upload: mocks.upload }) },
    realtime: { isConnected: () => mocks.connected },
    channel: () => {
      const channel: any = {
        state: 'closed',
        handlers: {} as Record<string, (value?: any) => void>,
        peers: {},
        on: (type: string, _filter: unknown, handler: (value: any) => void) => {
          channel.handlers[type] = handler;
          return channel;
        },
        subscribe: (handler: (status: string) => void) => { channel.status = handler; return channel; },
        send: vi.fn().mockResolvedValue('ok'),
        track: vi.fn().mockResolvedValue('ok'),
        presenceState: () => channel.peers,
      };
      mocks.channels.push(channel);
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock('@excalidraw/excalidraw', () => ({
  CaptureUpdateAction: { NEVER: 'never' },
  reconcileElements: (local: unknown, remote: unknown) => mocks.reconcile(local, remote),
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
  mocks.channels.length = 0;
  mocks.connected = true;
  mocks.reconcile.mockReset().mockImplementation((_local: unknown, remote: unknown) => remote);
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

async function connectPeer(channel = mocks.channels.at(-1), peerId = 'student') {
  await act(async () => {
    channel.state = 'joined';
    await channel.status('SUBSCRIBED');
    channel.peers = { peer: [{ userId: peerId, name: peerId, joinedAt: 'now', phx_ref: peerId }] };
    channel.handlers.presence();
    await vi.advanceTimersByTimeAsync(250);
  });
  channel.send.mockClear();
  return channel;
}

function scenePayloads(channel: any): any[] {
  const scenes: any[] = [];
  const transfers = new Map<string, Buffer[]>();
  for (const [{ payload }] of channel.send.mock.calls) {
    if (payload._wbCompressed) scenes.push(JSON.parse(gunzipSync(Buffer.from(payload.gz, 'base64')).toString()));
    else if (payload._wbChunked) {
      const chunks = transfers.get(payload.transferId) ?? [];
      chunks[payload.chunkIndex] = Buffer.from(payload.data, 'base64');
      transfers.set(payload.transferId, chunks);
      if (chunks.filter(Boolean).length === payload.chunkCount) {
        scenes.push(JSON.parse(gunzipSync(Buffer.concat(chunks)).toString()));
      }
    } else scenes.push(payload);
  }
  return scenes;
}

async function editBoard(hook: Awaited<ReturnType<typeof openBoard>>, elements: any[], files = {}) {
  await act(async () => {
    hook.board.edit(elements, files);
    hook.result.current.onChange(elements, hook.board.getAppState(), hook.board.getFiles());
  });
}

async function receiveScene(channel: any, elements: any[], files = {}, revision = 1, senderInstanceId = 'student-tab') {
  await act(async () => {
    channel.handlers.broadcast({ payload: {
      senderId: 'student', senderInstanceId, revision, sentAt: Date.now(), elements, files,
    } });
  });
}

describe('whiteboard realtime efficiency and recovery', () => {
  it('sends no messages for cursor, tool, selection, viewport or repeated UI renders, even overnight', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    const elements = [{ id: 'stroke', type: 'freedraw', version: 1, versionNonce: 123 }];
    await editBoard(hook, elements);
    expect(scenePayloads(channel).at(-1).elements).toEqual(elements);
    channel.send.mockClear();
    await act(async () => {
      for (let n = 0; n < 1_000; n++) hook.result.current.onChange([...elements], {
        ...hook.board.getAppState(), scrollX: n, selectedElementIds: { stroke: true },
        cursor: { x: n, y: n }, activeTool: { type: 'selection' },
      }, hook.board.getFiles());
      await vi.advanceTimersByTimeAsync(86_400_000);
    });
    expect(channel.send).not.toHaveBeenCalled();
    expect(mocks.upload.mock.calls.filter(([path]) => path.endsWith('scene.json'))).toHaveLength(1);
    expect(hook.result.current.saved).toBe(true);
  });

  it('autosaves solo preparation without broadcasts and gives a late participant the latest full scene', async () => {
    const hook = await openBoard();
    const channel = mocks.channels.at(-1);
    await act(async () => { channel.state = 'joined'; await channel.status('SUBSCRIBED'); });
    const elements = [{ id: 'prepared', type: 'text', version: 2, text: 'Ready for the lesson' }];
    await editBoard(hook, elements);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(channel.send).not.toHaveBeenCalled();
    expect(JSON.parse(storage.get('lesson/scene.json')!).elements).toEqual(elements);
    await act(async () => {
      channel.peers = { student: [{ userId: 'student', name: 'Student', joinedAt: 'now', phx_ref: 'first' }] };
      channel.handlers.presence();
    });
    expect(scenePayloads(channel).at(-1).elements).toEqual(elements);
    channel.send.mockClear();
    await act(async () => {
      channel.peers.second = [{ userId: 'second', name: 'Second', joinedAt: 'later', phx_ref: 'second' }];
      channel.handlers.presence();
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(scenePayloads(channel)).toHaveLength(1);
    expect(scenePayloads(channel)[0].elements).toEqual(elements);
  });

  it('keeps live strokes flowing at the existing rate and delivers the final point', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    await act(async () => {
      for (let n = 1; n <= 100; n++) {
        const elements = [{ id: 'line', type: 'freedraw', version: n, points: [[0, 0], [n, n]] }];
        hook.board.edit(elements);
        hook.result.current.onChange(elements, { ...hook.board.getAppState(), multiElement: elements[0] }, {});
        await vi.advanceTimersByTimeAsync(10);
      }
      await vi.advanceTimersByTimeAsync(250);
    });
    const scenes = scenePayloads(channel);
    expect(scenes.length).toBeLessThanOrEqual(5);
    expect(scenes.length).toBeGreaterThanOrEqual(4);
    expect(scenes[0].elements[0].version).toBe(1);
    expect(scenes.at(-1).elements[0]).toMatchObject({ version: 100, points: [[0, 0], [100, 100]] });
  });

  it('retains edits without sending on a disconnected socket and catches up after reconnection', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    mocks.connected = false;
    await editBoard(hook, [{ id: 'line', version: 1 }]);
    await editBoard(hook, [{ id: 'line', version: 2 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(channel.send).not.toHaveBeenCalled();
    mocks.connected = true;
    await act(async () => {
      channel.state = 'closed';
      await channel.status('CLOSED');
      await vi.advanceTimersByTimeAsync(3_000);
    });
    const reconnected = mocks.channels.at(-1);
    expect(reconnected).not.toBe(channel);
    await connectPeer(reconnected);
    // connectPeer clears the handshake send; trigger a fresh peer join to inspect the checkpoint.
    await act(async () => {
      reconnected.peers.peer[0].phx_ref = 'new-connection';
      reconnected.handlers.presence();
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(scenePayloads(reconnected).at(-1).elements).toEqual([{ id: 'line', version: 2 }]);
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('does not echo remote scenes on delayed UI renders and accepts a reloaded participant', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    const remote = [{ id: 'student-notes', version: 5 }];
    await receiveScene(channel, remote, {}, 100);
    await act(async () => {
      hook.result.current.onChange(hook.board.getSceneElements(), hook.board.getAppState(), hook.board.getFiles());
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(channel.send).not.toHaveBeenCalled();
    const afterReload = [{ id: 'student-notes', version: 6 }];
    await receiveScene(channel, afterReload, {}, 1, 'reloaded-tab');
    expect(hook.board.getSceneElements()).toEqual(afterReload);
    const ownEdit = [{ id: 'student-notes', version: 7 }];
    await editBoard(hook, ownEdit);
    expect(scenePayloads(channel).at(-1).elements).toEqual(ownEdit);
  });

  it('preserves a local stroke awaiting its render callback when a remote edit arrives', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    const local = { id: 'tutor-stroke', version: 2 };
    const remote = { id: 'student-stroke', version: 1 };
    // React may defer a continuous pointer event's render. Reconciliation keeps
    // the local stroke, but onChange has not observed/broadcast it yet.
    hook.board.edit([local]);
    mocks.reconcile.mockImplementationOnce((own: any[], incoming: any[]) => [...own, ...incoming]);
    await receiveScene(channel, [remote]);
    expect(hook.board.getSceneElements()).toEqual([local, remote]);
    expect(scenePayloads(channel).at(-1)?.elements).toEqual([local, remote]);
    await act(async () => {
      hook.result.current.onChange(hook.board.getSceneElements(), hook.board.getAppState(), hook.board.getFiles());
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(scenePayloads(channel)).toHaveLength(1);
  });

  it('shows original images immediately, then sends lightweight references with subsequent strokes', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    let finishUpload!: () => void;
    const gate = new Promise<void>((resolve) => { finishUpload = resolve; });
    mocks.upload.mockImplementation(async (path: string, blob: NodeBlob) => {
      if (path.includes('/files/')) await gate;
      storage.set(path, await blob.text());
      return { data: { path }, error: null };
    });
    const dataURL = `data:image/png;base64,${randomBytes(300_000).toString('base64')}`;
    const image = { id: 'photo', type: 'image', fileId: 'original', version: 1 };
    await editBoard(hook, [image], { original: { id: 'original', dataURL, mimeType: 'image/png' } });
    // Compression is asynchronous; wait for the queued encoder and asset upload to start.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      for (let attempt = 0; attempt < 100 && scenePayloads(channel).length === 0; attempt++) {
        await waitForEncoder(5);
      }
    });
    expect(scenePayloads(channel)[0].files.original.dataURL).toBe(dataURL);
    await act(async () => {
      finishUpload();
      await Promise.all(mocks.upload.mock.results.map((call) => call.value));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(JSON.parse(storage.get('lesson/files/original.json')!).dataURL).toBe(dataURL);
    channel.send.mockClear();
    await editBoard(hook, [image, { id: 'annotation', type: 'text', version: 1, text: 'Same photo' }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = scenePayloads(channel)[0];
    expect(payload.files.original.storagePath).toBe('lesson/files/original.json');
    expect(payload.files.original.dataURL).toBeUndefined();
    expect(JSON.stringify(payload).length).toBeLessThan(1_000);
    expect(mocks.upload.mock.calls.filter(([path]) => path.includes('/files/'))).toHaveLength(1);
  });

  it('shares in-flight image downloads without delaying strokes or echoing hydrated images', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    let finishDownload!: (value: any) => void;
    mocks.download.mockImplementationOnce(() => new Promise((resolve) => { finishDownload = resolve; }));
    const files = { photo: { storagePath: 'lesson/files/photo.json', mimeType: 'image/png' } };
    for (let revision = 1; revision <= 10; revision++) {
      await receiveScene(channel, [{ id: 'image', type: 'image', fileId: 'photo', version: revision }], files, revision);
    }
    expect(hook.board.getSceneElements()[0].version).toBe(10);
    expect(mocks.download.mock.calls.filter(([path]) => path === 'lesson/files/photo.json')).toHaveLength(1);
    await act(async () => {
      finishDownload({ data: { text: async () => JSON.stringify({ dataURL: 'data:image/png;base64,photo' }) }, error: null });
    });
    expect(hook.board.getFiles().photo.dataURL).toBe('data:image/png;base64,photo');
    await act(async () => {
      hook.result.current.onChange(hook.board.getSceneElements(), hook.board.getAppState(), hook.board.getFiles());
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('keeps inline images usable during a Storage failure and retries without duplicate uploads', async () => {
    const hook = await openBoard(createBoard(), false);
    const channel = await connectPeer();
    mocks.upload.mockRejectedValueOnce(new Error('Temporary network failure'));
    const image = { id: 'image', type: 'image', fileId: 'photo', version: 1 };
    const dataURL = 'data:image/png;base64,unchanged-original';
    await editBoard(hook, [image], { photo: { id: 'photo', dataURL, mimeType: 'image/png' } });
    expect(scenePayloads(channel)[0].files.photo.dataURL).toBe(dataURL);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    await editBoard(hook, [image, { id: 'notes', version: 1 }]);
    expect(scenePayloads(channel).at(-1).files.photo.dataURL).toBe(dataURL);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await editBoard(hook, [image, { id: 'notes', version: 2 }]);
    await act(async () => {
      await Promise.all(mocks.upload.mock.results.map((call) => Promise.resolve(call.value).catch(() => {})));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(scenePayloads(channel).at(-1).files.photo).toMatchObject({ storagePath: 'lesson/files/photo.json' });
    expect(scenePayloads(channel).at(-1).files.photo.dataURL).toBeUndefined();
  });

  it('persists background/grid settings without broadcasting viewport-only changes', async () => {
    const hook = await openBoard();
    const channel = await connectPeer();
    const settings = { viewBackgroundColor: '#eeeeee', gridSize: 20, gridModeEnabled: false };
    hook.board.getAppState = () => settings;
    await act(async () => {
      hook.result.current.onChange([], settings, {});
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(channel.send).not.toHaveBeenCalled();
    expect(JSON.parse(storage.get('lesson/scene.json')!).appState).toEqual(settings);
  });

  it('pauses broadcasts after the last peer leaves and restores image references on their return', async () => {
    const image = { id: 'image', type: 'image', fileId: 'photo', version: 1 };
    const dataURL = 'data:image/png;base64,original';
    storage.set('lesson/scene.json', JSON.stringify({
      elements: [image], files: { photo: { storagePath: 'lesson/files/photo.json', mimeType: 'image/png' } },
    }));
    storage.set('lesson/files/photo.json', JSON.stringify({ dataURL }));
    const hook = await openBoard();
    const channel = await connectPeer();
    await act(async () => { channel.peers = {}; channel.handlers.presence(); });
    const latest = [image, { id: 'notes', type: 'text', version: 1 }];
    await editBoard(hook, latest);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(channel.send).not.toHaveBeenCalled();
    await act(async () => {
      channel.peers = { peer: [{ userId: 'student', name: 'Student', joinedAt: 'returned', phx_ref: 'returned' }] };
      channel.handlers.presence();
    });
    expect(scenePayloads(channel).at(-1)).toMatchObject({
      elements: latest,
      files: { photo: { storagePath: 'lesson/files/photo.json' } },
    });
    expect(hook.board.getFiles().photo.dataURL).toBe(dataURL);
  });
});
