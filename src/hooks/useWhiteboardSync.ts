import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
type ExcalidrawImperativeAPI = any;

const SAVE_DEBOUNCE_MS = 5_000;
const SCENE_FILE = 'scene.json';

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
  const isRemoteUpdateRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadScene = useCallback(async () => {
    if (!sessionId) return null;
    try {
      const { data, error } = await supabase.storage
        .from('whiteboard-data')
        .download(`${sessionId}/${SCENE_FILE}`);
      if (error || !data) return null;
      const text = await data.text();
      return JSON.parse(text) as { elements: readonly any[]; appState?: any };
    } catch {
      return null;
    }
  }, [sessionId]);

  const saveScene = useCallback(async () => {
    if (!sessionId || !excalidrawAPI) return;
    setSaving(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const payload = {
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
        files,
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      await supabase.storage
        .from('whiteboard-data')
        .upload(`${sessionId}/${SCENE_FILE}`, blob, { upsert: true, contentType: 'application/json' });
    } catch (err) {
      console.error('[Whiteboard] save error:', err);
    } finally {
      setSaving(false);
    }
  }, [sessionId, excalidrawAPI]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveScene(); }, SAVE_DEBOUNCE_MS);
  }, [saveScene]);

  const broadcastUpdate = useCallback(
    (elements: readonly any[]) => {
      if (!channelRef.current || isRemoteUpdateRef.current) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'scene-update',
        payload: { elements },
      });
    },
    [],
  );

  useEffect(() => {
    if (!sessionId || !currentUser) return;

    const channel = supabase.channel(`wb:${sessionId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'scene-update' }, ({ payload }) => {
        if (!excalidrawAPI || !payload?.elements) return;
        isRemoteUpdateRef.current = true;
        try {
          const { reconcileElements, CaptureUpdateAction } = require('@excalidraw/excalidraw');
          const local = excalidrawAPI.getSceneElementsIncludingDeleted();
          const reconciled = reconcileElements(local, payload.elements, excalidrawAPI.getAppState());
          excalidrawAPI.updateScene({
            elements: reconciled,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        } catch {
          excalidrawAPI.updateScene({ elements: payload.elements });
        } finally {
          isRemoteUpdateRef.current = false;
        }
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
    };
  }, [sessionId, currentUser, excalidrawAPI]);

  useEffect(() => {
    if (!sessionId || !excalidrawAPI || loaded) return;

    let cancelled = false;
    (async () => {
      const scene = await loadScene();
      if (cancelled || !scene) {
        setLoaded(true);
        return;
      }
      try {
        const { CaptureUpdateAction } = require('@excalidraw/excalidraw');
        excalidrawAPI.updateScene({
          elements: scene.elements,
          appState: scene.appState,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        excalidrawAPI.updateScene({ elements: scene.elements, appState: scene.appState });
      }
      setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [sessionId, excalidrawAPI, loaded, loadScene]);

  const onChange = useCallback(
    (elements: readonly any[]) => {
      if (isRemoteUpdateRef.current) return;
      broadcastUpdate(elements);
      debouncedSave();
    },
    [broadcastUpdate, debouncedSave],
  );

  return { participants, saving, loaded, onChange, saveScene };
}
