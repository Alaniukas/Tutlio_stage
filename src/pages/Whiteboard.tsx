import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useWhiteboardSync } from '@/hooks/useWhiteboardSync';
import { useTranslation } from '@/lib/i18n';
import { isWhiteboardOpenForSession } from '@/lib/whiteboardAccess';
import { ArrowLeft, Download, Loader2, Users, Save } from 'lucide-react';
import '@excalidraw/excalidraw/index.css';
type ExcalidrawImperativeAPI = any;
const AUTH_HANDSHAKE_TIMEOUT_MS = 1200;

const PAGE_GUIDE_ID = '__page-guide__';

interface SessionInfo {
  id: string;
  tutor_id: string;
  student_id: string;
  topic: string | null;
  start_time: string;
  status?: string;
  end_time?: string;
  students: { full_name: string; linked_user_id: string | null } | null;
  profiles: { full_name: string; organization_id: string | null } | null;
}

const WHITEBOARD_AUTH_BOOTSTRAP_KEY = 'tutlio_whiteboard_auth_bootstrap';
const WB_AUTH_REQUEST = 'tutlio:whiteboard-auth-request';
const WB_AUTH_RESPONSE = 'tutlio:whiteboard-auth-response';
const MATH_SYMBOLS = ['π', '√', '≤', '≥', '×', '÷', '∑', '∫', 'α', 'β', 'Δ', '∞'];
const EXCALIDRAW_LIBRARY_URLS = [
  'https://libraries.excalidraw.com/libraries/https-github-com-ytrkptl/math-teacher-library.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/aimpizza/3d-coordinate-systems-graphs.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/jjadup/mathematical-symbols.excalidrawlib',
  'https://libraries.excalidraw.com/libraries/pgilfernandez/basic-shapes.excalidrawlib',
];

export default function WhiteboardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, loading: userLoading } = useUser();
  const { t } = useTranslation();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ExcalidrawComp, setExcalidrawComp] = useState<React.ComponentType<any> | null>(null);
  const [exportToBlobFn, setExportToBlobFn] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [authBootstrapDone, setAuthBootstrapDone] = useState(false);
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  const currentUser = user && session
    ? {
        id: user.id,
        name: (user.id === session.students?.linked_user_id
          ? session.students?.full_name
          : session.profiles?.full_name) || user.email || 'User',
      }
    : null;

  const { participants, saving, loaded, onChange, saveScene } = useWhiteboardSync(
    session?.id ?? null,
    excalidrawAPI,
    currentUser,
  );

  useEffect(() => {
    if (userLoading) return;
    let cancelled = false;
    (async () => {
      // If UserContext already resolved a user, never mutate auth session here.
      // This avoids cross-account session overrides in new-tab whiteboard flows.
      if (user) {
        if (!cancelled) setAuthBootstrapDone(true);
        return;
      }

      // New-tab auth handoff for sessionStorage mode.
      if (window.opener && window.location.search.includes('new_tab=1')) {
        try {
          const received = await new Promise<{ accessToken: string | null; refreshToken: string | null } | null>((resolve) => {
            const onMessage = (evt: MessageEvent) => {
              if (evt.origin !== window.location.origin) return;
              if (!evt.data || evt.data?.type !== WB_AUTH_RESPONSE) return;
              window.removeEventListener('message', onMessage);
              resolve({
                accessToken: evt.data?.accessToken ?? null,
                refreshToken: evt.data?.refreshToken ?? null,
              });
            };
            window.addEventListener('message', onMessage);
            window.opener.postMessage({ type: WB_AUTH_REQUEST }, window.location.origin);
            window.setTimeout(() => {
              window.removeEventListener('message', onMessage);
              resolve(null);
            }, AUTH_HANDSHAKE_TIMEOUT_MS);
          });
          if (received?.accessToken && received?.refreshToken) {
            await supabase.auth.setSession({
              access_token: received.accessToken,
              refresh_token: received.refreshToken,
            });
          }
        } catch (err) {
          console.warn('[Whiteboard] opener auth handoff failed:', err);
        }
      }

      try {
        const raw = localStorage.getItem(WHITEBOARD_AUTH_BOOTSTRAP_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            accessToken?: string;
            refreshToken?: string;
            expiresAt?: number;
          };
          const isValid =
            typeof parsed?.accessToken === 'string' &&
            typeof parsed?.refreshToken === 'string' &&
            Number(parsed?.expiresAt || 0) > Date.now();
          if (isValid) {
            await supabase.auth.setSession({
              access_token: parsed.accessToken as string,
              refresh_token: parsed.refreshToken as string,
            });
          }
        }
      } catch (err) {
        console.warn('[Whiteboard] Auth bootstrap failed:', err);
      } finally {
        localStorage.removeItem(WHITEBOARD_AUTH_BOOTSTRAP_KEY);
        if (!cancelled) setAuthBootstrapDone(true);
      }

      if (!cancelled) setAuthBootstrapDone(true);
    })();
    return () => { cancelled = true; };
  }, [userLoading, user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedLibraries = await Promise.all(
          EXCALIDRAW_LIBRARY_URLS.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) return [];
            const parsed = await response.json();
            if (Array.isArray(parsed?.libraryItems)) return parsed.libraryItems;
            if (Array.isArray(parsed)) return parsed;
            return [];
          }),
        );
        if (cancelled) return;
        const deduped = new Map<string, any>();
        loadedLibraries.flat().forEach((item: any) => {
          const key = String(item?.id || item?.name || JSON.stringify(item));
          if (!deduped.has(key)) deduped.set(key, item);
        });
        setLibraryItems(Array.from(deduped.values()));
      } catch (err) {
        console.warn('[Whiteboard] Failed to load Excalidraw libraries:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@excalidraw/excalidraw');
        if (cancelled) return;
        setExcalidrawComp(() => mod.Excalidraw);
        setExportToBlobFn(() => mod.exportToBlob);
      } catch (err) {
        console.error('[Whiteboard] Failed to load Excalidraw:', err);
        if (!cancelled) setError('Failed to load whiteboard component');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const userIdRef = useRef(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  useEffect(() => {
    if (!roomId) {
      setError(t('whiteboard.notFound'));
      setLoading(false);
      return;
    }
    if (!authBootstrapDone) return;
    if (userLoading) return;
    if (!user) {
      setError(t('whiteboard.unauthorized'));
      setLoading(false);
      return;
    }
    // Session already loaded for this user — don't re-fetch on user object ref changes
    if (session && userIdRef.current === user.id) return;
    let cancelled = false;

    const isRetryableError = (err: { message?: string; code?: string } | null): boolean => {
      if (!err) return false;
      const msg = String(err.message || '');
      const code = String(err.code || '');
      return (
        msg.includes('Failed to fetch') ||
        msg.includes('AbortError') ||
        msg.includes('Load failed') ||
        msg.includes('timeout') ||
        msg.includes('statement') ||
        code === '57014' ||
        code === '500' ||
        code === '503' ||
        code === '502' ||
        code === '504'
      );
    };

    const MAX_RETRIES = 2;
    const RETRY_BASE_MS = 1000;

    const fetchSessionWithRetry = async (): Promise<{ data: any; error: any }> => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (cancelled) return { data: null, error: null };
        // Lightweight query first — no joins, avoids heavy RLS + join overhead
        const { data, error: fetchErr } = await supabase
          .from('sessions')
          .select('id, tutor_id, student_id, topic, start_time, end_time, status')
          .eq('whiteboard_room_id', roomId)
          .maybeSingle();

        if (!fetchErr && data) return { data, error: null };
        if (fetchErr && !isRetryableError(fetchErr)) return { data: null, error: fetchErr };
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          return { data, error: fetchErr };
        }
      }
      return { data: null, error: { message: 'Max retries exceeded' } };
    };

    (async () => {
      try {
        const { data: baseSession, error: fetchErr } = await fetchSessionWithRetry();

        if (cancelled) return;

        if (fetchErr || !baseSession) {
          setError(t('whiteboard.notFound'));
          setLoading(false);
          return;
        }

        const isTutor = user.id === baseSession.tutor_id;

        // Fetch related data in parallel — these are small single-row queries
        const [studentRes, tutorProfileRes] = await Promise.all([
          supabase.from('students').select('full_name, linked_user_id').eq('id', baseSession.student_id).maybeSingle(),
          supabase.from('profiles').select('full_name, organization_id').eq('id', baseSession.tutor_id).maybeSingle(),
        ]);

        if (cancelled) return;

        const studentLinkedUserId = studentRes.data?.linked_user_id;
        const tutorOrgId = tutorProfileRes.data?.organization_id;
        const isStudent = studentLinkedUserId && user.id === studentLinkedUserId;

        let isOrgTutor = false;
        let isOrgAdmin = false;

        if (!isTutor && !isStudent && tutorOrgId) {
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .maybeSingle();

          isOrgTutor = !!currentProfile &&
            String(currentProfile.organization_id || '') === String(tutorOrgId);

          if (!isOrgTutor) {
            try {
              const { data: orgAdminsCheck, error: orgAdminsErr } = await supabase
                .from('org_admins')
                .select('id')
                .eq('user_id', user.id)
                .eq('organization_id', tutorOrgId)
                .maybeSingle();
              if (!orgAdminsErr && orgAdminsCheck) isOrgAdmin = true;
            } catch { /* fallback */ }

            if (!isOrgAdmin) {
              const { data: organizationAdminsCheck } = await supabase
                .from('organization_admins')
                .select('user_id')
                .eq('user_id', user.id)
                .eq('organization_id', tutorOrgId)
                .maybeSingle();
              isOrgAdmin = !!organizationAdminsCheck;
            }
          }
        }

        if (!isTutor && !isStudent && !isOrgAdmin && !isOrgTutor) {
          if (!cancelled) {
            setError(t('whiteboard.unauthorized'));
            setLoading(false);
          }
          return;
        }

        if (!isWhiteboardOpenForSession(baseSession.status, baseSession.end_time)) {
          if (!cancelled) {
            setError(t('whiteboard.closedAfterLesson'));
            setLoading(false);
          }
          return;
        }

        const sess: SessionInfo = {
          id: baseSession.id,
          tutor_id: baseSession.tutor_id,
          student_id: baseSession.student_id,
          topic: baseSession.topic,
          start_time: baseSession.start_time,
          status: baseSession.status,
          end_time: baseSession.end_time,
          students: studentRes.data ? { full_name: studentRes.data.full_name, linked_user_id: studentRes.data.linked_user_id } : null,
          profiles: tutorProfileRes.data ? { full_name: tutorProfileRes.data.full_name, organization_id: tutorProfileRes.data.organization_id } : null,
        };

        setSession(sess);
        setLoading(false);
      } catch (err) {
        console.error('[Whiteboard] failed to load session/access state:', err);
        if (!cancelled) {
          setError(t('whiteboard.notFound'));
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id, userLoading, authBootstrapDone, retryKey]);

  const handleExportPdf = useCallback(async () => {
    if (!excalidrawAPI || !exportToBlobFn || !session) return;
    setExporting(true);
    try {
      const elements = excalidrawAPI.getSceneElements()
        .filter((el: any) => el.id !== PAGE_GUIDE_ID);
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      if (!elements.length) {
        setExporting(false);
        return;
      }

      const EXPORT_SCALE = 2;
      const blob = await exportToBlobFn({
        elements,
        appState: { ...appState, exportWithDarkMode: false, exportBackground: true },
        files,
        mimeType: 'image/png',
        getDimensions: (w: number, h: number) => ({
          width: w * EXPORT_SCALE,
          height: h * EXPORT_SCALE,
          scale: 1,
        }),
      });

      const img = new Image();
      const imgUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load export image'));
        img.src = imgUrl;
      });

      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;

      const A4_W_PT = 595;
      const A4_H_PT = 842;
      const MARGIN = 30;
      const usableW = A4_W_PT - MARGIN * 2;
      const usableH = A4_H_PT - MARGIN * 2;

      const fitScale = usableW / srcW;
      const totalPdfH = srcH * fitScale;

      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();

      if (totalPdfH <= usableH) {
        const page = pdfDoc.addPage([A4_W_PT, A4_H_PT]);
        const pngBytes = new Uint8Array(await blob.arrayBuffer());
        const pngImage = await pdfDoc.embedPng(pngBytes);
        page.drawImage(pngImage, {
          x: MARGIN,
          y: A4_H_PT - MARGIN - totalPdfH,
          width: usableW,
          height: totalPdfH,
        });
      } else {
        const sliceSrcH = usableH / fitScale;
        const pageCount = Math.ceil(srcH / sliceSrcH);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = srcW;
        const ctx = sliceCanvas.getContext('2d')!;

        for (let i = 0; i < pageCount; i++) {
          const srcY = Math.round(i * sliceSrcH);
          const thisSliceH = Math.min(Math.round(sliceSrcH), srcH - srcY);
          if (thisSliceH <= 0) break;

          sliceCanvas.height = thisSliceH;
          ctx.clearRect(0, 0, srcW, thisSliceH);
          ctx.drawImage(img, 0, srcY, srcW, thisSliceH, 0, 0, srcW, thisSliceH);

          const sliceBlob = await new Promise<Blob>((res) =>
            sliceCanvas.toBlob((b) => res(b!), 'image/png'),
          );
          const slicePng = await pdfDoc.embedPng(new Uint8Array(await sliceBlob.arrayBuffer()));
          const pdfSliceH = thisSliceH * fitScale;
          const page = pdfDoc.addPage([A4_W_PT, A4_H_PT]);
          page.drawImage(slicePng, {
            x: MARGIN,
            y: A4_H_PT - MARGIN - pdfSliceH,
            width: usableW,
            height: pdfSliceH,
          });
        }
      }

      URL.revokeObjectURL(imgUrl);

      const pdfBytes = await pdfDoc.save();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `whiteboard-${timestamp}.pdf`;

      const blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(blobUrl);

      supabase.storage
        .from('session-files')
        .upload(`${session.id}/${fileName}`, pdfBytes, { upsert: false, contentType: 'application/pdf' })
        .then(({ error: uploadErr }) => {
          if (uploadErr) console.warn('[Whiteboard] PDF upload to storage failed (local copy saved):', uploadErr.message);
        });
    } catch (err) {
      console.error('[Whiteboard] export error:', err);
    } finally {
      setExporting(false);
    }
  }, [excalidrawAPI, exportToBlobFn, session]);

  const handleCopySymbol = useCallback(async (symbol: string) => {
    try {
      await navigator.clipboard.writeText(symbol);
      setCopiedSymbol(symbol);
      window.setTimeout(() => setCopiedSymbol((current) => (current === symbol ? null : current)), 1200);
    } catch {
      setCopiedSymbol(null);
    }
  }, []);

  if (error) {
    const handleRetry = () => {
      setError(null);
      setLoading(true);
      setRetryKey((k) => k + 1);
    };

    const handleGoBack = () => {
      if (window.history.length > 1) {
        navigate(-1);
        return;
      }
      try {
        window.close();
      } catch {
        /* no-op */
      }
      window.location.reload();
    };

    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center space-y-4">
          <p className="text-red-600 font-medium">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleRetry}
              className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors"
            >
              {t('whiteboard.retry') || 'Retry'}
            </button>
            <button
              onClick={handleGoBack}
              className="text-sm text-indigo-600 hover:underline"
            >
              {t('whiteboard.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !ExcalidrawComp) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="text-sm text-gray-500">{t('whiteboard.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('whiteboard.back')}</span>
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <h1 className="text-sm font-semibold text-gray-800 truncate max-w-[200px] sm:max-w-[400px]">
            {session?.topic || t('whiteboard.title')}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
            <span className="text-[11px] text-gray-500 mr-1">Math</span>
            {MATH_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                onClick={() => handleCopySymbol(symbol)}
                className="px-1.5 py-0.5 text-xs rounded hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
                title={`Copy ${symbol}`}
              >
                {symbol}
              </button>
            ))}
            {copiedSymbol && (
              <span className="text-[10px] text-emerald-600 ml-1">Copied {copiedSymbol}</span>
            )}
          </div>

          {participants.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Users className="w-3.5 h-3.5" />
              <span>{participants.length}</span>
            </div>
          )}

          {saving && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('whiteboard.saving')}
            </span>
          )}

          <button
            onClick={saveScene}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('whiteboard.save')}</span>
          </button>

          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{t('whiteboard.exportPdf')}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        )}
        <ExcalidrawComp
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => setExcalidrawAPI(api)}
          onChange={(elements: readonly any[], appState: any, files: any) => onChange(elements, appState, files)}
          isCollaborating={participants.length > 1}
          theme="light"
          name={session?.topic || 'Whiteboard'}
          initialData={{
            ...(libraryItems.length > 0 ? { libraryItems } : {}),
            appState: { gridModeEnabled: true, gridSize: 10 },
          }}
          UIOptions={{
            canvasActions: {
              export: false,
              saveAsImage: false,
            },
          }}
        />
      </div>
    </div>
  );
}
