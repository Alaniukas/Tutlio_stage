import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Paperclip, Upload, Video } from 'lucide-react';
import ParentLayout from '@/components/ParentLayout';
import StudentLayout from '@/components/StudentLayout';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { getParentActiveChildId, setParentActiveChildId } from '@/lib/parentActiveChild';
import SchoolGroupMaterialLibrary from '@/components/school/SchoolGroupMaterialLibrary';

type Child = { id: string; full_name: string };
type MaterialFile = { name: string; folderId: string; url: string | null; submission: boolean; own: boolean };
type MaterialSession = { id: string; start: string; group: string; subject: string; topic: string; tutorComment?: string; files: MaterialFile[] };
type RecordingGroup = { id: string; name: string; pending?: boolean; loadError: string | null;
  recordings: Array<{ id: string; name: string; streamUrl: string }> };
type Payload = { ok: boolean; student: { id: string; name: string }; sessions: MaterialSession[]; recordingGroups: RecordingGroup[] };

export default function SchoolFamilyMaterials({ portal }: { portal: 'parent' | 'student' }) {
  const { t, locale } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState(search.get('student') || search.get('studentId') || (portal === 'parent' ? getParentActiveChildId() || '' : ''));
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [recordingGroups, setRecordingGroups] = useState<RecordingGroup[]>([]);
  const [selectedRecordingGroup, setSelectedRecordingGroup] = useState('');
  const [selectedRecording, setSelectedRecording] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/school-homework?children=1', { headers: await authHeaders(), signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error();
        if (controller.signal.aborted) return;
        const rows: Child[] = result.children || [];
        setChildren(rows);
        setChildId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || '');
        if (!rows.length) setLoading(false);
      } catch { if (!controller.signal.aborted) { setError(t('common.error')); setLoading(false); } }
    })();
    return () => controller.abort();
  }, [t]);

  const load = useCallback(async (id: string, signal?: AbortSignal): Promise<Payload> => {
    const response = await fetch(`/api/school-homework?student=${encodeURIComponent(id)}`, { headers: await authHeaders(), signal });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(t('common.error'));
    return result;
  }, [t]);

  useEffect(() => {
    if (!childId || !children.some((child) => child.id === childId)) return;
    const current = ++generation.current; const controller = new AbortController();
    setLoading(true); setError(''); setPayload(null); setRecordingGroups([]); setSelectedRecording('');
    void load(childId, controller.signal).then((result) => {
      if (current !== generation.current) return;
      setPayload(result); setRecordingGroups(result.recordingGroups || []);
      setSelectedRecordingGroup(result.recordingGroups?.[0]?.id || '');
    }).catch(() => { if (!controller.signal.aborted) setError(t('common.error')); })
      .finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
    return () => { controller.abort(); generation.current++; };
  }, [childId, children, load, t]);

  const group = recordingGroups.find((row) => row.id === selectedRecordingGroup);
  useEffect(() => {
    if (!group?.pending || !childId) return;
    const id = group.id; const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/school-homework?student=${encodeURIComponent(childId)}&group=${encodeURIComponent(id)}`,
          { headers: await authHeaders(), signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error();
        const loaded = result.recordingGroups?.find((row: RecordingGroup) => row.id === id);
        if (!controller.signal.aborted) setRecordingGroups((rows) => rows.map((row) => row.id === id
          ? loaded || { ...row, pending: false, loadError: t('common.error') } : row));
      } catch { if (!controller.signal.aborted) setRecordingGroups((rows) => rows.map((row) => row.id === id ? { ...row, pending: false, loadError: t('common.error') } : row)); }
    })();
    return () => controller.abort();
  }, [group?.id, group?.pending, childId, t]);

  const chooseChild = (id: string) => {
    setChildId(id); setSearch({ student: id }, { replace: true });
    if (portal === 'parent') setParentActiveChildId(id);
  };
  const download = async (sessionId: string, file: MaterialFile) => {
    try {
      // Refresh live access before requesting the authenticated file proxy.
      const latest = await load(childId);
      const url = latest.sessions.find((s) => s.id === sessionId)?.files.find((f) => f.folderId === file.folderId && f.name === file.name)?.url;
      if (!url) throw new Error();
      const response = await fetch(url, { headers: await authHeaders() }); if (!response.ok) throw new Error();
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = file.name; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch { setError(t('files.downloadFailed')); }
  };
  const upload = async (sessionId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    const uploadChildId = childId; const uploadGeneration = generation.current;
    setUploading(sessionId); setError('');
    try {
      const prep = await fetch('/api/school-homework', { method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ student: uploadChildId, action: 'upload-url', sessionId, fileName: file.name, size: file.size }) });
      const result = await prep.json(); if (!prep.ok || !result.path || !result.token) throw new Error();
      const uploaded = await supabase.storage.from('session-files').uploadToSignedUrl(result.path, result.token, file, { upsert: true, contentType: file.type || undefined });
      if (uploaded.error) throw uploaded.error;
      const latest = await load(uploadChildId);
      if (generation.current === uploadGeneration) setPayload(latest);
    } catch { if (generation.current === uploadGeneration) setError(t('common.error')); } finally { setUploading(null); }
  };
  const video = group?.recordings.find((row) => row.id === selectedRecording) || group?.recordings[0];
  const content = <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <h1 className="text-2xl font-bold">{t('school.materials.title')}</h1>
    {children.length > 1 && <label className="block space-y-2" htmlFor="family-material-child"><span className="text-sm font-medium">{t('school.materials.pickChild')}</span>
      <select id="family-material-child" className="w-full rounded-xl border p-3" value={childId} onChange={(event) => chooseChild(event.target.value)}>
        {children.map((child) => <option key={child.id} value={child.id}>{child.full_name}</option>)}
      </select></label>}
    {payload && <p className="text-sm text-gray-600">{payload.student.name}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</div>
      : !children.length ? <p>{t('school.materials.noChildren')}</p> : <>
        <section id="recordings" className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Video className="h-5 w-5" />{t('school.materials.recordings')}</h2>
          {recordingGroups.length > 1 && <select aria-label={t('companyNav.groups')} className="w-full rounded-xl border p-3" value={selectedRecordingGroup}
            onChange={(event) => { setSelectedRecordingGroup(event.target.value); setSelectedRecording(''); }}>{recordingGroups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
          {group?.pending ? <p>{t('common.loading')}</p> : group?.loadError ? <p role="alert">{group.loadError}</p> : video ? <>
            {group!.recordings.length > 1 && <select aria-label={t('school.materials.recordings')} className="w-full rounded-xl border p-3" value={video.id} onChange={(event) => setSelectedRecording(event.target.value)}>
              {group!.recordings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
            <p className="text-sm">{video.name}</p><video key={video.id} controls preload="metadata" src={video.streamUrl} className="w-full rounded-xl bg-black" />
          </> : <p className="text-sm text-gray-500">{t('school.materials.noFiles')}</p>}
        </section>
        <SchoolGroupMaterialLibrary studentId={childId} authenticated />
        <section className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Paperclip className="h-5 w-5" />{t('school.materials.homework')}</h2>
          {!payload?.sessions.length && <p>{t('school.materials.noFiles')}</p>}
          {[...(payload?.sessions || [])].sort((a, b) => b.start.localeCompare(a.start)).map((session) => <article key={session.id} className="space-y-3 rounded-2xl border bg-white p-4">
            <div><h3 className="font-semibold">{session.group || session.subject || session.topic}</h3>
              <p className="text-sm text-gray-500">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Vilnius' }).format(new Date(session.start))}</p></div>
            {session.tutorComment && <p className="whitespace-pre-wrap rounded-xl bg-indigo-50 p-3 text-sm">{session.tutorComment}</p>}
            {session.files.filter((file) => !file.submission || file.own).map((file) => <Button key={`${file.folderId}/${file.name}`} variant="outline" className="max-w-full justify-start" onClick={() => void download(session.id, file)}><Paperclip className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span></Button>)}
            {!session.files.length && <p className="text-sm text-gray-500">{t('school.materials.noFiles')}</p>}
            <label className="flex flex-wrap items-center gap-2 text-sm"><Upload className="h-4 w-4" />{t('common.upload')}
              <input type="file" aria-label={`${t('common.upload')} ${session.group || session.subject}`} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.txt" disabled={uploading !== null} onChange={(event) => void upload(session.id, event)} /></label>
          </article>)}
        </section>
      </>}
  </div>;
  return portal === 'parent' ? <ParentLayout>{content}</ParentLayout> : <StudentLayout>{content}</StudentLayout>;
}
