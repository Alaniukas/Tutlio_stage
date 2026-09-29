import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Download, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type FileRow = { id: string; name: string; size: number | null; createdAt: string | null };
type GroupRow = { id: string; name: string; files: FileRow[] };

export default function SchoolGroupMaterialLibrary({
  groupId, studentId, token, authenticated = false,
}: { groupId?: string; studentId?: string; token?: string; authenticated?: boolean }) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = useCallback(async () => authenticated ? authHeaders() : {}, [authenticated]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (groupId) query.set('group', groupId);
    if (studentId) query.set('student', studentId);
    if (token) query.set('t', token);
    const response = await fetch(`/api/school-group-materials?${query}`, { headers: await headers(), signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(t('common.error'));
    setGroups(result.groups || []);
    setCanManage(result.canManage === true);
  }, [groupId, studentId, token, headers, t]);

  useEffect(() => {
    if (!groupId && !studentId) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setGroups([]);
    void load(controller.signal).catch(() => { if (!controller.signal.aborted) setError(t('common.error')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [groupId, studentId, load, t]);

  const download = async (group: GroupRow, file: FileRow) => {
    setError('');
    try {
      const query = new URLSearchParams({ group: group.id, file: file.id });
      if (studentId) query.set('student', studentId);
      if (token) query.set('t', token);
      const response = await fetch(`/api/school-group-material-file?${query}`, { headers: await headers() });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.name; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { setError(t('files.downloadFailed')); }
  };

  const upload = async (group: GroupRow, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size < 1 || file.size > 10 * 1024 * 1024 ||
      !/\.(pdf|png|jpe?g|docx?|xlsx|txt)$/i.test(file.name)) {
      setError(t('school.groupLibrary.badFile')); return;
    }
    setBusy(true); setError('');
    try {
      const prepared = await fetch('/api/school-group-materials', {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ action: 'upload-url', group: group.id, fileName: file.name, size: file.size }),
      });
      const result = await prepared.json().catch(() => ({}));
      if (!prepared.ok || !result.path || !result.token) throw new Error();
      const uploaded = await supabase.storage.from('school-group-materials')
        .uploadToSignedUrl(result.path, result.token, file, { contentType: file.type || 'application/octet-stream' });
      if (uploaded.error) throw uploaded.error;
      const published = await fetch('/api/school-group-materials', {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ action: 'publish', group: group.id, file: result.path.slice(group.id.length + 1) }),
      });
      if (!published.ok) throw new Error();
      await load();
    } catch { setError(t('common.error')); }
    finally { setBusy(false); }
  };

  const remove = async (group: GroupRow, file: FileRow) => {
    if (!window.confirm(`${t('common.remove')} ${file.name}?`)) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/school-group-materials', {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ action: 'remove', group: group.id, file: file.id }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch { setError(t('common.error')); }
    finally { setBusy(false); }
  };

  if (!groupId && !studentId) return null;
  return <section className="space-y-3 rounded-2xl border bg-white p-4" aria-label={t('school.groupLibrary.title')}>
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Paperclip className="h-5 w-5" />{t('school.groupLibrary.title')}</h2>
      <p className="text-sm text-gray-600">{t('school.groupLibrary.lead')}</p>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>
      : !groups.length ? <p className="text-sm text-gray-500">{t('school.materials.noFiles')}</p>
        : groups.map((group) => <div key={group.id} className="space-y-2 rounded-xl border p-3">
          <h3 className="font-medium">{group.name}</h3>
          {!group.files.length && <p className="text-sm text-gray-500">{t('school.materials.noFiles')}</p>}
          {group.files.map((file) => <div key={file.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="outline" size="sm" className="max-w-full" onClick={() => void download(group, file)}>
              <Download className="mr-2 h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span>
            </Button>
            {canManage && <Button variant="ghost" size="sm" disabled={busy} aria-label={`${t('common.remove')} ${file.name}`} onClick={() => void remove(group, file)}>
              <Trash2 className="h-4 w-4" />
            </Button>}
          </div>)}
          {canManage && <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Upload className="h-4 w-4" />{t('common.upload')}
            <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.txt"
              disabled={busy} onChange={(event) => void upload(group, event)} />
          </label>}
        </div>)}
  </section>;
}
