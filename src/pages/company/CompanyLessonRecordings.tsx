import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeaders } from '@/lib/apiHelpers';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { useTranslation } from '@/lib/i18n';

type Recording = {
  id: string;
  drive_file_id: string;
  drive_file_name: string | null;
  drive_web_view_link: string | null;
  session_id: string | null;
  recorded_at: string | null;
  groups?: { group_id: string }[];
};

type Group = { id: string; name: string };

export default function CompanyLessonRecordings() {
  const { t } = useTranslation();
  const { hasFeature } = useOrgFeatures();
  const [rows, setRows] = useState<Recording[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [fileId, setFileId] = useState('');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const headers = await authHeaders();
    const [recRes, gRes] = await Promise.all([
      fetch('/api/school-lesson-recordings', { headers }),
      fetch('/api/school-class-groups', { headers }),
    ]);
    const rec = await recRes.json();
    const g = await gRes.json();
    if (recRes.ok) setRows(rec.recordings || []);
    if (gRes.ok) setGroups(g.groups || []);
  };

  useEffect(() => { void load(); }, []);

  if (!hasFeature('school_lesson_recordings')) {
    return <p className="text-sm text-gray-500">{t('school.recordings.disabled')}</p>;
  }

  const ingest = async () => {
    setBusy(true);
    const headers = await authHeaders();
    await fetch('/api/school-lesson-recordings', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        drive_file_id: fileId,
        name,
        drive_web_view_link: link,
        created_at: new Date().toISOString(),
      }),
    });
    setFileId('');
    setName('');
    setLink('');
    await load();
    setBusy(false);
  };

  const assignGroups = async (recordingId: string, groupIds: string[]) => {
    const headers = await authHeaders();
    await fetch('/api/school-lesson-recordings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ id: recordingId, group_ids: groupIds }),
    });
    await load();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('school.recordings.title')}</h1>
      <p className="text-sm text-gray-600">{t('school.recordings.lead')}</p>
      <p className="text-sm text-gray-600">
        Dabar: rankinis įkėlimas (Drive failo ID / nuoroda). Mokytojas ar admin pažymi, <strong>kurios grupės</strong> mato įrašą —
        tada grupės mokiniai / tėvai mato per RLS. Automatinis Google Meet → Drive sync per API įmanomas, bet reikia Workspace OAuth
        (Drive + Meet); to dar neprijungėme.
      </p>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold">{t('school.recordings.ingest')}</h2>
        <div className="grid md:grid-cols-3 gap-2">
          <div>
            <Label>Drive file ID</Label>
            <Input value={fileId} onChange={(e) => setFileId(e.target.value)} />
          </div>
          <div>
            <Label>{t('school.recordings.fileName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>URL</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        </div>
        <Button disabled={busy || !fileId} onClick={ingest}>{t('school.recordings.add')}</Button>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const selected = new Set((r.groups || []).map((g) => g.group_id));
          return (
            <div key={r.id} className="rounded-xl border bg-white p-4 space-y-2">
              <div className="font-medium">{r.drive_file_name || r.drive_file_id}</div>
              <div className="text-xs text-gray-500">{r.recorded_at || '—'} · session {r.session_id || t('school.recordings.unmatched')}</div>
              {r.drive_web_view_link && (
                <a className="text-sm text-indigo-600" href={r.drive_web_view_link} target="_blank" rel="noreferrer">Drive</a>
              )}
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = selected.has(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'}`}
                      onClick={() => {
                        const next = new Set(selected);
                        if (on) next.delete(g.id);
                        else next.add(g.id);
                        void assignGroups(r.id, [...next]);
                      }}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
