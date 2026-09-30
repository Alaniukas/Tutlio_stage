import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  Search,
  UserRound,
} from 'lucide-react';
import type {
  InAppSupportCategory,
  InAppSupportEnvironment,
  InAppSupportImpact,
  InAppSupportPriority,
  InAppSupportStatus,
  InAppSupportTranscriptMessage,
} from '@/lib/inAppSupport';
import { copyTextToClipboard } from '@/lib/copyToClipboard';
import { cn } from '@/lib/utils';

type AdminAttachment = {
  path: string;
  name: string;
  type: string;
  size: number;
  signedUrl: string | null;
};

type SupportLogEvent = {
  log_id: string;
  occurred_at: string;
  level: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
  message: string | null;
};

export type SupportRequest = {
  id: string;
  request_id: string;
  reporter_user_id: string;
  reporter_name: string | null;
  reporter_email: string;
  reporter_role: string;
  organization_id: string | null;
  organization_name: string | null;
  category: InAppSupportCategory;
  title: string;
  context: string;
  steps: string[];
  expected_outcome: string;
  actual_outcome: string | null;
  impact: InAppSupportImpact;
  impact_details: string;
  page: string;
  locale: string;
  environment: InAppSupportEnvironment;
  transcript: InAppSupportTranscriptMessage[];
  attachments: AdminAttachment[];
  coding_agent_prompt: string | null;
  completion_notified_at: string | null;
  completion_notification_email_id: string | null;
  status: InAppSupportStatus;
  priority: InAppSupportPriority;
  target_date?: string | null;
  status_updated_at?: string;
  status_notified_at?: string | null;
  status_notification_error?: string | null;
  trello_card_id?: string | null;
  trello_card_url?: string | null;
  trello_synced_at?: string | null;
  trello_sync_error?: string | null;
  legacy_status?: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS: Record<InAppSupportStatus, { label: string; className: string }> = {
  registered: { label: 'Užregistruota', className: 'bg-sky-500/15 text-sky-300 border-sky-500/25' },
  in_progress: { label: 'Vykdoma', className: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
  resolved: { label: 'Išspręsta', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
};

function statusLabel(status: InAppSupportStatus, category: 'all' | InAppSupportCategory): string {
  if (status === 'resolved' && category === 'feature') return 'Įgyvendinta';
  if (status === 'resolved' && category === 'all') return 'Išspręsta / įgyvendinta';
  return STATUS[status].label;
}

const PRIORITY: Record<InAppSupportPriority, string> = {
  untriaged: 'Neįvertintas',
  low: 'Žemas',
  medium: 'Vidutinis',
  high: 'Aukštas',
  urgent: 'Skubus',
};

const IMPACT: Record<InAppSupportImpact, string> = {
  blocking: 'Blokuoja darbą',
  high: 'Didelis',
  medium: 'Vidutinis',
  low: 'Mažas',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('lt-LT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function dateTimeLocal(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function reference(id: string): string {
  return `SUP-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export default function AdminSupportRequestsPanel({
  adminSecret,
  demoRequests,
}: {
  adminSecret: string;
  demoRequests?: SupportRequest[];
}) {
  const demoMode = Boolean(demoRequests);
  const [requests, setRequests] = useState<SupportRequest[]>(demoRequests || []);
  const [selectedId, setSelectedId] = useState<string | null>(demoRequests?.[0]?.id || null);
  const [loading, setLoading] = useState(!demoRequests);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InAppSupportStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | InAppSupportCategory>('all');
  const [editStatus, setEditStatus] = useState<InAppSupportStatus>('registered');
  const [editPriority, setEditPriority] = useState<InAppSupportPriority>('untriaged');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [logEvents, setLogEvents] = useState<SupportLogEvent[] | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const load = async () => {
    if (demoRequests) {
      setRequests(demoRequests);
      setSelectedId((current) => current || demoRequests[0]?.id || null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-support-requests?limit=250', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const result = await response.json().catch(() => null) as { requests?: SupportRequest[]; error?: string } | null;
      if (!response.ok) throw new Error(result?.error || 'Nepavyko gauti pranešimų');
      const next = result?.requests || [];
      setRequests(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nepavyko gauti pranešimų');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (demoRequests) return;
    void load();
  // Admin secret does not change after the panel unlocks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSecret, demoRequests]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!needle) return true;
      return [item.title, item.reporter_name, item.reporter_email, item.organization_name, item.context, reference(item.id)]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [requests, query, statusFilter, categoryFilter]);

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    setSelectedId(selected?.id || null);
    setShowTranscript(false);
    setPromptCopied(false);
    setLogEvents(null);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    setEditStatus(selected.status);
    setEditPriority(selected.priority);
    setEditTargetDate(dateTimeLocal(selected.target_date));
    setInternalNote(selected.internal_note || '');
  }, [selected?.id, selected?.status, selected?.priority, selected?.target_date, selected?.internal_note, selected?.status_updated_at]);

  const counts = useMemo(() => ({
    open: requests.filter((item) => item.status !== 'resolved').length,
    bugs: requests.filter((item) => item.category === 'bug' && item.status !== 'resolved').length,
    features: requests.filter((item) => item.category === 'feature' && item.status !== 'resolved').length,
    resolved: requests.filter((item) => item.status === 'resolved').length,
  }), [requests]);

  const save = async () => {
    if (!selected || saving) return;
    if (editStatus === 'in_progress' && !editTargetDate) {
      setError('Būsenai „Vykdoma“ būtina nurodyti terminą.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const targetDate = editStatus !== 'in_progress' ? null
      : editTargetDate === dateTimeLocal(selected.target_date || null)
        ? selected.target_date || null
        : editTargetDate ? new Date(editTargetDate).toISOString() : null;
    try {
      if (demoMode) {
        setRequests((current) => current.map((item) => item.id === selected.id ? {
          ...item,
          status: editStatus,
          priority: editPriority,
          target_date: targetDate,
          status_updated_at: new Date().toISOString(),
          internal_note: internalNote || null,
          updated_at: new Date().toISOString(),
        } : item));
        return;
      }
      const response = await fetch('/api/admin-support-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify({
          id: selected.id,
          status: editStatus,
          priority: editPriority,
          expectedStatusUpdatedAt: selected.status_updated_at,
          expectedPriority: selected.priority,
          targetDate,
          internalNote,
        }),
      });
      const result = await response.json().catch(() => null) as { request?: SupportRequest; error?: string; warnings?: string[] } | null;
      if (!response.ok || !result?.request) throw new Error(result?.error || 'Nepavyko išsaugoti');
      setRequests((current) => current.map((item) => (
        item.id === selected.id ? { ...item, ...result.request, attachments: item.attachments } : item
      )));
      if (result.warnings?.length) setNotice('Išsaugota. ' + result.warnings.join(' '));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nepavyko išsaugoti');
    } finally {
      setSaving(false);
    }
  };

  const retryDelivery = async (action: 'notify_status' | 'sync_trello') => {
    if (!selected || demoMode) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin-support-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify({ id: selected.id, action }),
      });
      const result = await response.json().catch(() => null) as { request?: SupportRequest; error?: string } | null;
      if (!response.ok || !result?.request) throw new Error(result?.error || 'Nepavyko pakartoti');
      setRequests((current) => current.map((item) => item.id === selected.id
        ? { ...item, ...result.request, attachments: item.attachments } : item));
      setNotice(action === 'notify_status' ? 'Pranešimas naudotojui išsiųstas.' : 'Trello kortelė sinchronizuota.');
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Nepavyko pakartoti');
    } finally {
      setSaving(false);
    }
  };

  const loadLogs = async () => {
    if (!selected || demoMode || loadingLogs) return;
    setLoadingLogs(true);
    setError('');
    try {
      const response = await fetch('/api/admin-support-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify({ id: selected.id, action: 'get_logs' }),
      });
      const result = await response.json().catch(() => null) as { logs?: SupportLogEvent[]; error?: string } | null;
      if (!response.ok) throw new Error(result?.error || 'Nepavyko įkelti Vercel logų');
      setLogEvents(result?.logs || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nepavyko įkelti Vercel logų');
    } finally {
      setLoadingLogs(false);
    }
  };

  const copyCodingAgentPrompt = async () => {
    if (!selected?.coding_agent_prompt) return;
    setPromptCopied(await copyTextToClipboard(selected.coding_agent_prompt));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Pagalbos užklausos</h2>
          <p className="mt-1 text-sm text-slate-400">Struktūruoti klaidų pranešimai ir funkcijų pasiūlymai iš platformos.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Atnaujinti
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={Clock3} label="Atviros" value={counts.open} color="text-sky-300 bg-sky-500/10" />
        <Metric icon={Bug} label="Aktyvios klaidos" value={counts.bugs} color="text-rose-300 bg-rose-500/10" />
        <Metric icon={Lightbulb} label="Funkcijų idėjos" value={counts.features} color="text-amber-300 bg-amber-500/10" />
        <Metric icon={CheckCircle2} label="Užbaigtos" value={counts.resolved} color="text-emerald-300 bg-emerald-500/10" />
      </div>

      <div role="group" aria-label="Užklausų tipas" className="flex flex-wrap gap-2">
        {([
          ['all', 'Visos užklausos'],
          ['bug', 'Klaidos'],
          ['feature', 'Funkcijos'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={categoryFilter === value}
            onClick={() => setCategoryFilter(value)}
            className={cn('min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors', categoryFilter === value
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input aria-label="Ieškoti užklausų" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ieškoti pagal pavadinimą, žmogų, įmonę…" className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-500" />
        </label>
        <select aria-label="Filtruoti pagal būseną" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-11 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-indigo-500">
          <option value="all">Visos būsenos</option>
          {Object.keys(STATUS).map((value) => <option key={value} value={value}>{statusLabel(value as InAppSupportStatus, categoryFilter)}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {notice && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{notice}</div>}

      <div className="grid min-h-[640px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] lg:grid-cols-[330px_minmax(0,1fr)]">
        <div role="region" aria-label="Užklausų sąrašas" className="max-h-[720px] overflow-y-auto border-b border-white/10 lg:border-b-0 lg:border-r">
          {loading ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Kraunama…</div>
          ) : filtered.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center px-6 text-center text-sm text-slate-500">
              <MessageSquareText className="mb-3 h-8 w-8" /> Užklausų nerasta
            </div>
          ) : filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={cn(
                'w-full border-b border-white/5 px-4 py-4 text-left transition hover:bg-white/5',
                selected?.id === item.id && 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/25',
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', item.category === 'bug' ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-300')}>
                  {item.category === 'bug' ? <Bug className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-bold leading-5 text-white">{item.title}</span>
                  <span className="mt-1.5 block truncate text-xs text-slate-400">{item.reporter_name || item.reporter_email}</span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <StatusBadge status={item.status} category={item.category} />
                    <span className="text-[10px] text-slate-500">{formatDate(item.created_at)}</span>
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="max-h-[720px] overflow-y-auto">
          {!selected ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-slate-500"><MessageSquareText className="mb-3 h-9 w-9" /> Pasirinkite užklausą</div>
          ) : (
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold', selected.category === 'bug' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300')}>
                      {selected.category === 'bug' ? <Bug className="h-3.5 w-3.5" /> : <Lightbulb className="h-3.5 w-3.5" />}
                      {selected.category === 'bug' ? 'Klaida' : 'Funkcijos pasiūlymas'}
                    </span>
                    <StatusBadge status={selected.status} category={selected.category} />
                    <span className="font-mono text-[11px] text-slate-500">{reference(selected.id)}</span>
                  </div>
                  <h3 className="mt-3 text-xl font-black leading-tight text-white">{selected.title}</h3>
                  <p className="mt-2 text-xs text-slate-500">Gauta {formatDate(selected.created_at)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                  <p className="flex items-center gap-1.5 font-bold text-white"><UserRound className="h-3.5 w-3.5 text-indigo-300" />{selected.reporter_name || 'Naudotojas'}</p>
                  <a href={`mailto:${selected.reporter_email}`} className="mt-1 block text-indigo-300 hover:underline">{selected.reporter_email}</a>
                  <p className="mt-1 text-slate-500">{selected.organization_name || selected.reporter_role}</p>
                </div>
              </div>

              {selected.environment?.reportCompleteness === 'user_confirmed_incomplete' && (
                <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  <strong>Pateikta naudotojo prašymu.</strong> Dalis struktūrizuotos informacijos nepateikta, todėl prieš nustatant prioritetą peržiūrėkite visą pokalbį ir ekrano nuotraukas.
                </div>
              )}

              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-5">
                  <DetailSection label="Problema ir kontekstas" value={selected.context} />
                  <div>
                    <DetailLabel>{selected.category === 'bug' ? 'Veiksmai klaidai pakartoti' : 'Norimas veikimo procesas'}</DetailLabel>
                    <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
                      {(selected.steps || []).map((step, index) => <li key={`${index}-${step}`} className="flex gap-2"><span className="font-bold text-indigo-400">{index + 1}.</span><span>{step}</span></li>)}
                    </ol>
                  </div>
                  <DetailSection label="Tikėtinas rezultatas" value={selected.expected_outcome} />
                  {selected.actual_outcome && <DetailSection label="Faktinis rezultatas" value={selected.actual_outcome} />}
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <DetailLabel>Poveikis: {selected.environment?.reportCompleteness === 'user_confirmed_incomplete' ? 'Nenurodytas, reikia įvertinti' : IMPACT[selected.impact]}</DetailLabel>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.impact_details}</p>
                  </div>

                  <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <DetailLabel>DI programavimo agento promptas</DetailLabel>
                      <button
                        type="button"
                        onClick={() => void copyCodingAgentPrompt()}
                        disabled={!selected.coding_agent_prompt}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-400/20 bg-indigo-400/10 px-2.5 text-[11px] font-bold text-indigo-200 hover:bg-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {promptCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {promptCopied ? 'Nukopijuota' : 'Kopijuoti'}
                      </button>
                    </div>
                    {selected.coding_agent_prompt ? (
                      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">{selected.coding_agent_prompt}</pre>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-slate-500">Ši užklausa sukurta prieš įdiegiant automatinius promptus.</p>
                    )}
                  </div>

                  {selected.attachments?.length > 0 && (
                    <div>
                      <DetailLabel>Ekrano nuotraukos ({selected.attachments.length})</DetailLabel>
                      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {selected.attachments.map((attachment) => (
                          <a key={attachment.path} href={attachment.signedUrl || undefined} target="_blank" rel="noreferrer" className={cn('group relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-slate-900', !attachment.signedUrl && 'pointer-events-none')}>
                            {attachment.signedUrl ? <img src={attachment.signedUrl} alt={attachment.name} className="h-full w-full object-cover transition group-hover:scale-105" /> : <ImageIcon className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-slate-600" />}
                            <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/90 to-transparent px-2 pb-2 pt-5 text-[10px] font-semibold text-white"><span className="truncate">{attachment.name}</span><ExternalLink className="ml-auto h-3 w-3 shrink-0" /></span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <button type="button" onClick={() => setShowTranscript((current) => !current)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-bold text-slate-200 hover:bg-white/5">
                      <span className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-indigo-300" />Pokalbio išklotinė ({selected.transcript?.length || 0})</span>
                      <span className="text-xs text-slate-500">{showTranscript ? 'Slėpti' : 'Rodyti'}</span>
                    </button>
                    {showTranscript && (
                      <div className="mt-2 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-3">
                        {(selected.transcript || []).map((message, index) => (
                          <div key={`${message.role}-${index}`} className={cn('rounded-lg px-3 py-2 text-xs leading-5', message.role === 'user' ? 'ml-8 bg-indigo-500/15 text-indigo-100' : 'mr-8 bg-white/5 text-slate-300')}>
                            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{message.role === 'user' ? 'Naudotojas' : 'Agentas'}</p>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <DetailLabel>Tvarkymas</DetailLabel>
                    <label className="mt-3 block text-xs text-slate-400">Būsena
                      <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as InAppSupportStatus)} className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 text-sm text-white outline-none focus:border-indigo-500">
                        {Object.keys(STATUS).map((value) => <option key={value} value={value}>{statusLabel(value as InAppSupportStatus, selected.category)}</option>)}
                      </select>
                    </label>
                    <label className="mt-3 block text-xs text-slate-400">Prioritetas
                      <select value={editPriority} onChange={(event) => setEditPriority(event.target.value as InAppSupportPriority)} className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 text-sm text-white outline-none focus:border-indigo-500">
                        {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="mt-3 block text-xs text-slate-400">Terminas {editStatus === 'in_progress' ? '(privalomas)' : ''}
                      <input type="datetime-local" value={editStatus === 'in_progress' ? editTargetDate : ''} onChange={(event) => setEditTargetDate(event.target.value)} disabled={editStatus !== 'in_progress'} className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 text-sm text-white outline-none focus:border-indigo-500 disabled:opacity-50" />
                    </label>
                    <label className="mt-3 block text-xs text-slate-400">Vidinė pastaba
                      <textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value.slice(0, 10_000))} rows={5} placeholder="Sprendimas, nuoroda į užduotį, atsakingas žmogus…" className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm leading-5 text-white outline-none placeholder:text-slate-600 focus:border-indigo-500" />
                    </label>
                    <button type="button" onClick={() => void save()} disabled={saving} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Išsaugoti
                    </button>

                    <div className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-400">
                      <p className="font-bold text-slate-200">Trello backlog</p>
                      {selected.trello_card_url ? <a href={selected.trello_card_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-indigo-300 hover:underline">Atidaryti kortelę <ExternalLink className="h-3 w-3" /></a> : <p className="mt-2">Kortelė dar nesukurta.</p>}
                      {selected.trello_sync_error && <p className="mt-2 text-amber-300">{selected.trello_sync_error}</p>}
                      {!demoMode && (!selected.trello_card_id || selected.trello_sync_error) && <button type="button" onClick={() => void retryDelivery('sync_trello')} disabled={saving} className="mt-2 rounded-lg border border-white/10 px-3 py-2 font-semibold text-white hover:bg-white/10 disabled:opacity-50">Pakartoti sinchronizavimą</button>}
                    </div>

                    <div className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-400">
                      <p className="font-bold text-slate-200">Pranešimas naudotojui</p>
                      {selected.status_notified_at && <p className="mt-2">Išsiųstas {formatDate(selected.status_notified_at)}</p>}
                      {selected.status_notification_error && <p className="mt-2 text-amber-300">{selected.status_notification_error}</p>}
                      {!demoMode && (selected.status_notification_error || !selected.status_notified_at) && <button type="button" onClick={() => void retryDelivery('notify_status')} disabled={saving} className="mt-2 rounded-lg border border-white/10 px-3 py-2 font-semibold text-white hover:bg-white/10 disabled:opacity-50">{selected.status_notification_error ? 'Pakartoti pranešimą' : 'Išsiųsti būseną'}</button>}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-slate-400">
                    <DetailLabel>Techninis kontekstas</DetailLabel>
                    <dl className="mt-3 space-y-2 break-words">
                      <div><dt className="text-slate-600">Puslapis</dt><dd className="mt-0.5 text-slate-300">{selected.page}</dd></div>
                      <div><dt className="text-slate-600">Ekranas</dt><dd className="mt-0.5 text-slate-300">{selected.environment?.viewport || '—'}</dd></div>
                      <div><dt className="text-slate-600">Kalba</dt><dd className="mt-0.5 text-slate-300">{selected.locale} / {selected.environment?.language || '—'}</dd></div>
                      <div><dt className="text-slate-600">Platforma</dt><dd className="mt-0.5 text-slate-300">{selected.environment?.platform || '—'}</dd></div>
                      <div><dt className="text-slate-600">Naršyklė</dt><dd className="mt-0.5 line-clamp-4 text-slate-300">{selected.environment?.userAgent || '—'}</dd></div>
                      <div><dt className="text-slate-600">Vercel deployment</dt><dd className="mt-0.5 text-slate-300">{selected.environment?.deploymentId || '—'}</dd></div>
                    </dl>
                    {Array.isArray(selected.environment?.diagnostics) && selected.environment.diagnostics.length > 0 && (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <p className="font-bold text-slate-300">Veiksmų eiga</p>
                        <ol className="mt-2 space-y-1.5">
                          {selected.environment.diagnostics.map((event, index) => (
                            <li key={`${event.at}-${index}`} className="break-words text-slate-400">
                              {event.at ? formatDate(event.at) : ''} · {event.type === 'api_failure'
                                ? `${event.method} ${event.endpoint} → ${event.status}${event.vercelId ? ` · Vercel ${event.vercelId}` : ''}`
                                : event.type === 'click'
                                  ? `Paspausta ${event.action || event.control} · ${event.path}`
                                  : `Atidaryta ${event.path}`}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {!demoMode && (
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <button type="button" onClick={() => void loadLogs()} disabled={loadingLogs} className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50">
                          {loadingLogs ? 'Įkeliama…' : 'Peržiūrėti susietus Vercel logus'}
                        </button>
                        {logEvents && (logEvents.length === 0
                          ? <p className="mt-2">Susietų klaidų logų nerasta.</p>
                          : <ol className="mt-2 space-y-2">{logEvents.map((log) => <li key={log.log_id} className="rounded-lg bg-slate-950/60 p-2 text-slate-300"><strong>{formatDate(log.occurred_at)} · {log.level.toUpperCase()}</strong><br />{log.method} {log.path} · {log.status_code || '—'}{log.message && <p className="mt-1 text-slate-400">{log.message}</p>}</li>)}</ol>)}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, color }: { icon: typeof Clock3; label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className={cn('grid h-9 w-9 place-items-center rounded-xl', color)}><Icon className="h-4 w-4" /></div>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-400">{label}</p>
    </div>
  );
}

function StatusBadge({ status, category }: { status: InAppSupportStatus; category: InAppSupportCategory }) {
  const meta = STATUS[status] || STATUS.registered;
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold', meta.className)}>{statusLabel(status, category)}</span>;
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{children}</p>;
}

function DetailSection({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <DetailLabel>{label}</DetailLabel>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{value}</p>
    </div>
  );
}
