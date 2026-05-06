import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
type ExcalidrawImperativeAPI = any;

const SAVE_DEBOUNCE_MS = 8_000;
const SAVE_TIMEOUT_MS = 12_000;
const SAVE_ERROR_COOLDOWN_MS = 30_000;
const MAX_SCENE_BYTES = 2_000_000;
const SCENE_FILE = 'scene.json';
const IMAGE_PREFIX = 'data:image/';
const WHITEBOARD_BUCKET = 'whiteboard-data';
const FILES_PREFIX = 'files';
const MAX_BROADCAST_DATAURL_BYTES = 180_000;

type WhiteboardFile = Record<string, any> & {
  id?: string;
  mimeType?: string;
  dataURL?: string;
  storagePath?: string;
};

type SceneUpdatePayload = {
  senderId: string;
  revision: number;
  sentAt: number;
  elements: readonly any[];
  files?: Record<string, WhiteboardFile>;
};

interface Participant {
  userId: string;
  name: string;
  joinedAt: string;
}

export function useWhiteboardSync(
  sessionId: string | null,
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  currentUser: { id: string; name: string } | null,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingBroadcastRef = useRef(false);
  const lastSavedPayloadRef = useRef<string>('');
  const saveCooldownUntilRef = useRef(0);
  const loadedRef = useRef(false);
  const localRevisionRef = useRef(0);
  const lastRevisionBySenderRef = useRef<Map<string, number>>(new Map());
  const pendingRemotePayloadsRef = useRef<SceneUpdatePayload[]>([]);
  const uploadedAssetPathByFileIdRef = useRef<Map<string, string>>(new Map());
  const hydratedDataUrlByPathRef = useRef<Map<string, string>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const currentUserKey = useMemo(
    () => (currentUser ? `${currentUser.id}:${currentUser.name}` : ''),
    [currentUser?.id, currentUser?.name],
  );

  useEffect(() => {
    excalidrawApiRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  const blobToDataURL = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const dataUrlToBlob = useCallback((dataUrl: string): Blob | null => {
    try {
      const parts = dataUrl.split(',');
      if (parts.length < 2) return null;
      const meta = parts[0];
      const b64 = parts.slice(1).join(',');
      const mimeMatch = meta.match(/data:(.*?);base64/);
      const mime = mimeMatch?.[1] || 'application/octet-stream';
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch {
      return null;
    }
  }, []);

  const hydrateFilesFromStorage = useCallback(
    async (files?: Record<string, WhiteboardFile>) => {
      if (!sessionId || !files) return files ?? {};
      const entries = Object.entries(files);
      if (entries.length === 0) return files;
      const hydrated: Record<string, WhiteboardFile> = { ...files };
      await Promise.all(
        entries.map(async ([fileId, file]) => {
          if (!file) return;
          if (typeof file.dataURL === 'string' && file.dataURL.startsWith(IMAGE_PREFIX)) return;
          const storagePath = String(file.storagePath || '').trim();
          if (!storagePath) return;
          const cached = hydratedDataUrlByPathRef.current.get(storagePath);
          if (cached) {
            hydrated[fileId] = { ...file, dataURL: cached };
            return;
          }
          try {
            const { data, error } = await supabase.storage.from(WHITEBOARD_BUCKET).download(storagePath);
            if (error || !data) return;
            const dataURL = await blobToDataURL(data);
            if (!dataURL) return;
            hydratedDataUrlByPathRef.current.set(storagePath, dataURL);
            hydrated[fileId] = { ...file, dataURL };
          } catch {
            // Keep metadata-only entry; Excalidraw will show placeholder until available.
          }
        }),
      );
      return hydrated;
    },
    [blobToDataURL, sessionId],
  );

  const uploadFileAssetIfNeeded = useCallback(
    async (fileId: string, file: WhiteboardFile): Promise<WhiteboardFile> => {
      if (!sessionId) return file;
      const existingStoragePath = String(file.storagePath || '').trim();
      if (existingStoragePath) {
        uploadedAssetPathByFileIdRef.current.set(fileId, existingStoragePath);
      }
      const dataURL = typeof file.dataURL === 'string' ? file.dataURL : '';
      const isImageDataUrl = dataURL.startsWith(IMAGE_PREFIX);
      if (!isImageDataUrl) return file;

      const knownPath = uploadedAssetPathByFileIdRef.current.get(fileId);
      const targetPath = knownPath || `${sessionId}/${FILES_PREFIX}/${fileId}`;
      const blob = dataUrlToBlob(dataURL);
      if (!blob) return file;

      const { error } = await supabase.storage.from(WHITEBOARD_BUCKET).upload(targetPath, blob, {
        upsert: true,
        contentType: file.mimeType || blob.type || 'application/octet-stream',
      });
      if (!error) {
        uploadedAssetPathByFileIdRef.current.set(fileId, targetPath);
        hydratedDataUrlByPathRef.current.set(targetPath, dataURL);
        return {
          ...file,
          storagePath: targetPath,
          dataURL: undefined,
        };
      }
      return file;
    },
    [dataUrlToBlob, sessionId],
  );

  const prepareFilesForTransport = useCallback(
    async (files?: Record<string, WhiteboardFile>) => {
      if (!files) return {};
      const prepared: Record<string, WhiteboardFile> = {};
      const entries = Object.entries(files);
      for (const [fileId, file] of entries) {
        prepared[fileId] = await uploadFileAssetIfNeeded(fileId, file || {});
      }
      return prepared;
    },
    [uploadFileAssetIfNeeded],
  );

  const sanitizeFilesForBroadcast = useCallback((files?: Record<string, WhiteboardFile>) => {
    if (!files) return {};
    const sanitized: Record<string, WhiteboardFile> = {};
    for (const [fileId, file] of Object.entries(files)) {
      const safeFile: WhiteboardFile = { ...(file || {}) };
      const dataURL = typeof safeFile.dataURL === 'string' ? safeFile.dataURL : '';
      if (dataURL.startsWith(IMAGE_PREFIX) && dataURL.length > MAX_BROADCAST_DATAURL_BYTES) {
        // Keep live payload small to avoid auth/session lock pressure and dropped broadcasts.
        safeFile.dataURL = undefined;
      }
      sanitized[fileId] = safeFile;
    }
    return sanitized;
  }, []);

  const applyRemotePayload = useCallback(
    async (payload: SceneUpdatePayload) => {
      const api = excalidrawApiRef.current;
      if (!api || !payload?.elements) return;
      const senderId = String(payload.senderId || '');
      const revision = Number(payload.revision || 0);
      if (!senderId || revision <= 0) return;

      const lastSeen = lastRevisionBySenderRef.current.get(senderId) || 0;
      if (revision <= lastSeen) return;
      lastRevisionBySenderRef.current.set(senderId, revision);

      const hydratedFiles = await hydrateFilesFromStorage(payload.files || {});
      isRemoteUpdateRef.current = true;
      try {
        const { reconcileElements, CaptureUpdateAction } = require('@excalidraw/excalidraw');
        const local = api.getSceneElementsIncludingDeleted();
        const reconciled = reconcileElements(local, payload.elements, api.getAppState());
        api.updateScene({
          elements: reconciled,
          files: hydratedFiles,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        api.updateScene({
          elements: payload.elements,
          files: hydratedFiles,
        });
      } finally {
        // Keep guard through current tick to prevent immediate rebroadcast loops.
        window.setTimeout(() => {
          isRemoteUpdateRef.current = false;
        }, 0);
      }
    },
    [hydrateFilesFromStorage],
  );

  const flushQueuedPayloads = useCallback(async () => {
    if (!loadedRef.current) return;
    if (!pendingRemotePayloadsRef.current.length) return;
    const queued = [...pendingRemotePayloadsRef.current].sort((a, b) => a.sentAt - b.sentAt);
    pendingRemotePayloadsRef.current = [];
    for (const payload of queued) {
      // eslint-disable-next-line no-await-in-loop
      await applyRemotePayload(payload);
    }
  }, [applyRemotePayload]);

  const loadScene = useCallback(async () => {
    if (!sessionId) return null;
    try {
      const downloadPromise = supabase.storage
        .from(WHITEBOARD_BUCKET)
        .download(`${sessionId}/${SCENE_FILE}`);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Whiteboard load timeout')), SAVE_TIMEOUT_MS),
      );
      const { data, error } = await Promise.race([downloadPromise, timeoutPromise]) as Awaited<typeof downloadPromise>;
      if (error || !data) return null;
      const text = await data.text();
      return JSON.parse(text) as { elements: readonly any[]; appState?: any; files?: Record<string, WhiteboardFile> };
    } catch {
      return null;
    }
  }, [sessionId]);

  const saveScene = useCallback(async () => {
    if (!sessionId || !excalidrawAPI || !currentUser) return;
    const now = Date.now();
    if (saveInFlightRef.current) return;
    if (saveCooldownUntilRef.current > now) return;

    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const appState = excalidrawAPI.getAppState();
    const rawFiles = excalidrawAPI.getFiles();
    const files = await prepareFilesForTransport(rawFiles);
    const payload = {
      revision: localRevisionRef.current,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files,
      updatedBy: currentUser.id,
      updatedAt: new Date().toISOString(),
    };

    let serialized = '';
    try {
      serialized = JSON.stringify(payload);
    } catch {
      return;
    }

    if (serialized === lastSavedPayloadRef.current) return;
    if (serialized.length > MAX_SCENE_BYTES) {
      saveCooldownUntilRef.current = Date.now() + SAVE_ERROR_COOLDOWN_MS;
      console.warn('[Whiteboard] scene payload is too large, skipping autosave', {
        bytes: serialized.length,
      });
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const blob = new Blob([serialized], { type: 'application/json' });
      const uploadPromise = supabase.storage
        .from(WHITEBOARD_BUCKET)
        .upload(`${sessionId}/${SCENE_FILE}`, blob, { upsert: true, contentType: 'application/json' });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Whiteboard save timeout')), SAVE_TIMEOUT_MS),
      );
      const result = await Promise.race([uploadPromise, timeoutPromise]) as Awaited<typeof uploadPromise>;
      if (result?.error) {
        throw result.error;
      }
      lastSavedPayloadRef.current = serialized;
    } catch (err) {
      saveCooldownUntilRef.current = Date.now() + SAVE_ERROR_COOLDOWN_MS;
      console.error('[Whiteboard] save error:', err);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [sessionId, excalidrawAPI, currentUser?.id, prepareFilesForTransport]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveScene(); }, SAVE_DEBOUNCE_MS);
  }, [saveScene]);

  const broadcastUpdate = useCallback(
    (elements: readonly any[], files?: Record<string, WhiteboardFile>) => {
      if (!channelRef.current || isRemoteUpdateRef.current || !currentUser) return;
      const preparedFiles = sanitizeFilesForBroadcast(files || {});
      localRevisionRef.current += 1;
      const payload: SceneUpdatePayload = {
        senderId: currentUser.id,
        revision: localRevisionRef.current,
        sentAt: Date.now(),
        elements,
        files: preparedFiles,
      };
      channelRef.current.send({
        type: 'broadcast',
        event: 'scene-update',
        payload,
      });
    },
    [currentUser?.id, sanitizeFilesForBroadcast],
  );

  const scheduleStableBroadcast = useCallback(() => {
    if (!loadedRef.current) return;
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      const api = excalidrawApiRef.current;
      if (!api || !pendingBroadcastRef.current) return;
      const appState = api.getAppState?.() || {};
      const isLinearInProgress = !!appState?.editingLinearElement || !!appState?.multiElement;
      if (isLinearInProgress) {
        // Keep trailing schedule while user is still drawing.
        scheduleStableBroadcast();
        return;
      }
      pendingBroadcastRef.current = false;
      const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
      const files = api.getFiles?.() || {};
      void broadcastUpdate(elements, files);
    }, 120);
  }, [broadcastUpdate]);

  useEffect(() => {
    if (!sessionId || !currentUser) return;

    const channel = supabase.channel(`wb:${sessionId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'scene-update' }, ({ payload }) => {
        const typedPayload = payload as SceneUpdatePayload;
        if (!typedPayload?.elements) return;
        if (typedPayload.senderId && currentUser && typedPayload.senderId === currentUser.id) return;
        if (!loadedRef.current) {
          pendingRemotePayloadsRef.current.push(typedPayload);
          return;
        }
        void applyRemotePayload(typedPayload);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string; name: string; joinedAt: string }>();
        const list: Participant[] = [];
        for (const key of Object.keys(state)) {
          for (const p of state[key]) {
            if (!list.some((x) => x.userId === p.userId)) {
              list.push({ userId: p.userId, name: p.name, joinedAt: p.joinedAt });
            }
          }
        }
        setParticipants(list);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: currentUser.id,
            name: currentUser.name,
            joinedAt: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (broadcastTimerRef.current) {
        clearTimeout(broadcastTimerRef.current);
        broadcastTimerRef.current = null;
      }
    };
  }, [sessionId, currentUserKey, applyRemotePayload]);

  useEffect(() => {
    if (!sessionId || !excalidrawAPI || loaded) return;

    let cancelled = false;
    const loadFailSafe = setTimeout(() => {
      if (!cancelled) setLoaded(true);
    }, 8000);
    (async () => {
      const scene = await loadScene();
      if (cancelled || !scene) {
        setLoaded(true);
        return;
      }
      try {
        const { CaptureUpdateAction } = require('@excalidraw/excalidraw');
        const hydratedFiles = await hydrateFilesFromStorage(scene.files || {});
        excalidrawAPI.updateScene({
          elements: scene.elements,
          appState: scene.appState,
          files: hydratedFiles,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        const hydratedFiles = await hydrateFilesFromStorage(scene.files || {});
        excalidrawAPI.updateScene({
          elements: scene.elements,
          appState: scene.appState,
          files: hydratedFiles,
        });
      }
      setLoaded(true);
      await flushQueuedPayloads();
    })();

    return () => {
      cancelled = true;
      clearTimeout(loadFailSafe);
    };
  }, [sessionId, excalidrawAPI, loaded, loadScene, flushQueuedPayloads, hydrateFilesFromStorage]);

  const onChange = useCallback(
    (elements: readonly any[], appState?: any, files?: Record<string, WhiteboardFile>) => {
      if (!loaded) return;
      if (isRemoteUpdateRef.current) return;
      pendingBroadcastRef.current = true;
      scheduleStableBroadcast();
      const isLinearInProgress =
        !!appState?.editingLinearElement ||
        !!appState?.multiElement;
      if (isLinearInProgress) {
        // Skip immediate broadcast while drawing; trailing broadcast will fire
        // once linear interaction is completed.
        return;
      }
      // Non-linear changes can be broadcast immediately for responsive collaboration.
      void broadcastUpdate(elements, files);
      debouncedSave();
    },
    [broadcastUpdate, debouncedSave, loaded, scheduleStableBroadcast],
  );

  return { participants, saving, loaded, onChange, saveScene };
}
