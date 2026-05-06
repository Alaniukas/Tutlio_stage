import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useWhiteboardSync } from '@/hooks/useWhiteboardSync';
import { useTranslation } from '@/lib/i18n';
import { ArrowLeft, Download, Loader2, Users, Save } from 'lucide-react';
import '@excalidraw/excalidraw/index.css';
type ExcalidrawImperativeAPI = any;
const AUTH_HANDSHAKE_TIMEOUT_MS = 1200;

interface SessionInfo {
  id: string;
  tutor_id: string;
  student_id: string;
  topic: string | null;
  start_time: string;
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

  const currentUser = user && session
    ? { id: user.id, name: session.profiles?.full_name || user.email || 'User' }
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
      // #region agent log
      fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'post-fix',hypothesisId:'H3',location:'Whiteboard.tsx:authBootstrap:start',message:'whiteboard auth bootstrap start',data:{hasOpener:!!window.opener,hasNewTabParam:window.location.search.includes('new_tab=1'),hasUserFromContext:!!user,userId:user?.id||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      // If UserContext already resolved a user, never mutate auth session here.
      // This avoids cross-account session overrides in new-tab whiteboard flows.
      if (user) {
        if (!cancelled) setAuthBootstrapDone(true);
        // #region agent log
        fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'post-fix',hypothesisId:'H3',location:'Whiteboard.tsx:authBootstrap:skipBecauseUserContext',message:'skip whiteboard setSession because context user exists',data:{userId:user.id},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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
            // #region agent log
            fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'post-fix',hypothesisId:'H3',location:'Whiteboard.tsx:authBootstrap:openerSetSession',message:'calling setSession from opener bootstrap',data:{hasTokens:true},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
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
            // #region agent log
            fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'post-fix',hypothesisId:'H3',location:'Whiteboard.tsx:authBootstrap:localSetSession',message:'calling setSession from local bootstrap key',data:{hasBootstrapKey:true,expiresAt:parsed.expiresAt||null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
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
    let cancelled = false;

    (async () => {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run1',hypothesisId:'H4',location:'Whiteboard.tsx:sessionLoad:start',message:'starting whiteboard session fetch',data:{roomId,authBootstrapDone,userLoading,hasUser:!!user},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        // #region agent log
        const { data: authSnapshot, error: authSnapshotErr } = await supabase.auth.getSession();
        fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run3',hypothesisId:'H8',location:'Whiteboard.tsx:sessionLoad:authSnapshot',message:'auth snapshot before sessions select',data:{hasSession:!!authSnapshot?.session,userId:authSnapshot?.session?.user?.id||null,hasAccessToken:!!authSnapshot?.session?.access_token,expiresAt:authSnapshot?.session?.expires_at||null,authError:authSnapshotErr?.message||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        // #region agent log
        try {
          const probe = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/sessions?select=id&limit=1`, {
            method: 'GET',
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${authSnapshot?.session?.access_token || ''}`,
            },
          });
          fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run3',hypothesisId:'H7',location:'Whiteboard.tsx:sessionLoad:networkProbe',message:'supabase authorized sessions probe result',data:{ok:probe.ok,status:probe.status},timestamp:Date.now()})}).catch(()=>{});
        } catch (probeErr: any) {
          fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run3',hypothesisId:'H7',location:'Whiteboard.tsx:sessionLoad:networkProbe',message:'supabase rest probe failed',data:{errorName:probeErr?.name||null,errorMessage:probeErr?.message||null},timestamp:Date.now()})}).catch(()=>{});
        }
        // #endregion
        const checkOrgAdminAccess = async (organizationId: string, userId: string): Promise<boolean> => {
          try {
            const { data: orgAdminsCheck, error: orgAdminsErr } = await supabase
              .from('org_admins')
              .select('id')
              .eq('user_id', userId)
              .eq('organization_id', organizationId)
              .maybeSingle();
            if (!orgAdminsErr && orgAdminsCheck) return true;
          } catch {
            // Fallback below handles schemas that only have organization_admins.
          }

          const { data: organizationAdminsCheck } = await supabase
            .from('organization_admins')
            .select('user_id')
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          return !!organizationAdminsCheck;
        };

        const { data, error: fetchErr } = await supabase
          .from('sessions')
          .select('id, tutor_id, student_id, topic, start_time, students(full_name, linked_user_id), profiles!sessions_tutor_id_fkey(full_name, organization_id)')
          .eq('whiteboard_room_id', roomId)
          .maybeSingle();
        // #region agent log
        fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run1',hypothesisId:'H4',location:'Whiteboard.tsx:sessionLoad:afterFetch',message:'whiteboard session fetch result',data:{hasData:!!data,hasError:!!fetchErr,errorCode:fetchErr?.code||null,errorMessage:fetchErr?.message||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        if (cancelled) return;

        if (fetchErr || !data) {
          const transientNetworkError =
            !!fetchErr?.message &&
            (String(fetchErr.message).includes('Failed to fetch') ||
              String(fetchErr.message).includes('AbortError') ||
              String(fetchErr.message).includes('Load failed'));
          // #region agent log
          fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run3',hypothesisId:'H4',location:'Whiteboard.tsx:sessionLoad:notFoundBranch',message:'whiteboard denied at fetchErr/notFound branch',data:{errorCode:fetchErr?.code||null,errorMessage:fetchErr?.message||null,transientNetworkError},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (transientNetworkError) {
            // Don't render a false "not found" on transient fetch/auth races.
            return;
          }
          setError(t('whiteboard.notFound'));
          setLoading(false);
          return;
        }

        const sess = data as unknown as SessionInfo;
        const studentLinkedUserId = (sess.students as any)?.linked_user_id;
        const tutorOrgId = (sess.profiles as any)?.organization_id;
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('id, organization_id')
          .eq('id', user.id)
          .maybeSingle();

        const isTutor = user.id === sess.tutor_id;
        const isStudent = studentLinkedUserId && user.id === studentLinkedUserId;
        const isOrgTutor =
          !!currentProfile &&
          !!tutorOrgId &&
          String((currentProfile as any).organization_id || '') === String(tutorOrgId);

        let isOrgAdmin = false;
        if (tutorOrgId && !isTutor && !isStudent) {
          isOrgAdmin = await checkOrgAdminAccess(tutorOrgId, user.id);
        }

        if (!isTutor && !isStudent && !isOrgAdmin && !isOrgTutor) {
          // #region agent log
          fetch('http://127.0.0.1:7542/ingest/2074e1d8-d766-40c5-91c7-5d517d892573',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'155c01'},body:JSON.stringify({sessionId:'155c01',runId:'run2',hypothesisId:'H4',location:'Whiteboard.tsx:sessionLoad:unauthorizedBranch',message:'whiteboard unauthorized branch',data:{currentUserId:user.id,tutorId:sess.tutor_id,studentLinkedUserId:studentLinkedUserId||null,tutorOrgId:tutorOrgId||null,isTutor,isStudent,isOrgAdmin,isOrgTutor},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          console.warn('[Whiteboard] Access denied', {
            roomId,
            currentUserId: user.id,
            tutorId: sess.tutor_id,
            studentLinkedUserId,
            tutorOrgId,
            isTutor,
            isStudent,
            isOrgAdmin,
            isOrgTutor,
          });
          if (!cancelled) {
            setError(t('whiteboard.unauthorized'));
            setLoading(false);
          }
          return;
        }

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
  }, [roomId, user, userLoading, t, authBootstrapDone]);

  const handleExportPdf = useCallback(async () => {
    if (!excalidrawAPI || !exportToBlobFn || !session) return;
    setExporting(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const blob = await exportToBlobFn({
        elements,
        appState: { ...appState, exportWithDarkMode: false },
        files,
        mimeType: 'image/png',
        getDimensions: (w: number, h: number) => ({
          width: Math.min(w, 3840),
          height: Math.min(h, 2160),
          scale: 2,
        }),
      });

      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      const pngBytes = new Uint8Array(await blob.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);

      const pageWidth = Math.max(pngImage.width, 595);
      const pageHeight = Math.max(pngImage.height, 842);
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      const scale = Math.min(pageWidth / pngImage.width, pageHeight / pngImage.height);
      const scaledW = pngImage.width * scale;
      const scaledH = pngImage.height * scale;

      page.drawImage(pngImage, {
        x: (pageWidth - scaledW) / 2,
        y: (pageHeight - scaledH) / 2,
        width: scaledW,
        height: scaledH,
      });

      const pdfBytes = await pdfDoc.save();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `whiteboard-${timestamp}.pdf`;

      const { error: uploadErr } = await supabase.storage
        .from('session-files')
        .upload(`${session.id}/${fileName}`, pdfBytes, {
          upsert: false,
          contentType: 'application/pdf',
        });

      if (uploadErr) {
        console.error('[Whiteboard] PDF upload error:', uploadErr);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
      }
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
    const handleErrorAction = () => {
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
          <button
            onClick={handleErrorAction}
            className="text-sm text-indigo-600 hover:underline"
          >
            Perkrauti / Uždaryti
          </button>
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
          initialData={libraryItems.length > 0 ? { libraryItems } : undefined}
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
