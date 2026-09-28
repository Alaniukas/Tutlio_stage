import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { schoolFamilyConsultationText } from '@/lib/i18n/schoolFamilyConsultationTranslations';

type Note = { id: string; author_user_id: string; body: string; updated_at: string };

export default function ConsultationNotesDialog(props: { consultationId: string | null; onClose: () => void }) {
  const { t, locale } = useTranslation();
  const activeId = useRef(props.consultationId);
  activeId.current = props.consultationId;
  const [notes, setNotes] = useState<Note[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = (key: Parameters<typeof schoolFamilyConsultationText>[1]) => schoolFamilyConsultationText(locale, key);
  const load = useCallback(async (signal?: AbortSignal) => {
    const id = props.consultationId;
    if (!id) return;
    const headers = await authHeaders();
    const res = await fetch(`/api/school-consultation-notes?consultation_id=${encodeURIComponent(props.consultationId)}`, { headers, signal });
    const json = await res.json();
    if (!res.ok) throw new Error(t('common.error'));
    if (signal?.aborted || activeId.current !== id) return;
    setNotes(json.notes || []);
    setCanWrite(json.canWrite === true);
    setDraft((json.notes || []).find((note: Note) => note.author_user_id === json.authorUserId)?.body || '');
  }, [props.consultationId, t]);
  useEffect(() => {
    setNotes([]); setCanWrite(false); setDraft(''); setError(null);
    if (!props.consultationId) return;
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal).catch(() => { if (!controller.signal.aborted) setError(t('common.error')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [props.consultationId, load, t]);
  const save = async () => {
    if (!props.consultationId || !canWrite || !draft.trim()) return;
    const id = props.consultationId;
    setBusy(true); setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/school-consultation-notes', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultation_id: props.consultationId, body: draft }),
      });
      if (!res.ok) throw new Error();
      if (activeId.current === id) await load();
    } catch { if (activeId.current === id) setError(t('common.error')); } finally { setBusy(false); }
  };
  return <Dialog open={Boolean(props.consultationId)} onOpenChange={open => { if (!open) props.onClose(); }}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{copy('notesTitle')}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{copy('notesHelp')}</p>
      {loading ? <p>{t('common.loading')}</p> : <div className="max-h-64 space-y-3 overflow-y-auto">
        {notes.length ? notes.map(note => <p key={note.id} className="whitespace-pre-wrap rounded-lg border p-3 text-sm">{note.body}</p>) : !error && <p className="text-sm text-muted-foreground">{copy('notesEmpty')}</p>}
      </div>}
      {canWrite && <label className="space-y-2 text-sm">{copy('notesBody')}
        <Textarea value={draft} maxLength={10000} rows={6} onChange={event => setDraft(event.target.value)} />
      </label>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {canWrite && <DialogFooter><Button disabled={busy || !draft.trim()} onClick={save}>{copy('notesSave')}</Button></DialogFooter>}
    </DialogContent>
  </Dialog>;
}
