import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Loader2, Paperclip, Play, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { isWithinJoinClickWindow } from '@/lib/attendance';
import { joinOpensAtLabel, useJoinClock } from '@/components/JoinLessonButton';
import { applySchoolTerminology, type SchoolTerminology } from '@/lib/i18n/schoolTerminology';

/**
 * Public homework page for school parents without a Tutlio account. Reached
 * from the signed link in the invitation / reminder emails: the child's
 * lessons, the teacher's materials per lesson, a join link that opens 30 min
 * before the lesson, and a place to hand homework in (uploads land in the
 * lesson's folder where the teacher already looks for files).
 */

type HomeworkFile = {
  name: string;
  folderId: string;
  size: number | null;
  url: string | null;
  submission: boolean;
  own: boolean;
};

type HomeworkSession = {
  id: string;
  start: string;
  end: string | null;
  status: string | null;
  teacher: string;
  group: string;
  subject: string;
  topic: string;
  joinUrl: string | null;
  hasMeetingLink: boolean;
  files: HomeworkFile[];
};

type Payload = {
  ok: boolean;
  now: string;
  school: { name: string };
  student: { id: string; name: string };
  terminology: SchoolTerminology;
  limits: { maxBytes: number; allowedExt: string[] };
  sessions: HomeworkSession[];
};

/** School-only page, Lithuanian copy; base wording is "pamoka", the org flags swap it to "užsiėmimas". */
const COPY = {
  title: 'Namų darbai ir pamokų medžiaga',
  upcoming: 'Artėjančios pamokos',
  past: 'Praėjusios pamokos',
  teacher: 'Mokytojas',
  group: 'Grupė',
  materials: 'Mokytojo medžiaga',
  submissions: 'Pateikti namų darbai',
  noMaterials: 'Mokytojas medžiagos dar neįkėlė.',
  submit: 'Pateikti namų darbą',
  uploading: 'Įkeliama…',
  join: 'Prisijungti prie pamokos',
  joinAt: 'Prisijungti bus galima nuo {time}',
  noLink: 'Prisijungimo nuorodą atsiųsime priminimu prieš pamoką.',
  invalid: 'Nuoroda negalioja arba pasibaigė. Naujausią nuorodą rasite paskutiniame mokyklos laiške.',
  loading: 'Kraunama…',
  none: 'Pamokų dar nėra.',
  hint: 'Šis puslapis veikia be paskyros — nuorodą rasite kiekviename mokyklos laiške apie pamoką.',
  deleteConfirm: 'Pašalinti pateiktą failą?',
  badFile: 'Leidžiami PDF, nuotraukų, Word, Excel ir tekstiniai failai iki 10 MB.',
  uploadFailed: 'Nepavyko įkelti failo. Bandykite dar kartą.',
  child: 'Mokinys',
  remove: 'Pašalinti',
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const label = d.toLocaleDateString('lt-LT', { weekday: 'long', month: 'long', day: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function timeLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

export default function SchoolHomework() {
  const [params] = useSearchParams();
  const studentId = params.get('student') || '';
  const token = params.get('t') || '';
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySession, setBusySession] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const now = useJoinClock();

  const terminology = payload?.terminology ?? { staff: true, activity: true };
  const tx = useCallback(
    (key: keyof typeof COPY, vars?: Record<string, string>) => {
      let text = applySchoolTerminology(COPY[key], 'lt', terminology);
      for (const [k, v] of Object.entries(vars || {})) text = text.replace(`{${k}}`, v);
      return text;
    },
    [terminology],
  );

  const load = useCallback(async (silent = false) => {
    if (!studentId || !token) {
      setError(COPY.invalid);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/school-homework?student=${encodeURIComponent(studentId)}&t=${encodeURIComponent(token)}`);
      const json = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok || !json.ok) {
        setError(res.status === 403 || res.status === 404 ? COPY.invalid : (json.error || COPY.invalid));
        setPayload(null);
      } else {
        setPayload(json);
        setError(null);
      }
    } catch {
      setError(COPY.invalid);
    }
    setLoading(false);
  }, [studentId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (payload) document.title = `${applySchoolTerminology(COPY.title, 'lt', payload.terminology)} – ${payload.school.name || 'Tutlio'}`;
  }, [payload]);

  const { upcoming, past } = useMemo(() => {
    const rows = payload?.sessions ?? [];
    const nowMs = now.getTime();
    return {
      upcoming: rows.filter((s) => Date.parse(s.end || s.start) >= nowMs),
      past: rows.filter((s) => Date.parse(s.end || s.start) < nowMs).reverse(),
    };
  }, [payload, now]);

  async function uploadFor(session: HomeworkSession, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !payload) return;
    const lower = file.name.toLowerCase();
    if (file.size > payload.limits.maxBytes || !payload.limits.allowedExt.some((ext) => lower.endsWith(ext))) {
      setNotice(COPY.badFile);
      return;
    }
    setBusySession(session.id);
    setNotice(null);
    try {
      const prep = await fetch('/api/school-homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: studentId, t: token, action: 'upload-url', sessionId: session.id, fileName: file.name, size: file.size }),
      });
      const json = (await prep.json().catch(() => ({}))) as { ok?: boolean; path?: string; token?: string; error?: string };
      if (!prep.ok || !json.path || !json.token) throw new Error(json.error || COPY.uploadFailed);
      const { error: upErr } = await supabase.storage
        .from('session-files')
        .uploadToSignedUrl(json.path, json.token, file, { contentType: file.type || undefined, upsert: true });
      if (upErr) throw new Error(upErr.message);
      await load(true);
    } catch (err) {
      setNotice((err as Error)?.message || COPY.uploadFailed);
    }
    setBusySession(null);
  }

  async function removeFile(session: HomeworkSession, file: HomeworkFile) {
    if (!window.confirm(tx('deleteConfirm'))) return;
    setBusySession(session.id);
    try {
      const res = await fetch('/api/school-homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student: studentId, t: token, action: 'delete', sessionId: session.id, fileName: file.name }),
      });
      if (!res.ok) throw new Error(COPY.uploadFailed);
      await load(true);
    } catch (err) {
      setNotice((err as Error)?.message || COPY.uploadFailed);
    }
    setBusySession(null);
  }

  const renderSession = (s: HomeworkSession, isUpcoming: boolean) => {
    const materials = s.files.filter((f) => !f.submission);
    const submissions = s.files.filter((f) => f.submission);
    const joinActive = Boolean(s.joinUrl) && isWithinJoinClickWindow(now, s.start, s.end);
    const title = s.group || s.subject || s.topic || tx('child');
    const busy = busySession === s.id;
    return (
      <article key={s.id} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">{dayLabel(s.start)}</p>
            <h3 className="text-lg font-bold text-gray-900 leading-tight">{title}</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              {timeLabel(s.start)}{s.end ? ` – ${timeLabel(s.end)}` : ''}
              {s.teacher ? ` · ${tx('teacher')}: ${s.teacher}` : ''}
            </p>
            {s.topic && s.topic !== title && <p className="text-sm text-gray-500 mt-0.5">{s.topic}</p>}
          </div>
          {isUpcoming && s.hasMeetingLink && (
            joinActive && s.joinUrl ? (
              <a
                href={s.joinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors"
              >
                <Play className="w-4 h-4" /> {tx('join')}
              </a>
            ) : (
              <span className="inline-flex flex-col items-end gap-1">
                <span
                  aria-disabled="true"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-400 cursor-not-allowed"
                >
                  <Play className="w-4 h-4" /> {tx('join')}
                </span>
                <span className="text-[11px] text-gray-500">{tx('joinAt', { time: joinOpensAtLabel(s.start, now) })}</span>
              </span>
            )
          )}
          {isUpcoming && !s.hasMeetingLink && (
            <span className="text-xs text-gray-500 max-w-[14rem] text-right">{tx('noLink')}</span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" /> {tx('materials')}
            </p>
            {materials.length === 0 ? (
              <p className="text-sm text-gray-400">{tx('noMaterials')}</p>
            ) : (
              <ul className="space-y-1.5">
                {materials.map((f) => (
                  <li key={`${f.folderId}/${f.name}`} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="truncate text-gray-800">{f.name}</span>
                    <span className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
                      {formatBytes(f.size)}
                      {f.url && (
                        <a href={f.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800" aria-label={f.name}>
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> {tx('submissions')}
              </p>
              <input
                ref={(el) => { inputs.current[s.id] = el; }}
                type="file"
                className="hidden"
                accept={(payload?.limits.allowedExt || []).join(',')}
                onChange={(e) => void uploadFor(s, e)}
              />
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl h-8 px-3 text-xs"
                disabled={busy}
                onClick={() => inputs.current[s.id]?.click()}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                {busy ? tx('uploading') : tx('submit')}
              </Button>
            </div>
            {submissions.length === 0 ? (
              <p className="text-sm text-gray-400">—</p>
            ) : (
              <ul className="space-y-1.5">
                {submissions.map((f) => (
                  <li key={`${f.folderId}/${f.name}`} className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                    <span className="truncate text-gray-800">{f.name.replace(/^nd-[a-z0-9-]*?-/, '')}</span>
                    <span className="flex items-center gap-2 shrink-0 text-xs text-gray-400">
                      {formatBytes(f.size)}
                      {f.url && (
                        <a href={f.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800" aria-label={f.name}>
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      {f.own && (
                        <button
                          type="button"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => void removeFile(s, f)}
                          aria-label={tx('remove')}
                          disabled={busy}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-emerald-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-6">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-violet-600">{payload?.school.name || 'Tutlio'}</p>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{tx('title')}</h1>
          {payload && <p className="text-sm text-gray-600">{tx('child')}: <strong>{payload.student.name}</strong></p>}
          <p className="text-xs text-gray-500">{tx('hint')}</p>
        </header>

        {notice && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> {tx('loading')}</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-800">{error}</div>
        ) : payload && payload.sessions.length === 0 ? (
          <p className="text-sm text-gray-500">{tx('none')}</p>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-base font-bold text-gray-800">{tx('upcoming')}</h2>
              {upcoming.length === 0 ? <p className="text-sm text-gray-400">—</p> : upcoming.map((s) => renderSession(s, true))}
            </section>
            {past.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-base font-bold text-gray-800">{tx('past')}</h2>
                {past.map((s) => renderSession(s, false))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
