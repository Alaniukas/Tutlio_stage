import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { reconcileElements, CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { RealtimeChannel } from '@supabase/supabase-js';
type ExcalidrawImperativeAPI = any;

const SAVE_DEBOUNCE_MS = 15_000;
const SAVE_MAX_DELAY_MS = 30_000;
const SAVE_TIMEOUT_MS = 20_000;
const SAVE_ERROR_COOLDOWN_MS = 15_000;
const UPLOAD_ERROR_COOLDOWN_MS = 30_000;
const UPLOAD_GLOBAL_PAUSE_MS = 60_000;
const MAX_CONSECUTIVE_UPLOAD_FAILURES = 3;
const MAX_SCENE_BYTES = 2_000_000;
const SCENE_FILE = 'scene.json';
const IMAGE_PREFIX = 'data:image/';
const WHITEBOARD_BUCKET = 'whiteboard-data';
const FILES_PREFIX = 'files';
const MAX_BROADCAST_DATAURL_BYTES = 200_000;

type WhiteboardFile = Record<string, any> & {
  id?: string;
  mimeType?: string;
  dataURL?: string;
  storagePath?: string;
};

/** Excalidraw may return files as a Map or plain object — normalise to Record. */
function toPlainFiles(files: unknown): Record<string, WhiteboardFile> {
  if (!files) return {};
  if (files instanceof Map) return Object.fromEntries(files);
  if (typeof files === 'object' && !Array.isArray(files)) return files as Record<string, WhiteboardFile>;
  return {};
}

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
  const saveMaxDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const uploadInFlightSetRef = useRef<Set<string>>(new Set());
  const uploadErrorCooldownRef = useRef<Map<string, number>>(new Map());
  const uploadConsecutiveFailuresRef = useRef(0);
  const uploadGlobalPauseUntilRef = useRef(0);
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

  const downloadFileAsset = useCallback(
    async (storagePath: string): Promise<string | undefined> => {
      const MAX_RETRIES = 3;
      const BASE_DELAY_MS = 1_000;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const { data, error } = await supabase.storage.from(WHITEBOARD_BUCKET).download(storagePath);
          if (error || !data) {
            console.warn(`[Whiteboard] Storage download attempt ${attempt + 1}/${MAX_RETRIES} failed:`, error?.message, '| path:', storagePath);
            if (attempt < MAX_RETRIES - 1) {
              await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
              continue;
            }
            return undefined;
          }
          let dataURL: string | undefined;
          if (storagePath.endsWith('.json')) {
            const text = await data.text();
            const parsed = JSON.parse(text);
            dataURL = typeof parsed.dataURL === 'string' ? parsed.dataURL : undefined;
          } else {
            dataURL = await blobToDataURL(data) || undefined;
          }
          return dataURL;
        } catch (err) {
          console.warn(`[Whiteboard] Storage download attempt ${attempt + 1}/${MAX_RETRIES} threw:`, err, '| path:', storagePath);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
          }
        }
      }
      return undefined;
    },
    [blobToDataURL],
  );

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
          const dataURL = await downloadFileAsset(storagePath);
          if (!dataURL) return;
          hydratedDataUrlByPathRef.current.set(storagePath, dataURL);
          hydrated[fileId] = { ...file, dataURL };
        }),
      );
      return hydrated;
    },
    [downloadFileAsset, sessionId],
  );

  const uploadFileAssetIfNeeded = useCallback(
    async (fileId: string, file: WhiteboardFile): Promise<WhiteboardFile> => {
      if (!sessionId) return file;
      const existingStoragePath = String(file.storagePath || '').trim();
      if (existingStoragePath) {
        uploadedAssetPathByFileIdRef.current.set(fileId, existingStoragePath);
      }

      // Idempotent: if we already uploaded this file in this session, never re-upload.
      // Excalidraw's getFiles() keeps returning the full dataURL, so without this we
      // would re-upload the same image on every save.
      const knownPath = uploadedAssetPathByFileIdRef.current.get(fileId);
      if (knownPath) {
        return { ...file, storagePath: knownPath, dataURL: undefined };
      }

      const dataURL = typeof file.dataURL === 'string' ? file.dataURL : '';
      if (!dataURL.startsWith(IMAGE_PREFIX)) return file;

      if (uploadInFlightSetRef.current.has(fileId)) return file;

      if (Date.now() < uploadGlobalPauseUntilRef.current) return file;

      const cooldownUntil = uploadErrorCooldownRef.current.get(fileId) || 0;
      if (Date.now() < cooldownUntil) return file;

      const targetPath = `${sessionId}/${FILES_PREFIX}/${fileId}.json`;

      const jsonPayload = JSON.stringify({ dataURL, mimeType: file.mimeType });
      const jsonBlob = new Blob([jsonPayload], { type: 'application/json' });

      uploadInFlightSetRef.current.add(fileId);
      try {
        const { error } = await supabase.storage.from(WHITEBOARD_BUCKET).upload(targetPath, jsonBlob, {
          upsert: true,
          contentType: 'application/json',
        });
        if (error) {
          uploadConsecutiveFailuresRef.current++;
          uploadErrorCooldownRef.current.set(fileId, Date.now() + UPLOAD_ERROR_COOLDOWN_MS);
          if (uploadConsecutiveFailuresRef.current >= MAX_CONSECUTIVE_UPLOAD_FAILURES) {
            uploadGlobalPauseUntilRef.current = Date.now() + UPLOAD_GLOBAL_PAUSE_MS;
            console.warn('[Whiteboard] Too many upload failures, pausing for', UPLOAD_GLOBAL_PAUSE_MS / 1000, 's');
          }
          return file;
        }
        uploadConsecutiveFailuresRef.current = 0;
        uploadedAssetPathByFileIdRef.current.set(fileId, targetPath);
        hydratedDataUrlByPathRef.current.set(targetPath, dataURL);
        return {
          ...file,
          storagePath: targetPath,
          dataURL: undefined,
        };
      } finally {
        uploadInFlightSetRef.current.delete(fileId);
      }
    },
    [sessionId],
  );

  const prepareFilesForTransport = useCallback(
    async (files?: Record<string, WhiteboardFile>) => {
      if (!files) return {};
      const entries = Object.entries(files);
      const results = await Promise.all(
        entries.map(async ([fileId, file]) => [fileId, await uploadFileAssetIfNeeded(fileId, file || {})] as const),
      );
      return Object.fromEntries(results);
    },
    [uploadFileAssetIfNeeded],
  );

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

      // Merge with local files: never overwrite a local dataURL with an empty one
      const localFiles = toPlainFiles(api.getFiles?.());
      const mergedFiles: Record<string, WhiteboardFile> = { ...hydratedFiles };
      for (const [fileId, localFile] of Object.entries(localFiles)) {
        const localDataURL = typeof (localFile as any)?.dataURL === 'string' ? (localFile as any).dataURL : '';
        const remoteDataURL = typeof mergedFiles[fileId]?.dataURL === 'string' ? mergedFiles[fileId].dataURL : '';
        if (localDataURL.startsWith(IMAGE_PREFIX) && !remoteDataURL.startsWith(IMAGE_PREFIX)) {
          mergedFiles[fileId] = { ...(mergedFiles[fileId] || {}), ...localFile };
        }
      }

      const filesToApply: Record<string, WhiteboardFile> = {};
      for (const [fid, f] of Object.entries(mergedFiles)) {
        if (typeof f?.dataURL === 'string' && f.dataURL.startsWith(IMAGE_PREFIX)) {
          filesToApply[fid] = f;
        }
      }
      // Register files via addFiles() — updateScene alone doesn't persist them in v0.18
      const filesArray = Object.values(filesToApply);
      if (filesArray.length > 0 && typeof api.addFiles === 'function') {
        api.addFiles(filesArray);
      }

      isRemoteUpdateRef.current = true;
      try {
        const local = api.getSceneElementsIncludingDeleted();
        const reconciled = reconcileElements(local, payload.elements as any, api.getAppState());
        api.updateScene({
          elements: reconciled,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        api.updateScene({
          elements: payload.elements,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } finally {
        requestAnimationFrame(() => {
          isRemoteUpdateRef.current = false;
        });
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
    if (uploadGlobalPauseUntilRef.current > now) return;

    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const appState = excalidrawAPI.getAppState();
    const rawFiles = toPlainFiles(excalidrawAPI.getFiles());
    const files = await prepareFilesForTransport(rawFiles);
    const payload = {
      revision: localRevisionRef.current,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
        gridModeEnabled: appState.gridModeEnabled,
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
      if (result?.error) throw result.error;
      lastSavedPayloadRef.current = serialized;
      uploadConsecutiveFailuresRef.current = 0;
      if (saveMaxDelayTimerRef.current) {
        clearTimeout(saveMaxDelayTimerRef.current);
        saveMaxDelayTimerRef.current = null;
      }
    } catch (err) {
      uploadConsecutiveFailuresRef.current++;
      if (uploadConsecutiveFailuresRef.current >= MAX_CONSECUTIVE_UPLOAD_FAILURES) {
        uploadGlobalPauseUntilRef.current = Date.now() + UPLOAD_GLOBAL_PAUSE_MS;
        saveCooldownUntilRef.current = Date.now() + UPLOAD_GLOBAL_PAUSE_MS;
        console.warn('[Whiteboard] Too many save failures, pausing for', UPLOAD_GLOBAL_PAUSE_MS / 1000, 's');
      } else {
        saveCooldownUntilRef.current = Date.now() + SAVE_ERROR_COOLDOWN_MS;
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [sessionId, excalidrawAPI, currentUser?.id, prepareFilesForTransport]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveScene();
    }, SAVE_DEBOUNCE_MS);
    // Max-delay guarantee: even during continuous drawing (where the debounce
    // timer keeps resetting), force a save at most SAVE_MAX_DELAY_MS after the
    // first dirty change. This caps DB write pressure to ~1 save / 30s per
    // whiteboard regardless of how much the user is drawing.
    if (!saveMaxDelayTimerRef.current) {
      saveMaxDelayTimerRef.current = setTimeout(() => {
        saveMaxDelayTimerRef.current = null;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        void saveScene();
      }, SAVE_MAX_DELAY_MS);
    }
  }, [saveScene]);

  const broadcastUpdate = useCallback(
    (elements: readonly any[], files?: Record<string, WhiteboardFile>) => {
      if (!channelRef.current || isRemoteUpdateRef.current || !currentUser) return;

      const fileEntries = Object.entries(files || {});
      const needsUpload: [string, WhiteboardFile][] = [];
      const preparedFiles: Record<string, WhiteboardFile> = {};

      for (const [fileId, file] of fileEntries) {
        const dataURL = typeof file?.dataURL === 'string' ? file.dataURL : '';
        const hasLargeData = dataURL.startsWith(IMAGE_PREFIX) && dataURL.length > MAX_BROADCAST_DATAURL_BYTES;
        const knownPath = uploadedAssetPathByFileIdRef.current.get(fileId);

        if (hasLargeData && !knownPath) {
          needsUpload.push([fileId, { ...file, dataURL }]);
          continue;
        }

        const safeFile: WhiteboardFile = { ...file };
        if (hasLargeData && knownPath) {
          safeFile.dataURL = undefined;
          safeFile.storagePath = knownPath;
        }
        preparedFiles[fileId] = safeFile;
      }

      // Always broadcast elements immediately so the other user sees changes right away.
      localRevisionRef.current += 1;
      channelRef.current.send({
        type: 'broadcast',
        event: 'scene-update',
        payload: {
          senderId: currentUser.id,
          revision: localRevisionRef.current,
          sentAt: Date.now(),
          elements,
          files: preparedFiles,
        } satisfies SceneUpdatePayload,
      });

      if (needsUpload.length === 0) return;

      // Upload pending files in parallel in the background, then send a follow-up
      // broadcast so the other side can hydrate the images.
      (async () => {
        const uploadedFiles: Record<string, WhiteboardFile> = { ...preparedFiles };
        const results = await Promise.all(
          needsUpload.map(async ([fileId, fileSnapshot]) => {
            const uploaded = await uploadFileAssetIfNeeded(fileId, fileSnapshot);
            return [fileId, uploaded] as const;
          }),
        );
        for (const [fileId, uploaded] of results) {
          uploadedFiles[fileId] = uploaded.storagePath
            ? { ...uploaded, dataURL: undefined }
            : needsUpload.find(([fid]) => fid === fileId)?.[1] || uploaded;
        }
        if (!channelRef.current || isRemoteUpdateRef.current) return;
        const api = excalidrawApiRef.current;
        const freshElements = api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || elements;
        localRevisionRef.current += 1;
        channelRef.current.send({
          type: 'broadcast',
          event: 'scene-update',
          payload: {
            senderId: currentUser.id,
            revision: localRevisionRef.current,
            sentAt: Date.now(),
            elements: freshElements,
            files: uploadedFiles,
          } satisfies SceneUpdatePayload,
        });
      })();
    },
    [currentUser?.id, uploadFileAssetIfNeeded],
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
      const files = toPlainFiles(api.getFiles?.());
      void broadcastUpdate(elements, files);
    }, 120);
  }, [broadcastUpdate]);

  useEffect(() => {
    if (!sessionId || !currentUser) return;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const setupChannel = () => {
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
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
              }
              const newChannel = setupChannel();
              channelRef.current = newChannel;
            }, 3000);
          }
        });

      return channel;
    };

    const channel = setupChannel();
    channelRef.current = channel;

    const handleOnline = () => {
      if (!channelRef.current) return;
      supabase.removeChannel(channelRef.current);
      channelRef.current = setupChannel();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveMaxDelayTimerRef.current) {
        clearTimeout(saveMaxDelayTimerRef.current);
        saveMaxDelayTimerRef.current = null;
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
      const hydratedFiles = await hydrateFilesFromStorage(scene.files || {});
      const validFiles: Record<string, WhiteboardFile> = {};
      for (const [fid, f] of Object.entries(hydratedFiles)) {
        if (typeof f?.dataURL === 'string' && f.dataURL.startsWith(IMAGE_PREFIX)) {
          validFiles[fid] = f;
        }
      }
      // Register files via addFiles() before updating scene
      const validFilesArray = Object.values(validFiles);
      if (validFilesArray.length > 0 && typeof excalidrawAPI.addFiles === 'function') {
        excalidrawAPI.addFiles(validFilesArray);
      }
      excalidrawAPI.updateScene({
        elements: scene.elements,
        appState: scene.appState,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      loadedRef.current = true;
      setLoaded(true);
      await flushQueuedPayloads();
    })();

    return () => {
      cancelled = true;
      clearTimeout(loadFailSafe);
    };
  }, [sessionId, excalidrawAPI, loaded, loadScene, flushQueuedPayloads, hydrateFilesFromStorage]);

  const saveSceneRef = useRef(saveScene);
  useEffect(() => { saveSceneRef.current = saveScene; }, [saveScene]);

  useEffect(() => {
    if (!sessionId || !excalidrawAPI || !currentUser) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        if (saveMaxDelayTimerRef.current) {
          clearTimeout(saveMaxDelayTimerRef.current);
          saveMaxDelayTimerRef.current = null;
        }
        void saveSceneRef.current();
      }
    };
    const handleBeforeUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveMaxDelayTimerRef.current) {
        clearTimeout(saveMaxDelayTimerRef.current);
        saveMaxDelayTimerRef.current = null;
      }
      void saveSceneRef.current();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId, excalidrawAPI, currentUser?.id]);

  const onChange = useCallback(
    (elements: readonly any[], appState?: any, rawFiles?: Record<string, WhiteboardFile> | unknown) => {
      if (!loaded) return;
      if (isRemoteUpdateRef.current) return;
      const files = toPlainFiles(rawFiles);
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
