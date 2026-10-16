import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { reconcileElements, CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createWhiteboardBroadcastQueue, whiteboardSceneKey, whiteboardSettingsKey } from '@/lib/whiteboardRealtime';
type ExcalidrawImperativeAPI = any;

const SAVE_DEBOUNCE_MS = 5_000;
const SAVE_MAX_DELAY_MS = 10_000;
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
/** Keep immediate inline previews up to 800 KB until the original is stored. */
const MAX_BROADCAST_DATAURL_BYTES = 800_000;
/**
 * Max rate for full-scene Realtime broadcasts. Flooding ~200KB JSON at >10Hz stalls the peer's JS thread
 * (reconcileElements) even when RX latency looks fine — feels like 10–20s “catch-up”.
 */
const OUTBOUND_BROADCAST_MIN_GAP_MS = 250;

function wbDiagEnabled(): boolean {
  try {
    return (
      import.meta.env.DEV ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('tutlio_wb_diag') === '1')
    );
  } catch {
    return false;
  }
}

function wbDiag(...args: unknown[]) {
  if (!wbDiagEnabled()) return;
  console.info('[WB-DIAG]', ...args);
}

function estimateScenePayloadBytes(payload: SceneUpdatePayload): number {
  try {
    return new Blob([JSON.stringify(payload)]).size;
  } catch {
    return -1;
  }
}

/** Drop stray Excalidraw file keys so broadcast JSON stays small (Free tier 256KB limit). */
function compactFilesForBroadcast(files: Record<string, WhiteboardFile>): Record<string, WhiteboardFile> {
  const out: Record<string, WhiteboardFile> = {};
  for (const [fileId, file] of Object.entries(files)) {
    if (!file) continue;
    const minimal: WhiteboardFile = {};
    if (typeof file.mimeType === 'string') minimal.mimeType = file.mimeType;
    const sp = String(file.storagePath || '').trim();
    if (sp) minimal.storagePath = sp;
    const du = typeof file.dataURL === 'string' ? file.dataURL : '';
    if (du.startsWith(IMAGE_PREFIX) && du.length <= MAX_BROADCAST_DATAURL_BYTES) {
      minimal.dataURL = du;
    }
    out[fileId] = minimal;
  }
  return out;
}

function wbDebug(...args: unknown[]) {
  const enabled =
    import.meta.env.DEV ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('tutlio_wb_debug') === '1');
  if (!enabled) return;
  console.debug('[Whiteboard]', ...args);
}

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

/**
 * Merge remote file metadata without Storage I/O (inline dataURLs, session path cache, local Excalidraw cache).
 * Used so vector strokes render immediately; heavy Storage hydrates run after updateScene.
 */
function mergeRemoteFilesFast(
  payloadFiles: Record<string, WhiteboardFile> | undefined,
  localFiles: Record<string, WhiteboardFile>,
  pathCache: Map<string, string>,
): Record<string, WhiteboardFile> {
  const merged: Record<string, WhiteboardFile> = {};
  for (const [fileId, file] of Object.entries(payloadFiles || {})) {
    if (!file) continue;
    const inline = typeof file.dataURL === 'string' && file.dataURL.startsWith(IMAGE_PREFIX);
    if (inline) {
      merged[fileId] = file;
      continue;
    }
    const storagePath = String(file.storagePath || '').trim();
    if (storagePath && pathCache.has(storagePath)) {
      merged[fileId] = { ...file, dataURL: pathCache.get(storagePath) };
      continue;
    }
    const local = localFiles[fileId];
    const localUrl = typeof local?.dataURL === 'string' ? local.dataURL : '';
    if (localUrl.startsWith(IMAGE_PREFIX)) {
      merged[fileId] = { ...file, ...local };
      continue;
    }
    merged[fileId] = { ...file };
  }
  return merged;
}

type SceneUpdatePayload = {
  senderId: string;
  senderInstanceId?: string;
  revision: number;
  sentAt: number;
  elements: readonly any[];
  files?: Record<string, WhiteboardFile>;
};

type SceneBroadcast = { elements: readonly any[]; files: Record<string, WhiteboardFile> };

type CompressedSceneBroadcast = {
  _wbCompressed: true;
  /** base64(gzip(JSON.stringify(SceneUpdatePayload))) */
  gz: string;
};

type ChunkedSceneBroadcastPart = {
  _wbChunked: true;
  transferId: string;
  chunkIndex: number;
  chunkCount: number;
  /** base64 slice of gzip binary */
  data: string;
};

/** Above this (uncompressed JSON size), gzip-wrap payload before Realtime send. */
const BROADCAST_COMPRESS_THRESHOLD_BYTES = 180_000;
/** Hard ceiling for one WebSocket JSON frame (Supabase Free Realtime ~256KB). */
const MAX_BROADCAST_WIRE_BYTES = 230_000;
/** Raw gzip bytes per chunk when single compressed blob still exceeds MAX_BROADCAST_WIRE_BYTES after base64. */
const CHUNK_GZIP_RAW_BYTES = 88_000;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function splitUint8Chunks(u8: Uint8Array, chunkSize: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < u8.length; i += chunkSize) {
    out.push(u8.subarray(i, Math.min(i + chunkSize, u8.length)));
  }
  return out;
}

async function gzipStringToUint8(raw: string): Promise<Uint8Array> {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzipUint8ToString(u8: Uint8Array): Promise<string> {
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function concatOrderedChunks(parts: Map<number, Uint8Array>, count: number): Uint8Array {
  let len = 0;
  for (let i = 0; i < count; i++) {
    const p = parts.get(i);
    if (!p) throw new Error(`Missing gzip chunk ${i}`);
    len += p.length;
  }
  const out = new Uint8Array(len);
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const p = parts.get(i)!;
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** One SceneUpdatePayload → one or more WebSocket-ready JSON payloads (chunked gzip if needed). */
async function prepareOutboundBroadcastParts(payload: SceneUpdatePayload): Promise<unknown[]> {
  const raw = JSON.stringify(payload);
  if (raw.length <= BROADCAST_COMPRESS_THRESHOLD_BYTES) {
    return [payload];
  }
  if (typeof CompressionStream === 'undefined') {
    console.warn(
      '[Whiteboard] Scene broadcast is large (',
      raw.length,
      ' bytes) but CompressionStream is unavailable — peer may not receive it.',
    );
    return [payload];
  }
  try {
    const gzBytes = await gzipStringToUint8(raw);
    const single: CompressedSceneBroadcast = { _wbCompressed: true, gz: uint8ToBase64(gzBytes) };
    const singleWire = new Blob([JSON.stringify(single)]).size;
    if (singleWire <= MAX_BROADCAST_WIRE_BYTES) {
      return [single];
    }
    const slices = splitUint8Chunks(gzBytes, CHUNK_GZIP_RAW_BYTES);
    const transferId = crypto.randomUUID();
    const parts: ChunkedSceneBroadcastPart[] = slices.map((slice, i) => ({
      _wbChunked: true,
      transferId,
      chunkIndex: i,
      chunkCount: slices.length,
      data: uint8ToBase64(slice),
    }));
    return parts;
  } catch (e) {
    console.warn('[Whiteboard] gzip compress failed', e);
    return [payload];
  }
}

async function maybeUncompressBroadcastPayload(raw: unknown): Promise<SceneUpdatePayload> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid whiteboard broadcast');
  }
  const o = raw as Record<string, unknown>;
  if (o._wbCompressed === true && typeof o.gz === 'string') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Compressed whiteboard broadcast requires DecompressionStream');
    }
    const bytes = base64ToUint8(o.gz);
    return JSON.parse(await gunzipUint8ToString(bytes)) as SceneUpdatePayload;
  }
  return raw as SceneUpdatePayload;
}

const CHUNK_ASSEMBLY_TTL_MS = 30_000;

type ChunkAssemblyState = {
  chunkCount: number;
  parts: Map<number, Uint8Array>;
  timeoutId?: ReturnType<typeof setTimeout>;
};

function bumpChunkAssemblyTimeout(assemblyMap: Map<string, ChunkAssemblyState>, transferId: string) {
  const asm = assemblyMap.get(transferId);
  if (!asm) return;
  if (asm.timeoutId) clearTimeout(asm.timeoutId);
  asm.timeoutId = setTimeout(() => {
    const cur = assemblyMap.get(transferId);
    if (cur?.timeoutId) clearTimeout(cur.timeoutId);
    assemblyMap.delete(transferId);
  }, CHUNK_ASSEMBLY_TTL_MS);
}

/**
 * Returns `null` when a gzip chunk arrived but the full set is not yet present.
 * Otherwise returns the decoded scene payload (plain, single compressed, or reassembled chunks).
 */
async function tryDecodeSceneBroadcastPayload(
  raw: unknown,
  assemblyMap: Map<string, ChunkAssemblyState>,
): Promise<SceneUpdatePayload | null> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid whiteboard broadcast');
  }
  const o = raw as Record<string, unknown>;
  if (o._wbChunked === true) {
    const transferId = String(o.transferId);
    const chunkIndex = Number(o.chunkIndex);
    const chunkCount = Number(o.chunkCount);
    const dataStr = typeof o.data === 'string' ? o.data : '';
    if (!transferId || !Number.isFinite(chunkIndex) || !Number.isFinite(chunkCount) || chunkCount < 1) {
      throw new Error('Invalid chunked whiteboard broadcast');
    }
    let asm = assemblyMap.get(transferId);
    if (!asm) {
      asm = { chunkCount, parts: new Map() };
      assemblyMap.set(transferId, asm);
    } else if (asm.chunkCount !== chunkCount) {
      if (asm.timeoutId) clearTimeout(asm.timeoutId);
      asm = { chunkCount, parts: new Map() };
      assemblyMap.set(transferId, asm);
    }
    asm.parts.set(chunkIndex, base64ToUint8(dataStr));
    bumpChunkAssemblyTimeout(assemblyMap, transferId);
    if (asm.parts.size < chunkCount) {
      return null;
    }
    if (asm.timeoutId) clearTimeout(asm.timeoutId);
    assemblyMap.delete(transferId);
    const merged = concatOrderedChunks(asm.parts, chunkCount);
    return JSON.parse(await gunzipUint8ToString(merged)) as SceneUpdatePayload;
  }
  return maybeUncompressBroadcastPayload(raw);
}

interface Participant {
  userId: string;
  name: string;
  joinedAt: string;
}

export function useWhiteboardSync(
  sessionId: string | null,
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  currentUser: { id: string; name: string } | null,
  persistSceneToStorage = true,
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelReadyRef = useRef(false);
  const hasRemotePeersRef = useRef(false);
  const channelGenerationRef = useRef(0);
  const senderInstanceIdRef = useRef(crypto.randomUUID());
  const broadcastQueueRef = useRef<ReturnType<typeof createWhiteboardBroadcastQueue<SceneBroadcast>> | null>(null);
  const requestSceneBroadcastRef = useRef<() => void>(() => {});
  const lastObservedSceneKeyRef = useRef<string | null>(null);
  const lastObservedSettingsKeyRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMaxDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastSavedPayloadRef = useRef<string>('');
  const saveCooldownUntilRef = useRef(0);
  const loadedRef = useRef(false);
  const localRevisionRef = useRef(0);
  const lastRevisionBySenderRef = useRef<Map<string, number>>(new Map());
  const pendingRemotePayloadsRef = useRef<SceneUpdatePayload[]>([]);
  const uploadedAssetPathByFileIdRef = useRef<Map<string, string>>(new Map());
  const hydratedDataUrlByPathRef = useRef<Map<string, string>>(new Map());
  const uploadInFlightRef = useRef<Map<string, Promise<WhiteboardFile>>>(new Map());
  const downloadInFlightRef = useRef<Map<string, Promise<string | undefined>>>(new Map());
  const uploadErrorCooldownRef = useRef<Map<string, number>>(new Map());
  const uploadConsecutiveFailuresRef = useRef(0);
  const uploadGlobalPauseUntilRef = useRef(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const changeVersionRef = useRef(0);
  const currentUserKey = useMemo(
    () => (currentUser ? `${currentUser.id}:${currentUser.name}` : ''),
    [currentUser?.id, currentUser?.name],
  );
  const persistSceneToStorageRef = useRef(persistSceneToStorage);
  const debouncedSaveRef = useRef<() => void>(() => {});
  const chunkAssemblyRef = useRef<Map<string, ChunkAssemblyState>>(new Map());

  useEffect(() => {
    persistSceneToStorageRef.current = persistSceneToStorage;
  }, [persistSceneToStorage]);

  useEffect(() => {
    excalidrawApiRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

  const rememberCurrentScene = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    lastObservedSceneKeyRef.current = whiteboardSceneKey(
      api.getSceneElementsIncludingDeleted(), toPlainFiles(api.getFiles?.()),
    );
    lastObservedSettingsKeyRef.current = whiteboardSettingsKey(api.getAppState?.());
  }, []);

  const canBroadcast = useCallback(() => Boolean(
    channelReadyRef.current && hasRemotePeersRef.current &&
    channelRef.current?.state === 'joined' && supabase.realtime.isConnected(),
  ), []);

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
          let download = downloadInFlightRef.current.get(storagePath);
          if (!download) {
            download = downloadFileAsset(storagePath).finally(() => {
              downloadInFlightRef.current.delete(storagePath);
            });
            downloadInFlightRef.current.set(storagePath, download);
          }
          const dataURL = await download;
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
      if (!fileId || fileId === 'undefined') return file;
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

      const existingUpload = uploadInFlightRef.current.get(fileId);
      if (existingUpload) return existingUpload;

      if (Date.now() < uploadGlobalPauseUntilRef.current) return file;

      const cooldownUntil = uploadErrorCooldownRef.current.get(fileId) || 0;
      if (Date.now() < cooldownUntil) return file;

      const targetPath = `${sessionId}/${FILES_PREFIX}/${fileId}.json`;

      const jsonPayload = JSON.stringify({ dataURL, mimeType: file.mimeType });
      const jsonBlob = new Blob([jsonPayload], { type: 'application/json' });

      const upload = (async (): Promise<WhiteboardFile> => {
        try {
          const { error } = await supabase.storage.from(WHITEBOARD_BUCKET).upload(targetPath, jsonBlob, {
            upsert: true,
            contentType: 'application/json',
          });
          if (error) throw error;
          uploadConsecutiveFailuresRef.current = 0;
          uploadedAssetPathByFileIdRef.current.set(fileId, targetPath);
          hydratedDataUrlByPathRef.current.set(targetPath, dataURL);
          return { ...file, storagePath: targetPath, dataURL: undefined };
        } catch (error) {
          uploadConsecutiveFailuresRef.current++;
          uploadErrorCooldownRef.current.set(fileId, Date.now() + UPLOAD_ERROR_COOLDOWN_MS);
          if (uploadConsecutiveFailuresRef.current >= MAX_CONSECUTIVE_UPLOAD_FAILURES) {
            uploadGlobalPauseUntilRef.current = Date.now() + UPLOAD_GLOBAL_PAUSE_MS;
            console.warn('[Whiteboard] Too many upload failures, pausing for', UPLOAD_GLOBAL_PAUSE_MS / 1000, 's');
          }
          wbDebug('image upload deferred:', error);
          return file;
        } finally {
          uploadInFlightRef.current.delete(fileId);
        }
      })();
      uploadInFlightRef.current.set(fileId, upload);
      return upload;
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

  const saveScene = useCallback(async (force = false): Promise<boolean> => {
    if (!sessionId || !excalidrawAPI || !currentUser || !loadedRef.current) return false;
    if (!persistSceneToStorageRef.current) {
      wbDebug('skip scene persist (non-writer)');
      return false;
    }
    // A manual save must wait for an autosave, then capture the latest scene.
    // Lock before preparing images as well, so uploads cannot race each other.
    while (saveInFlightRef.current) await saveInFlightRef.current;
    if (!force && saveCooldownUntilRef.current > Date.now()) return false;
    if (force) {
      saveCooldownUntilRef.current = 0;
      uploadGlobalPauseUntilRef.current = 0;
      uploadErrorCooldownRef.current.clear();
    }
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    const savePromise = Promise.resolve().then(async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const changeVersion = changeVersionRef.current;
        const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
        const appState = excalidrawAPI.getAppState();
        const files = await prepareFilesForTransport(toPlainFiles(excalidrawAPI.getFiles()));
        const scene = {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
            gridModeEnabled: appState.gridModeEnabled,
          },
          files,
        };
        // Compare content only; updatedAt changes on every save attempt.
        const sceneContent = JSON.stringify(scene);
        if (sceneContent !== lastSavedPayloadRef.current) {
          const serialized = JSON.stringify({
            ...scene,
            revision: localRevisionRef.current,
            updatedBy: currentUser.id,
            updatedAt: new Date().toISOString(),
          });
          const blob = new Blob([serialized], { type: 'application/json' });
          if (blob.size > MAX_SCENE_BYTES) throw new Error('Whiteboard scene is too large to save');
          const uploadPromise = supabase.storage.from(WHITEBOARD_BUCKET).upload(`${sessionId}/${SCENE_FILE}`, blob, {
            upsert: true,
            contentType: 'application/json',
            // The scene is mutable: reopening must fetch its latest contents.
            cacheControl: '0',
          });
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Whiteboard save timeout')), SAVE_TIMEOUT_MS);
          });
          const result = await Promise.race([uploadPromise, timeoutPromise]);
          if (result.error) throw result.error;
          lastSavedPayloadRef.current = sceneContent;
        }
        uploadConsecutiveFailuresRef.current = 0;
        setSaved(changeVersion === changeVersionRef.current);
        if (saveMaxDelayTimerRef.current && changeVersion === changeVersionRef.current) {
          clearTimeout(saveMaxDelayTimerRef.current);
          saveMaxDelayTimerRef.current = null;
        }
        return true;
      } catch (err) {
        console.warn('[Whiteboard] scene save failed:', err);
        setSaveError(true);
        uploadConsecutiveFailuresRef.current++;
        const cooldown = uploadConsecutiveFailuresRef.current >= MAX_CONSECUTIVE_UPLOAD_FAILURES
          ? UPLOAD_GLOBAL_PAUSE_MS : SAVE_ERROR_COOLDOWN_MS;
        saveCooldownUntilRef.current = Date.now() + cooldown;
        return false;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    });
    saveInFlightRef.current = savePromise;
    try {
      return await savePromise;
    } finally {
      saveInFlightRef.current = null;
      setSaving(false);
    }
  }, [sessionId, excalidrawAPI, currentUser?.id, prepareFilesForTransport]);

  const debouncedSave = useCallback(() => {
    if (!persistSceneToStorageRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveScene();
    }, SAVE_DEBOUNCE_MS);
    // Max-delay guarantee: even during continuous drawing (where the debounce
    // timer keeps resetting), force a save at most SAVE_MAX_DELAY_MS after the
    // first dirty change, so continuous drawing still gets saved.
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

  useEffect(() => {
    debouncedSaveRef.current = debouncedSave;
  }, [debouncedSave]);

  const applyRemotePayload = useCallback(
    async (payload: SceneUpdatePayload) => {
      const api = excalidrawApiRef.current;
      const generation = channelGenerationRef.current;
      if (!api || !payload?.elements) return;
      const senderId = String(payload.senderId || '');
      const revision = Number(payload.revision || 0);
      if (!senderId || revision <= 0) return;

      const senderKey = `${senderId}:${payload.senderInstanceId || 'legacy'}`;
      const lastSeen = lastRevisionBySenderRef.current.get(senderKey) || 0;
      if (revision <= lastSeen) return;
      lastRevisionBySenderRef.current.set(senderKey, revision);

      // Fast path: never await Storage before showing remote strokes (hydrate was blocking 10–20s under load).
      const localFiles = toPlainFiles(api.getFiles?.());
      const localElements = api.getSceneElementsIncludingDeleted();
      // A continuous pointer event can have changed the scene before React's
      // onChange callback runs. Do not classify that local stroke as remote.
      const hasUnobservedLocalEdit = lastObservedSceneKeyRef.current !== null &&
        whiteboardSceneKey(localElements, localFiles) !== lastObservedSceneKeyRef.current;
      let mergedFiles: Record<string, WhiteboardFile> = mergeRemoteFilesFast(
        payload.files,
        localFiles,
        hydratedDataUrlByPathRef.current,
      );
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
          filesToApply[fid] = { ...f, id: f.id ?? fid };
        }
      }
      const filesArray = Object.values(filesToApply);

      isRemoteUpdateRef.current = true;
      try {
        // addFiles must be inside the guard so onChange is suppressed while files load
        if (filesArray.length > 0 && typeof api.addFiles === 'function') {
          api.addFiles(filesArray);
        }
        const reconciled = reconcileElements(localElements, payload.elements as any, api.getAppState());
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
        // Excalidraw also calls onChange on subsequent UI renders. Remember the
        // reconciled content so those callbacks cannot echo a remote scene.
        rememberCurrentScene();
        isRemoteUpdateRef.current = false;
      }
      if (hasUnobservedLocalEdit) requestSceneBroadcastRef.current();

      if (persistSceneToStorageRef.current) {
        changeVersionRef.current++;
        setSaved(false);
        debouncedSaveRef.current();
      }

      void (async () => {
        const hydratedFiles = await hydrateFilesFromStorage(payload.files || {});
        const api2 = excalidrawApiRef.current;
        if (!api2 || api2 !== api || generation !== channelGenerationRef.current) return;
        const localFiles2 = toPlainFiles(api2.getFiles?.());
        const mergedAfterHydrate: Record<string, WhiteboardFile> = { ...hydratedFiles };
        for (const [fileId, localFile] of Object.entries(localFiles2)) {
          const localDataURL = typeof (localFile as any)?.dataURL === 'string' ? (localFile as any).dataURL : '';
          const remoteDataURL = typeof mergedAfterHydrate[fileId]?.dataURL === 'string'
            ? mergedAfterHydrate[fileId].dataURL
            : '';
          if (localDataURL.startsWith(IMAGE_PREFIX) && !remoteDataURL.startsWith(IMAGE_PREFIX)) {
            mergedAfterHydrate[fileId] = { ...(mergedAfterHydrate[fileId] || {}), ...localFile };
          }
        }
        const filesToApply2: Record<string, WhiteboardFile> = {};
        for (const [fid, f] of Object.entries(mergedAfterHydrate)) {
          if (typeof f?.dataURL === 'string' && f.dataURL.startsWith(IMAGE_PREFIX)) {
            // Preserve the fileId as `id` so the newFiles filter below works correctly.
            filesToApply2[fid] = { ...f, id: f.id ?? fid };
          }
        }

        // Register any storagePath received from a peer so that future outbound
        // broadcasts use the Storage path rather than re-embedding the full dataURL
        // (and so we don't wastefully re-upload files the tutor already uploaded).
        for (const [fid, f] of Object.entries(hydratedFiles)) {
          const sp = String(f?.storagePath || '').trim();
          if (sp && !uploadedAssetPathByFileIdRef.current.has(fid)) {
            uploadedAssetPathByFileIdRef.current.set(fid, sp);
          }
        }

        const arr2 = Object.values(filesToApply2);
        if (arr2.length === 0 || typeof api2.addFiles !== 'function') return;

        // Only call addFiles/updateScene if there is at least one file that isn't
        // already present in the local scene with a resolved data URL.  Re-applying
        // files that are already there causes a spurious onChange → TX loop.
        const currentLocalFiles2 = toPlainFiles(api2.getFiles?.());
        const newFiles = arr2.filter((f) => {
          const existing = currentLocalFiles2[f.id as string];
          const existingDataURL = typeof (existing as any)?.dataURL === 'string' ? (existing as any).dataURL : '';
          return !existingDataURL.startsWith(IMAGE_PREFIX);
        });
        if (newFiles.length === 0) return;

        const hasUnobservedEditBeforeHydrate = lastObservedSceneKeyRef.current !== null &&
          whiteboardSceneKey(api2.getSceneElementsIncludingDeleted(), currentLocalFiles2) !==
            lastObservedSceneKeyRef.current;
        isRemoteUpdateRef.current = true;
        try {
          api2.addFiles(newFiles);
          const els =
            api2.getSceneElementsIncludingDeleted?.() || api2.getSceneElements?.() || [];
          api2.updateScene({
            elements: els,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          wbDiag('hydrate-files-applied', { count: newFiles.length });
        } finally {
          rememberCurrentScene();
          isRemoteUpdateRef.current = false;
        }
        if (hasUnobservedEditBeforeHydrate) requestSceneBroadcastRef.current();
      })();
    },
    [hydrateFilesFromStorage, rememberCurrentScene],
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
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const downloadPromise = supabase.storage
        .from(WHITEBOARD_BUCKET)
        .download(`${sessionId}/${SCENE_FILE}`, {}, { cache: 'no-store', signal: controller.signal });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Whiteboard load timeout'));
        }, SAVE_TIMEOUT_MS);
      });
      const { data, error } = await Promise.race([downloadPromise, timeoutPromise]) as Awaited<typeof downloadPromise>;
      if (error) {
        // Only a missing object means a new board. A failed read must never
        // open an empty board that can overwrite the previously saved scene.
        if (String((error as any).statusCode) === '404' || (error as any).code === 'NoSuchKey') return null;
        throw error;
      }
      if (!data) throw new Error('Whiteboard scene download returned no data');
      const text = await data.text();
      const scene = JSON.parse(text) as { elements: readonly any[]; appState?: any; files?: Record<string, WhiteboardFile> };
      if (!Array.isArray(scene.elements)) throw new Error('Invalid whiteboard scene');
      return scene;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }, [sessionId]);

  const broadcastAssetUploadsRef = useRef<Set<string>>(new Set());

  const emitSceneBroadcast = useCallback(
    async ({ elements, files }: SceneBroadcast): Promise<boolean> => {
      const channel = channelRef.current;
      const generation = channelGenerationRef.current;
      const stillReady = () => channel === channelRef.current &&
        generation === channelGenerationRef.current && canBroadcast();
      if (!channel || !currentUser || !stillReady()) return false;

      const imageIds = new Set(elements.filter((element) => !element.isDeleted && element.fileId)
        .map((element) => element.fileId as string));
      const needsUpload: [string, WhiteboardFile][] = [];
      const preparedFiles: Record<string, WhiteboardFile> = {};
      for (const fileId of imageIds) {
        const file = files[fileId];
        if (!file) continue;
        const knownPath = uploadedAssetPathByFileIdRef.current.get(fileId) || file.storagePath;
        if (knownPath) {
          // Reuse uploaded originals for small images too. Repeated dataURLs
          // were turning one drawing update into many billable chunks.
          preparedFiles[fileId] = { ...file, storagePath: knownPath, dataURL: undefined };
        } else {
          // Preserve immediate previews while storing the full-quality original.
          preparedFiles[fileId] = file;
          if (file.dataURL?.startsWith(IMAGE_PREFIX) && !broadcastAssetUploadsRef.current.has(fileId)) {
            needsUpload.push([fileId, file]);
          }
        }
      }

      // Legacy peers order revisions by user rather than browser instance. A
      // timestamp also lets them accept edits after this participant reloads.
      localRevisionRef.current = Math.max(localRevisionRef.current + 1, Date.now());
      const wirePayload: SceneUpdatePayload = {
        senderId: currentUser.id,
        senderInstanceId: senderInstanceIdRef.current,
        revision: localRevisionRef.current,
        sentAt: Date.now(),
        elements,
        files: compactFilesForBroadcast(preparedFiles),
      };
      const parts = await prepareOutboundBroadcastParts(wirePayload);
      if (wbDiagEnabled()) {
        wbDiag('TX', {
          revision: wirePayload.revision,
          elementCount: elements.length,
          fileKeys: Object.keys(preparedFiles).length,
          parts: parts.length,
          uncompressedBytes: estimateScenePayloadBytes(wirePayload),
        });
      }
      for (const part of parts) {
        // The SDK otherwise silently falls back to HTTP on a disconnected socket.
        if (!stillReady()) return false;
        const status = await channel.send({ type: 'broadcast', event: 'scene-update', payload: part });
        if (status !== 'ok') return false;
      }

      if (needsUpload.length > 0) {
        for (const [fileId] of needsUpload) broadcastAssetUploadsRef.current.add(fileId);
        void Promise.all(needsUpload.map(([fileId, file]) => uploadFileAssetIfNeeded(fileId, file)))
          .then((uploaded) => {
            if (generation !== channelGenerationRef.current) return;
            if (uploaded.some((file) => file.storagePath)) requestSceneBroadcastRef.current();
          })
          .catch((error) => console.warn('[Whiteboard] image upload failed:', error))
          .finally(() => {
            for (const [fileId] of needsUpload) broadcastAssetUploadsRef.current.delete(fileId);
          });
      }
      return true;
    },
    [canBroadcast, currentUser?.id, uploadFileAssetIfNeeded],
  );

  const broadcastUpdate = useCallback(
    (elements: readonly any[], files: Record<string, WhiteboardFile> = {}, force = false) => {
      broadcastQueueRef.current?.enqueue({ elements, files }, whiteboardSceneKey(elements, files), force);
    }, [],
  );

  useEffect(() => {
    const queue = createWhiteboardBroadcastQueue<SceneBroadcast>({
      ready: canBroadcast,
      send: emitSceneBroadcast,
      minGapMs: OUTBOUND_BROADCAST_MIN_GAP_MS,
      onError: (error) => console.warn('[Whiteboard] scene broadcast failed:', error),
    });
    broadcastQueueRef.current = queue;
    requestSceneBroadcastRef.current = () => {
      const api = excalidrawApiRef.current;
      if (!api || !loadedRef.current) return;
      broadcastUpdate(api.getSceneElementsIncludingDeleted(), toPlainFiles(api.getFiles?.()), true);
      queue.resume();
    };
    return () => {
      queue.dispose();
      broadcastQueueRef.current = null;
      requestSceneBroadcastRef.current = () => {};
    };
  }, [sessionId, broadcastUpdate, canBroadcast, emitSceneBroadcast]);

  useEffect(() => {
    if (!sessionId || !currentUser) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let remotePeers = new Set<string>();

    const setupChannel = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      channelReadyRef.current = false;
      hasRemotePeersRef.current = false;
      remotePeers = new Set();
      broadcastQueueRef.current?.pause();
      const generation = ++channelGenerationRef.current;
      const channel = supabase.channel(`wb:${sessionId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;
      const isCurrent = () => !disposed && channelRef.current === channel &&
        generation === channelGenerationRef.current;

      channel
        .on('broadcast', { event: 'scene-update' }, ({ payload }) => {
          if (!isCurrent()) return;
          void (async () => {
            let typedPayload: SceneUpdatePayload | null = null;
            try {
              typedPayload = await tryDecodeSceneBroadcastPayload(payload, chunkAssemblyRef.current);
            } catch (err) {
              console.warn('[Whiteboard] Could not decode scene-update broadcast:', err);
              return;
            }
            if (!typedPayload) {
              const po = payload as Record<string, unknown> | null;
              if (po && po._wbChunked === true && wbDiagEnabled()) {
                wbDiag('RX-chunk', {
                  transferId: po.transferId,
                  chunkIndex: po.chunkIndex,
                  chunkCount: po.chunkCount,
                  bytesOnWire: new Blob([JSON.stringify(payload)]).size,
                });
              }
              return;
            }
            if (!isCurrent() || !typedPayload?.elements) return;
            if (wbDiagEnabled()) {
              const po = payload as Record<string, unknown> | null;
              wbDiag('RX', {
                revision: typedPayload.revision,
                senderId: typedPayload.senderId,
                elementCount: typedPayload.elements?.length,
                bytesOnWire: new Blob([JSON.stringify(payload)]).size,
                bytesDecoded: estimateScenePayloadBytes(typedPayload),
                compressed: po?._wbCompressed === true,
                chunkedAssembly: po?._wbChunked === true,
                latencyMs: Date.now() - (typedPayload.sentAt || 0),
              });
            }
            if (typedPayload.senderId && currentUser && typedPayload.senderId === currentUser.id) return;
            if (!loadedRef.current) {
              pendingRemotePayloadsRef.current.push(typedPayload);
              return;
            }
            void applyRemotePayload(typedPayload);
          })();
        })
        .on('presence', { event: 'sync' }, () => {
          if (!isCurrent()) return;
          const state = channel.presenceState<{ userId: string; name: string; joinedAt: string; phx_ref?: string }>();
          const list: Participant[] = [];
          const nextPeers = new Set<string>();
          for (const key of Object.keys(state)) {
            for (const p of state[key]) {
              if (!list.some((x) => x.userId === p.userId)) {
                list.push({ userId: p.userId, name: p.name, joinedAt: p.joinedAt });
              }
              if (p.userId !== currentUser.id) nextPeers.add(p.phx_ref || `${p.userId}:${p.joinedAt}`);
            }
          }
          const peerJoined = [...nextPeers].some((key) => !remotePeers.has(key));
          remotePeers = nextPeers;
          hasRemotePeersRef.current = nextPeers.size > 0;
          setParticipants(list);
          if (peerJoined) requestSceneBroadcastRef.current();
          if (hasRemotePeersRef.current) broadcastQueueRef.current?.resume();
          else broadcastQueueRef.current?.pause();
        })
        .subscribe(async (status) => {
          if (!isCurrent()) return;
          wbDiag('channel', status);
          if (status === 'SUBSCRIBED') {
            channelReadyRef.current = true;
            await channel.track({
              userId: currentUser.id,
              name: currentUser.name,
              joinedAt: new Date().toISOString(),
            });
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            channelReadyRef.current = false;
            hasRemotePeersRef.current = false;
            broadcastQueueRef.current?.pause();
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              if (!isCurrent()) return;
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
      channelReadyRef.current = false;
      supabase.removeChannel(channelRef.current);
      channelRef.current = setupChannel();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      channelGenerationRef.current++;
      channelReadyRef.current = false;
      hasRemotePeersRef.current = false;
      broadcastQueueRef.current?.pause();
      window.removeEventListener('online', handleOnline);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      for (const v of chunkAssemblyRef.current.values()) {
        if (v.timeoutId) clearTimeout(v.timeoutId);
      }
      chunkAssemblyRef.current.clear();
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
    };
  }, [sessionId, currentUserKey, applyRemotePayload]);

  useEffect(() => {
    if (!sessionId || !excalidrawAPI || loaded) return;

    let cancelled = false;
    (async () => {
      try {
        const scene = await loadScene();
        if (cancelled) return;
        if (scene) {
          const hydratedFiles = await hydrateFilesFromStorage(scene.files || {});
          if (cancelled) return;
          const validFiles: Record<string, WhiteboardFile> = {};
          for (const [fid, f] of Object.entries(hydratedFiles)) {
            if (f.storagePath) uploadedAssetPathByFileIdRef.current.set(fid, f.storagePath);
            if (typeof f?.dataURL === 'string' && f.dataURL.startsWith(IMAGE_PREFIX)) {
              validFiles[fid] = { ...f, id: f.id ?? fid };
            }
          }
          for (const el of scene.elements) {
            if (el.type === 'image' && !el.isDeleted && el.fileId && !validFiles[el.fileId]) {
              throw new Error('Whiteboard image failed to load');
            }
          }
          const validFilesArray = Object.values(validFiles);
          if (validFilesArray.length > 0 && typeof excalidrawAPI.addFiles === 'function') {
            excalidrawAPI.addFiles(validFilesArray);
          }
          excalidrawAPI.updateScene({
            elements: scene.elements,
            appState: scene.appState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
        rememberCurrentScene();
        loadedRef.current = true;
        setLoadError(false);
        setLoaded(true);
        await flushQueuedPayloads();
        requestSceneBroadcastRef.current();
      } catch (err) {
        if (cancelled) return;
        console.warn('[Whiteboard] scene load failed:', err);
        setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, excalidrawAPI, loaded, loadScene, flushQueuedPayloads, hydrateFilesFromStorage, loadAttempt, rememberCurrentScene]);

  const retryLoadScene = useCallback(() => {
    setLoadError(false);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

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
      const sceneKey = whiteboardSceneKey(elements, files);
      const settingsKey = whiteboardSettingsKey(appState);
      const sceneChanged = sceneKey !== lastObservedSceneKeyRef.current;
      if (!sceneChanged && settingsKey === lastObservedSettingsKeyRef.current) return;
      lastObservedSceneKeyRef.current = sceneKey;
      lastObservedSettingsKeyRef.current = settingsKey;
      changeVersionRef.current++;
      setSaved(false);
      if (sceneChanged) broadcastUpdate(elements, files);
      debouncedSave();
    },
    [broadcastUpdate, debouncedSave, loaded],
  );

  return { participants, saving, saved, saveError, loadError, loaded, onChange, saveScene, retryLoadScene };
}
