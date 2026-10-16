/** Excalidraw increments element versions for edits, including undo and deletion. */
export function whiteboardSceneKey(
  elements: readonly any[],
  files: Record<string, any>,
): string {
  const imageIds = new Set<string>();
  const versions = elements.map((element) => {
    if (!element.isDeleted && element.fileId) imageIds.add(element.fileId);
    // Keep element order and versionNonce: a version sum misses reordering and
    // concurrent changes. Unversioned imported/test elements need a full key.
    return typeof element.version === 'number'
      ? [element.id, element.version, element.versionNonce, element.isDeleted, element.fileId]
      : element;
  });
  // File IDs identify immutable Excalidraw assets. Availability matters when an
  // image finishes loading; lastRetrieved and the large dataURL do not.
  const images = [...imageIds].sort().map((id) => [
    id,
    files[id]?.mimeType,
    Boolean(files[id]?.dataURL || files[id]?.storagePath),
  ]);
  return JSON.stringify([versions, images]);
}

export function whiteboardSettingsKey(appState: any): string {
  return JSON.stringify([
    appState?.viewBackgroundColor,
    appState?.gridSize,
    appState?.gridModeEnabled,
  ]);
}

/** One encoder/send at a time; intermediate scenes coalesce into the latest. */
export function createWhiteboardBroadcastQueue<T>(options: {
  ready: () => boolean;
  send: (value: T) => Promise<boolean>;
  onError: (error: unknown) => void;
  minGapMs: number;
}) {
  type Pending = { value: T; key: string };
  let pending: Pending | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;
  let disposed = false;
  let lastStartedAt = -Infinity;
  let lastSentKey: string | null = null;
  let retryAt = 0;

  const pause = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    if (disposed || sending || !pending || !options.ready()) return;
    pause();
    const delay = Math.max(0, lastStartedAt + options.minGapMs - Date.now(), retryAt - Date.now());
    if (delay > 0) {
      timer = setTimeout(() => { timer = null; void flush(); }, delay);
    } else {
      void flush();
    }
  };

  const flush = async () => {
    if (disposed || sending || !pending || !options.ready()) return;
    const snapshot = pending;
    pending = null;
    sending = true;
    lastStartedAt = Date.now();
    let sent = false;
    try {
      sent = await options.send(snapshot.value);
      if (sent) lastSentKey = snapshot.key;
    } catch (error) {
      options.onError(error);
    } finally {
      sending = false;
      if (!disposed) {
        if (!sent) {
          // Retain offline edits, but never spin on a failed send. A newer
          // queued scene already contains the edits in this older snapshot.
          pending ??= snapshot;
          retryAt = Date.now() + 3_000;
        } else {
          retryAt = 0;
        }
        schedule();
      }
    }
  };

  return {
    enqueue(value: T, key: string, force = false) {
      if (disposed) return;
      if (!force && (pending?.key === key || (!pending && !sending && lastSentKey === key))) return;
      pending = { value, key };
      schedule();
    },
    pause,
    resume() {
      // A confirmed reconnect/peer join can send the latest scene immediately.
      retryAt = 0;
      schedule();
    },
    dispose() {
      disposed = true;
      pending = null;
      pause();
    },
  };
}
