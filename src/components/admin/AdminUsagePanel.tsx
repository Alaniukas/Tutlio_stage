import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Search, AlertTriangle, Activity } from 'lucide-react';
import { TELEMETRY_MODULES, enrichTelemetryReport, type TelemetryReport, type TelemetryOrgReport } from '@/lib/orgAdminTelemetryShared';

const modules: Record<string, string> = { dashboard: 'Apžvalga', students: 'Mokiniai', tutors: 'Korepetitoriai', schedule: 'Kalendorius', sessions: 'Pamokos', finance: 'Finansai', payments: 'Mokėjimai', contracts: 'Sutartys', groups: 'Grupės', messages: 'Žinutės', stats: 'Statistika', settings: 'Nustatymai', team: 'Komanda', recordings: 'Įrašai', support: 'Pagalba', instructions: 'Instrukcijos', consultations: 'Konsultacijos', 'staff-documents': 'Darbuotojų dokumentai', 'dynamic-pricing': 'Kainodara' };
const actions: Record<string, string> = { 'student.create': 'Pridėti mokinį', 'student.update': 'Atnaujinti mokinį', 'student.delete': 'Pašalinti mokinį', 'tutor.invite': 'Pakviesti korepetitorių', 'session.create': 'Sukurti pamoką', 'session.update': 'Atnaujinti pamoką', 'session.reschedule': 'Perkelti pamoką', 'session.cancel': 'Atšaukti pamoką', 'session.delete': 'Pašalinti pamoką', 'contract.create': 'Sukurti sutartį', 'contract.send': 'Siųsti sutartį', 'invoice.create': 'Išrašyti sąskaitą', 'invoice.send': 'Siųsti sąskaitą', 'group.create': 'Sukurti grupę', 'group.update': 'Atnaujinti grupę', 'group.delete': 'Pašalinti grupę', 'settings.update': 'Atnaujinti nustatymus', export: 'Eksportuoti' };
const reasonLabels: Record<string, string> = { inactive: '5+ dienos be aktyvumo', repeated_errors: 'Kartojasi ta pati klaida', usage_drop: 'Sumažėjo naudojimas', onboarding: 'Laukia pirmieji veiksmai' };
const number = (value: number | undefined) => (value || 0).toLocaleString('lt-LT');
function date(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Duomenų nėra';
  return new Intl.DateTimeFormat('lt-LT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Vilnius' }).format(new Date(value));
}
function Signals({ org }: { org: TelemetryOrgReport }) {
  if (!org.coverage_since) return <span className="text-xs text-slate-400">Duomenų nepakanka</span>;
  if (!org.reasons?.length) return <span className="text-xs text-emerald-400">Be pažymėtų problemų{org.is_demo ? ' · Demo' : ''}</span>;
  return <div className="flex flex-wrap gap-1">{org.reasons.map(reason => <span key={reason} className="rounded-lg bg-amber-400/10 px-2 py-1 text-xs text-amber-300">{reasonLabels[reason]}{reason === 'usage_drop' ? ` (${org.usage_change_percent} %)` : ''}</span>)}</div>;
}
export default function AdminUsagePanel({ adminSecret, preview }: { adminSecret: string; preview?: TelemetryReport }) {
  const [report, setReport] = useState<TelemetryReport | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeDemo, setIncludeDemo] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setOffset(0); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (preview) {
      const enriched = enrichTelemetryReport(preview);
      setReport({ ...enriched, organizations: enriched.organizations.filter(org => selected ? org.id === selected : (includeDemo || !org.is_demo) && org.name.toLowerCase().includes(search.toLowerCase())) });
      setLoading(false); return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    setLoading(true); setError(''); setReport(null);
    const query = new URLSearchParams({ search, includeDemo: String(includeDemo), offset: String(selected ? 0 : offset), limit: '25' });
    if (selected) query.set('organization', selected);
    void (async () => {
      try {
        const response = await fetch(`/api/admin-usage?${query}`, { headers: { 'x-admin-secret': adminSecret }, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Nepavyko įkelti naudojimo duomenų.');
        if (!controller.signal.aborted) setReport(data);
      } catch {
        if (!cancelled) setError(timedOut ? 'Duomenų užklausa užtruko. Bandykite dar kartą.' : 'Nepavyko įkelti naudojimo duomenų. Patikrinkite API ir analitikos migraciją.');
      } finally { clearTimeout(timer); if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [adminSecret, selected, search, includeDemo, offset, revision, preview]);
  const org = selected ? report?.organizations[0] : null;
  return <div className="space-y-5 text-slate-200">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold flex items-center gap-2"><Activity className="h-5 w-5 text-indigo-400" />Klientų naudojimas</h2><p className="mt-1 text-sm text-slate-400">Administratorių veikla ir problemos, kurias komanda gali peržiūrėti prieš kreipdamasi į klientą.</p></div>
      <button type="button" aria-label="Atnaujinti naudojimo duomenis" disabled={loading} onClick={() => setRevision(value => value + 1)} className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    {selected ? <button type="button" onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-indigo-300"><ArrowLeft className="h-4 w-4" />Visos organizacijos</button> : <div className="flex flex-wrap items-center gap-4">
      <label className="flex max-w-md flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3"><Search className="h-4 w-4 text-slate-400" /><input aria-label="Ieškoti organizacijos" placeholder="Ieškoti organizacijos..." value={searchInput} onChange={event => setSearchInput(event.target.value)} className="w-full bg-transparent py-2 text-sm outline-none" /></label>
      <label className="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" checked={includeDemo} onChange={event => { setIncludeDemo(event.target.checked); setOffset(0); }} />Įtraukti Demo / QA</label>
    </div>}
    {error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">{error}</div>}
    {loading && <p role="status" className="py-8 text-center text-sm text-slate-400">Kraunama naudojimo analitika...</p>}
    {report && <>
      <p className="text-xs text-slate-500">Sekimo pradžia: {date(report.started_at)} · Paskutiniai gauti duomenys: {date(report.last_ingested_at)} · Valymas: {date(report.last_cleanup_at)}. Dienų suvestinės skaičiuojamos UTC.</p>
      {!report.last_ingested_at && <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">Dar negauta adminų veiklos. Ankstesnis naudojimas nebuvo sekamas; tušti duomenys nėra neaktyvumo įrodymas.</div>}
      {!selected && <>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/5 text-xs text-slate-400"><tr>{['Organizacija', 'Paskutinis aktyvumas', 'Paskutinis sėkmingas veiksmas', 'Aktyvios dienos 7 / 30', 'Klaidos per 7 d.', 'Reikia dėmesio'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>
            {report.organizations.map(row => <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.03]"><td className="p-3"><button type="button" onClick={() => setSelected(row.id)} className="font-medium text-indigo-300 hover:underline">{row.name}</button><p className="mt-1 text-xs text-slate-500">{row.entity_type === 'school' ? 'Mokykla' : 'Įmonė'} · {row.admins.filter(admin => admin.status === 'active').length} admin. · {row.status}</p></td><td className="p-3 whitespace-nowrap">{date(row.last_active_at)}</td><td className="p-3"><span>{date(row.last_action_at)}</span></td><td className="p-3 tabular-nums">{number(row.active_days_7)} / {number(row.active_days_30)}</td><td className={`p-3 tabular-nums ${row.errors_7 ? 'text-amber-300' : 'text-slate-500'}`}>{number(row.errors_7)}</td><td className="p-3"><Signals org={row} /></td></tr>)}
            {!report.organizations.length && <tr><td colSpan={6} className="p-8 text-center text-slate-400">Organizacijų nerasta.</td></tr>}
          </tbody></table>
        </div>
        <div className="flex items-center justify-between text-sm text-slate-400"><span>{report.total ? `${offset + 1}-${Math.min(offset + 25, report.total)} iš ${report.total}` : '0 organizacijų'}</span><div className="flex gap-3"><button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 25))} className="disabled:opacity-30">Ankstesnis</button><button type="button" disabled={offset + 25 >= report.total || loading} onClick={() => setOffset(value => value + 25)} className="disabled:opacity-30">Kitas</button></div></div>
      </>}
      {org && <>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="text-xl font-semibold">{org.name}</h3><div className="mt-2"><Signals org={org} /></div><p className="mt-3 text-sm text-slate-400">Aktyvios dienos: {org.active_days_7} / 7 ir {org.active_days_30} / 30. {org.usage_change_percent === null ? 'Savaitiniam palyginimui dar nepakanka duomenų.' : `Sėkmingų veiksmų pokytis per dvi pilnas savaites: ${org.usage_change_percent} %.`}</p></div>
        <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/5 text-xs text-slate-400"><tr>{['Administratorius', 'Paskutinis prisijungimas', 'Paskutinis aktyvumas', 'Paskutinis veiksmas', 'Dienos 7 / 30', 'Veiksmai 7 / 30'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{org.admins.map(admin => <tr key={admin.user_id} className="border-t border-white/5"><td className="p-3"><span className="font-medium">{admin.full_name || 'Administratorius'}</span><p className="text-xs text-slate-500">{admin.role} · {admin.status}</p>{admin.email && <a href={`mailto:${admin.email}`} className="text-xs text-indigo-300">{admin.email}</a>}</td><td className="p-3">{date(admin.last_login_at)}</td><td className="p-3">{date(admin.last_active_at)}<p className="text-xs text-slate-500">{modules[admin.last_module || ''] || ''}</p></td><td className="p-3">{actions[admin.last_action || ''] || 'Duomenų nėra'}<p className="text-xs text-slate-500">{admin.last_action_at ? date(admin.last_action_at) : ''}</p></td><td className="p-3">{admin.active_days_7} / {admin.active_days_30}</td><td className="p-3">{number(admin.actions_7)} / {number(admin.actions_30)}</td></tr>)}</tbody></table></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 p-4"><h3 className="mb-3 font-medium">Moduliai per 30 dienų</h3><div className="grid gap-2 sm:grid-cols-2">{TELEMETRY_MODULES.filter(module => org.expected_modules?.includes(module) || org.modules_30[module]).map(module => <div key={module} className="rounded-lg bg-white/5 p-2 text-sm"><span>{modules[module]}</span><span className="float-right text-slate-400">{number(org.modules_30[module])}</span><p className="mt-1 text-xs text-slate-500">{date(org.admins.map(admin => admin.module_last_used?.[module]).filter(Boolean).sort().at(-1))}</p></div>)}</div></div>
          <div className="rounded-2xl border border-white/10 p-4"><h3 className="mb-3 font-medium">Pirmieji svarbūs veiksmai</h3><p className="mb-3 text-xs text-slate-500">Pagal įjungtas funkcijas ir dabartinės komandos teises.</p>{org.missing_milestones?.length ? <ul className="space-y-2 text-sm text-amber-300">{org.missing_milestones.map(action => <li key={action}>{actions[action]} · dar neužfiksuota</li>)}</ul> : <p className="text-sm text-emerald-400">Visi numatyti pirmieji veiksmai užfiksuoti.</p>}<div className="mt-4 space-y-1 text-xs text-slate-400">{Object.keys(actions).flatMap(action => { const first = org.admins.map(admin => admin.first_actions?.[action]).filter(Boolean).sort()[0]; return first ? [<p key={action}>{actions[action]} · {date(first)}</p>] : []; })}</div></div>
        </div>
        <div className="rounded-2xl border border-white/10 p-4"><h3 className="mb-3 font-medium">Sėkmingi ir nepavykę veiksmai per 30 dienų</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.keys(actions).filter(action => org.actions_30[`${action}.success`] || org.actions_30[`${action}.failure`]).map(action => <div key={action} className="rounded-lg bg-white/5 p-3 text-sm">{actions[action]}<p className="mt-1 text-xs text-slate-400">Sėkmingi: {number(org.actions_30[`${action}.success`])} · Nepavykę: {number(org.actions_30[`${action}.failure`])}</p></div>)}</div>{!Object.keys(org.actions_30).length && <p className="text-sm text-slate-500">Svarbių veiksmų dar neužfiksuota.</p>}</div>
        <div className="rounded-2xl border border-white/10 p-4"><h3 className="mb-3 font-medium">Veikla per 30 dienų</h3><div className="flex h-28 items-end gap-1" role="img" aria-label="Sėkmingų veiksmų per dieną grafikas">{report.daily.map(day => <div key={day.day} title={`${day.day}: ${day.actions} veiksmų, ${day.active_admins} aktyvūs adminai, ${day.errors} klaidų`} className="min-w-1 flex-1 rounded-t bg-indigo-500" style={{ height: `${Math.max(3, day.actions / Math.max(1, ...report.daily.map(row => row.actions)) * 100)}%` }} />)}</div><p className="mt-2 text-xs text-slate-500">Stulpelis: sėkmingi veiksmai per dieną. Užveskite pelę, kad matytumėte datą ir skaičius.</p></div>
        <div className="rounded-2xl border border-white/10 p-4"><h3 className="mb-3 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-amber-400" />Organizacijos klaidos</h3><p className="mb-3 text-xs text-slate-500">Grupuoti skaitikliai: 90 dienų. Veiksmų kontekstas ir versija: iki 14 dienų.</p>{!report.errors.length && <p className="text-sm text-slate-400">Klaidų neužfiksuota.</p>}{report.errors.map(group => <details key={group.fingerprint} className="border-t border-white/5 py-3"><summary className="cursor-pointer text-sm"><span className="font-mono text-amber-300">{group.code}</span> · {modules[group.module] || group.module} · {group.endpoint || 'Naršyklė'}<span className="ml-2 text-xs text-slate-400">{number(group.occurrences)} kartų · {group.affected_admins} admin. · {date(group.last_seen_at)}</span></summary><div className="mt-3 space-y-2 text-xs text-slate-400"><p>Pirmą kartą: {date(group.first_seen_at)} · Veiksmas: {actions[group.operation || ''] || 'Nenurodytas'}</p>{group.sample ? <><p>Versija: <code>{group.sample.release}</code> · HTTP: {group.sample.status} {group.sample.vercelId && <>· Vercel ID: <code>{group.sample.vercelId}</code></>}</p>{group.sample.frames?.map(frame => <p key={frame} className="break-all font-mono">{frame}</p>)}{group.sample.breadcrumbs?.map((crumb, index) => <p key={index} className="font-mono">{crumb.type} · {crumb.path} {crumb.action} {crumb.endpoint} {crumb.status}</p>)}</> : <p>Detalus kontekstas pasibaigęs.</p>}</div></details>)}</div>
        {!!report.correlated_logs?.length && <div className="rounded-2xl border border-white/10 p-4"><h3 className="mb-3 font-medium">Susieti Vercel logai</h3>{report.correlated_logs.map((log, index) => <p key={index} className="mb-2 break-words text-xs text-slate-400">{date(log.occurred_at)} · {log.path} · {log.status_code} · {log.message || log.level}</p>)}</div>}
      </>}
      {!!report.server_errors.length && <details className="rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer text-sm font-medium">Visos platformos serverio klaidos ({report.server_errors.length} grupių)</summary><p className="my-3 text-xs text-slate-500">Šie logai gali būti nesusieti su konkrečia organizacija.</p>{report.server_errors.map((row, index) => <div key={index} className="border-t border-white/5 py-2 text-xs text-slate-400"><p>{row.path} · HTTP {row.status_code || 'nenurodytas'} · {number(row.occurrences)} kartų · {date(row.last_seen_at)}</p><p className="mt-1 break-words">{row.message || 'Techninis pranešimas'} · <code>{row.vercel_id}</code></p></div>)}</details>}
    </>}
  </div>;
}
