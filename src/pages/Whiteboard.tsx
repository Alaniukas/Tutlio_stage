import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useWhiteboardSync } from '@/hooks/useWhiteboardSync';
import { useTranslation } from '@/lib/i18n';
import { ArrowLeft, Download, Loader2, Users, Save } from 'lucide-react';
type ExcalidrawImperativeAPI = any;

interface SessionInfo {
  id: string;
  tutor_id: string;
  student_id: string;
  topic: string | null;
  start_time: string;
  students: { full_name: string; linked_user_id: string | null } | null;
  profiles: { full_name: string; organization_id: string | null } | null;
}

export default function WhiteboardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { t } = useTranslation();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ExcalidrawComp, setExcalidrawComp] = useState<React.ComponentType<any> | null>(null);
  const [exportToBlobFn, setExportToBlobFn] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  const currentUser = user && session
    ? { id: user.id, name: session.profiles?.full_name || user.email || 'User' }
    : null;

  const { participants, saving, loaded, onChange, saveScene } = useWhiteboardSync(
    session?.id ?? null,
    excalidrawAPI,
    currentUser,
  );

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
    if (!roomId || !user) return;
    let cancelled = false;

    (async () => {
      const { data, error: fetchErr } = await supabase
        .from('sessions')
        .select('id, tutor_id, student_id, topic, start_time, students(full_name, linked_user_id), profiles!sessions_tutor_id_fkey(full_name, organization_id)')
        .eq('whiteboard_room_id', roomId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchErr || !data) {
        setError(t('whiteboard.notFound'));
        setLoading(false);
        return;
      }

      const sess = data as unknown as SessionInfo;
      const studentLinkedUserId = (sess.students as any)?.linked_user_id;
      const tutorOrgId = (sess.profiles as any)?.organization_id;

      const isTutor = user.id === sess.tutor_id;
      const isStudent = studentLinkedUserId && user.id === studentLinkedUserId;

      let isOrgAdmin = false;
      if (tutorOrgId && !isTutor && !isStudent) {
        const { data: adminCheck } = await supabase
          .from('org_admins')
          .select('id')
          .eq('user_id', user.id)
          .eq('organization_id', tutorOrgId)
          .maybeSingle();
        isOrgAdmin = !!adminCheck;
      }

      if (!isTutor && !isStudent && !isOrgAdmin) {
        if (!cancelled) {
          setError(t('whiteboard.unauthorized'));
          setLoading(false);
        }
        return;
      }

      setSession(sess);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [roomId, user, t]);

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

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center space-y-4">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-indigo-600 hover:underline"
          >
            {t('whiteboard.goBack')}
          </button>
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
          onChange={(elements: readonly any[]) => onChange(elements)}
          isCollaborating={participants.length > 1}
          theme="light"
          name={session?.topic || 'Whiteboard'}
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
