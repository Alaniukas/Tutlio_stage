import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import type { AttendanceSideStatus } from '@/lib/attendance';

interface Props {
  adminSecret: string;
}

interface AttendanceRow {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  topic: string | null;
  tutor_name: string | null;
  organization_name: string | null;
  student_name: string | null;
  tutor_joined_at: string | null;
  student_joined_at: string | null;
  attendance: { tutor: AttendanceSideStatus; student: AttendanceSideStatus; flagged: boolean };
}

interface AttendanceResponse {
  assessed: number;
  flagged: number;
  rows: AttendanceRow[];
}

function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('lt-LT', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Vilnius',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('lt-LT', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius',
  });
}

function SideCell({ status, joinedAt }: { status: AttendanceSideStatus; joinedAt: string | null }) {
  if (status === 'joined' && joinedAt) {
    return <span className="text-emerald-400 whitespace-nowrap">{fmtTime(joinedAt)}</span>;
  }
  if (status === 'late' && joinedAt) {
    return <span className="text-amber-400 whitespace-nowrap">vėlavo · {fmtTime(joinedAt)}</span>;
  }
  if (status === 'missing') {
    return <span className="text-red-400 whitespace-nowrap">neprisijungė</span>;
  }
  return <span className="text-slate-500">—</span>;
}

export default function AdminAttendancePanel({ adminSecret }: Props) {
  const [from, setFrom] = useState(() => dateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => dateInputValue(new Date()));
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, only: onlyFlagged ? 'flagged' : 'all' });
      const res = await fetch(`/api/admin-attendance?${params.toString()}`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Nepavyko įkelti lankomumo');
      setData(json as AttendanceResponse);
    } catch (e: any) {
      setError(e.message || 'Nepavyko įkelti lankomumo');
    } finally {
      setLoading(false);
    }
  }, [adminSecret, from, to, onlyFlagged]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-slate-400" htmlFor="att-from">Nuo</label>
        <input
          id="att-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"
        />
        <label className="text-sm text-slate-400" htmlFor="att-to">Iki</label>
        <input
          id="att-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"
        />
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
            className="accent-indigo-500"
          />
          Tik pažymėtos
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="text-slate-400 hover:text-white ml-auto"
          title="Atnaujinti"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-semibold">Pamokų lankomumas</h3>
            <p className="text-sm text-slate-400 mt-1">
              Nuotolinės pamokos, kuriose korepetitorius ar mokinys nepaspaudė „prisijungti" per 10 min. nuo pamokos pradžios.
              Fiksuojami paspaudimai programėlėje, laiškuose ir kalendoriuje.
            </p>
          </div>
          {data && (
            <div className="text-sm text-slate-300 whitespace-nowrap">
              Įvertinta: <span className="font-semibold text-white">{data.assessed}</span>
              {' · '}
              Pažymėtos: <span className={`font-semibold ${data.flagged > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{data.flagged}</span>
            </div>
          )}
        </div>

        {loading && !data ? (
          <p className="text-sm text-slate-500 py-2 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Kraunama…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">
            {onlyFlagged ? 'Pažymėtų pamokų šiame laikotarpyje nėra.' : 'Pamokų šiame laikotarpyje nėra.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs">
                  <th className="py-2 pr-3 font-medium">Pamoka</th>
                  <th className="py-2 pr-3 font-medium">Korepetitorius</th>
                  <th className="py-2 pr-3 font-medium">Mokinys</th>
                  <th className="py-2 pr-3 font-medium">Korep. prisijungė</th>
                  <th className="py-2 pr-3 font-medium">Mokinys prisijungė</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/5 text-slate-300">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="text-white">{fmtDateTime(r.start_time)}</span>
                      {r.topic && <span className="block text-xs text-slate-500">{r.topic}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {r.tutor_name || '—'}
                      {r.organization_name && <span className="block text-xs text-slate-500">{r.organization_name}</span>}
                    </td>
                    <td className="py-2 pr-3">{r.student_name || '—'}</td>
                    <td className="py-2 pr-3"><SideCell status={r.attendance.tutor} joinedAt={r.tutor_joined_at} /></td>
                    <td className="py-2 pr-3"><SideCell status={r.attendance.student} joinedAt={r.student_joined_at} /></td>
                    <td className="py-2 text-right">
                      {r.attendance.flagged && (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Pažymėta
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
