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
/** Images whose dataURL exceeds this are excluded from inline broadcasts (sent via Storage instead).
 * Raised to 800 KB so most phone photos are delivered inline on the first broadcast,
 * giving peers an immediate preview without waiting for the Storage upload/download cycle.
 * Chunking handles the larger wire payload.
 */
const MAX_BROADCAST_DATAURL_BYTES = 800_000;
/** While drawing lines/freehand, still broadcast throttled so peers see strokes live (not only after mouseup). */
const LINEAR_BROADCAST_MIN_INTERVAL_MS = 50;
/**
 * Max rate for full-scene Realtime broadcasts. Flooding ~200KB JSON at >10Hz stalls the peer's JS thread
 * (reconcileElements) even when RX latency looks fine — feels like 10–20s “catch-up”.
 */
const OUTBOUND_BROADCAST_MIN_GAP_MS = 250;
/** Supabase Free plan Realtime broadcast limit is ~256KB; near/over this, messages may drop or lag. */
const BROADCAST_WARN_BYTES = 240_000;

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
  revision: number;
  sentAt: number;
  elements: readonly any[];
  files?: Record<string, WhiteboardFile>;
};

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
  const persistSceneToStorageRef = useRef(persistSceneToStorage);
  const debouncedSaveRef = useRef<() => void>(() => {});
  const lastLinearBroadcastAtRef = useRef(0);
  const lastOutboundSentAtRef = useRef(0);
  const pendingOutboundRef = useRef<{ elements: readonly any[]; files: Record<string, WhiteboardFile> } | null>(null);
  const outboundBroadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkAssemblyRef = useRef<Map<string, ChunkAssemblyState>>(new Map());

  useEffect(() => {
    persistSceneToStorageRef.current = persistSceneToStorage;
  }, [persistSceneToStorage]);

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

  const saveScene = useCallback(async () => {
    if (!sessionId || !excalidrawAPI || !currentUser) return;
    if (!persistSceneToStorageRef.current) {
      wbDebug('skip scene persist (non-writer)');
      return;
    }
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

    if (serialized === lastSavedPayloadRef.current) {
      wbDebug('skip scene save (duplicate payload)', { bytes: serialized.length });
      return;
    }
    if (serialized.length > MAX_SCENE_BYTES) {
      wbDebug('skip scene save (payload too large)', { bytes: serialized.length });
      saveCooldownUntilRef.current = Date.now() + SAVE_ERROR_COOLDOWN_MS;
      return;
    }

    wbDebug('scene save start', { bytes: serialized.length });
    const t0 = performance.now();
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
      wbDebug('scene saved', { ms: Math.round(performance.now() - t0), bytes: serialized.length });
      if (saveMaxDelayTimerRef.current) {
        clearTimeout(saveMaxDelayTimerRef.current);
        saveMaxDelayTimerRef.current = null;
      }
    } catch (err) {
      wbDebug('scene save failed', err);
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
    if (!persistSceneToStorageRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveScene();
    }, SAVE_DEBOUNCE_MS);
    // Max-delay guarantee: even during continuous drawing (where the debounce
    // timer keeps resetting), force a save at most SAVE_MAX_DELAY_MS after the
    // first dirty change. This caps DB write pressure to ~1 save / 30s per
    // scene writer regardless of how much the user is drawing.
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
      if (!api || !payload?.elements) return;
      const senderId = String(payload.senderId || '');
      const revision = Number(payload.revision || 0);
      if (!senderId || revision <= 0) return;

      const lastSeen = lastRevisionBySenderRef.current.get(senderId) || 0;
      if (revision <= lastSeen) return;
      lastRevisionBySenderRef.current.set(senderId, revision);

      // Fast path: never await Storage before showing remote strokes (hydrate was blocking 10–20s under load).
      const localFiles = toPlainFiles(api.getFiles?.());
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
          filesToApply[fid] = f;
        }
      }
      const filesArray = Object.values(filesToApply);

      isRemoteUpdateRef.current = true;
      try {
        // addFiles must be inside the guard so onChange is suppressed while files load
        if (filesArray.length > 0 && typeof api.addFiles === 'function') {
          api.addFiles(filesArray);
        }
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

      if (persistSceneToStorageRef.current) {
        debouncedSaveRef.current();
      }

      void (async () => {
        const hydratedFiles = await hydrateFilesFromStorage(payload.files || {});
        const api2 = excalidrawApiRef.current;
        if (!api2) return;
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
          requestAnimationFrame(() => {
            isRemoteUpdateRef.current = false;
          });
        }
      })();
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

  const emitSceneBroadcast = useCallback(
    async (elements: readonly any[], files: Record<string, WhiteboardFile> | undefined) => {
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
          // Include inline so the peer sees the image immediately on first broadcast.
          // Once the Storage upload completes, subsequent broadcasts switch to storagePath.
          preparedFiles[fileId] = { ...file };
          continue;
        }

        const safeFile: WhiteboardFile = { ...file };
        if (hasLargeData && knownPath) {
          safeFile.dataURL = undefined;
          safeFile.storagePath = knownPath;
        }
        preparedFiles[fileId] = safeFile;
      }

      localRevisionRef.current += 1;
      const sentAt = Date.now();
      const wirePayload: SceneUpdatePayload = {
        senderId: currentUser.id,
        revision: localRevisionRef.current,
        sentAt,
        elements,
        files: compactFilesForBroadcast(preparedFiles),
      };
      const uncompressedBytes = estimateScenePayloadBytes(wirePayload);
      const parts = await prepareOutboundBroadcastParts(wirePayload);
      let maxWire = 0;
      for (const p of parts) {
        maxWire = Math.max(maxWire, new Blob([JSON.stringify(p)]).size);
      }
      const first = parts[0] as Record<string, unknown> | undefined;
      const isChunked =
        parts.length > 1 ||
        (first !== undefined &&
          typeof first === 'object' &&
          first !== null &&
          first._wbChunked === true);
      const isCompressedSingle =
        parts.length === 1 &&
        first !== undefined &&
        typeof first === 'object' &&
        first !== null &&
        first._wbCompressed === true;
      wbDiag('TX', {
        revision: wirePayload.revision,
        elementCount: elements.length,
        fileKeys: Object.keys(wirePayload.files || {}).length,
        bytesOnWire: maxWire,
        parts: parts.length,
        uncompressedBytes,
        compressed: isCompressedSingle || isChunked,
        chunked: isChunked,
        nearOrOverFreeBroadcastLimit: maxWire >= BROADCAST_WARN_BYTES,
      });
      if (!isCompressedSingle && !isChunked && uncompressedBytes >= BROADCAST_WARN_BYTES) {
        console.warn(
          '[Whiteboard] Broadcast ~',
          uncompressedBytes,
          'bytes uncompressed (Free tier Realtime ~256KB per message). Oversized messages may not reach the other user — simplify the board or upgrade Realtime limits.',
        );
      }
      if ((isCompressedSingle || isChunked) && maxWire >= BROADCAST_WARN_BYTES) {
        console.warn(
          '[Whiteboard] Largest broadcast frame still ~',
          maxWire,
          'bytes — reduce scene complexity, split chunk size, or raise Realtime limits.',
        );
      }

      for (const part of parts) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'scene-update',
          payload: part,
        });
      }

      if (needsUpload.length === 0) return;

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
        const sentAt2 = Date.now();
        const wirePayload2: SceneUpdatePayload = {
          senderId: currentUser.id,
          revision: localRevisionRef.current,
          sentAt: sentAt2,
          elements: freshElements,
          files: compactFilesForBroadcast(uploadedFiles),
        };
        const uncompressed2 = estimateScenePayloadBytes(wirePayload2);
        const parts2 = await prepareOutboundBroadcastParts(wirePayload2);
        let maxWire2 = 0;
        for (const p of parts2) {
          maxWire2 = Math.max(maxWire2, new Blob([JSON.stringify(p)]).size);
        }
        const first2 = parts2[0] as Record<string, unknown> | undefined;
        const isChunked2 =
          parts2.length > 1 ||
          (first2 !== undefined &&
            typeof first2 === 'object' &&
            first2 !== null &&
            first2._wbChunked === true);
        const compressed2 =
          parts2.length === 1 &&
          first2 !== undefined &&
          typeof first2 === 'object' &&
          first2 !== null &&
          first2._wbCompressed === true;
        wbDiag('TX-after-upload', {
          revision: wirePayload2.revision,
          elementCount: freshElements.length,
          bytesOnWire: maxWire2,
          parts: parts2.length,
          uncompressedBytes: uncompressed2,
          compressed: compressed2 || isChunked2,
          chunked: isChunked2,
          nearOrOverFreeBroadcastLimit: maxWire2 >= BROADCAST_WARN_BYTES,
        });
        if (!compressed2 && !isChunked2 && uncompressed2 >= BROADCAST_WARN_BYTES) {
          console.warn('[Whiteboard] Broadcast (post-upload) ~', uncompressed2, 'bytes uncompressed.');
        }
        for (const part of parts2) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'scene-update',
            payload: part,
          });
        }
      })();
    },
    [currentUser?.id, uploadFileAssetIfNeeded],
  );

  const broadcastUpdate = useCallback(
    (elements: readonly any[], files?: Record<string, WhiteboardFile>) => {
      const normalizedFiles = files ?? {};
      pendingOutboundRef.current = { elements, files: normalizedFiles };
      const now = Date.now();
      if (now - lastOutboundSentAtRef.current >= OUTBOUND_BROADCAST_MIN_GAP_MS) {
        if (outboundBroadcastTimerRef.current) {
          clearTimeout(outboundBroadcastTimerRef.current);
          outboundBroadcastTimerRef.current = null;
        }
        lastOutboundSentAtRef.current = now;
        const pending = pendingOutboundRef.current;
        pendingOutboundRef.current = null;
        if (pending) {
          void emitSceneBroadcast(pending.elements, pending.files).catch((err) =>
            console.warn('[Whiteboard] emitSceneBroadcast failed:', err),
          );
        }
        return;
      }
      const delay = Math.max(0, OUTBOUND_BROADCAST_MIN_GAP_MS - (now - lastOutboundSentAtRef.current));
      if (outboundBroadcastTimerRef.current) clearTimeout(outboundBroadcastTimerRef.current);
      outboundBroadcastTimerRef.current = setTimeout(() => {
        outboundBroadcastTimerRef.current = null;
        lastOutboundSentAtRef.current = Date.now();
        const pending = pendingOutboundRef.current;
        pendingOutboundRef.current = null;
        if (pending) {
          void emitSceneBroadcast(pending.elements, pending.files).catch((err) =>
            console.warn('[Whiteboard] emitSceneBroadcast failed:', err),
          );
        }
      }, delay);
    },
    [emitSceneBroadcast],
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
        // Trailing sync shortly after gesture sampling stops (throttled live sends happen in onChange).
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
            if (!typedPayload?.elements) return;
            const bytesDecoded = estimateScenePayloadBytes(typedPayload);
            const bytesOnWire = new Blob([JSON.stringify(payload)]).size;
            const latencyMs = Date.now() - (typedPayload.sentAt || 0);
            const po = payload as Record<string, unknown> | null;
            wbDiag('RX', {
              revision: typedPayload.revision,
              senderId: typedPayload.senderId,
              elementCount: typedPayload.elements?.length,
              bytesOnWire,
              bytesDecoded,
              compressed: po?._wbCompressed === true,
              chunkedAssembly: po?._wbChunked === true,
              latencyMs,
            });
            if (typedPayload.senderId && currentUser && typedPayload.senderId === currentUser.id) return;
            if (!loadedRef.current) {
              pendingRemotePayloadsRef.current.push(typedPayload);
              return;
            }
            void applyRemotePayload(typedPayload);
          })();
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
          wbDiag('channel', status);
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
      if (broadcastTimerRef.current) {
        clearTimeout(broadcastTimerRef.current);
        broadcastTimerRef.current = null;
      }
      if (outboundBroadcastTimerRef.current) {
        clearTimeout(outboundBroadcastTimerRef.current);
        outboundBroadcastTimerRef.current = null;
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
        const now = performance.now();
        if (now - lastLinearBroadcastAtRef.current >= LINEAR_BROADCAST_MIN_INTERVAL_MS) {
          lastLinearBroadcastAtRef.current = now;
          void broadcastUpdate(elements, files);
        }
        return;
      }
      lastLinearBroadcastAtRef.current = 0;
      void broadcastUpdate(elements, files);
      debouncedSave();
    },
    [broadcastUpdate, debouncedSave, loaded, scheduleStableBroadcast],
  );

  return { participants, saving, loaded, onChange, saveScene };
}
