import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { RefreshCw } from 'lucide-react';

interface Props {
  adminSecret: string;
}

interface StatsData {
  period_days: number;
  total_pageviews: number;
  unique_sessions: number;
  locale_distribution: { locale: string; user_count: number }[];
  signup_trends: { week: string; signups: number }[];
  traffic_sources: { source: string; visits: number }[];
  top_pages: { page_path: string; views: number; unique_visitors: number }[];
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#a855f7',
];

const LOCALE_LABELS: Record<string, string> = {
  lt: 'Lietuva (LT)',
  en: 'English (EN)',
  pl: 'Polska (PL)',
  lv: 'Latvija (LV)',
  ee: 'Eesti (EE)',
  de: 'Deutschland (DE)',
  fr: 'France (FR)',
  es: 'España (ES)',
  fi: 'Suomi (FI)',
  se: 'Sverige (SE)',
  no: 'Norge (NO)',
  dk: 'Danmark (DK)',
  unknown: 'Unknown',
};

const PERIOD_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
];

export default function AdminStatisticsPanel({ adminSecret }: Props) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const fetchedRef = useRef(false);

  const load = useCallback(async (periodDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin-statistics?days=${periodDays}`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json as StatsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void load(days);
  }, [load, days]);

  const handlePeriodChange = (newDays: number) => {
    setDays(newDays);
    fetchedRef.current = false;
  };

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      void load(days);
    }
  }, [days, load]);

  if (loading && !data) {
    return <div className="text-sm text-slate-400 py-8 text-center">Loading statistics...</div>;
  }

  if (error && !data) {
    return (
      <div className="text-sm text-red-400 py-8 text-center">
        {error}
        <button type="button" onClick={() => { fetchedRef.current = false; void load(days); }} className="ml-3 text-indigo-400 hover:text-indigo-300 underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const localeData = data.locale_distribution.map((d) => ({
    ...d,
    label: LOCALE_LABELS[d.locale] || d.locale.toUpperCase(),
  }));

  const signupData = data.signup_trends.map((d) => ({
    ...d,
    label: d.week.slice(5),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-400">
          Platform traffic and user analytics
        </p>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => handlePeriodChange(Number(e.target.value))}
            className="h-9 rounded-xl bg-white/10 border border-white/20 text-white px-3 text-sm"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { fetchedRef.current = false; void load(days); }}
            disabled={loading}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Pageviews" value={data.total_pageviews.toLocaleString()} />
        <KpiCard label="Unique Sessions" value={data.unique_sessions.toLocaleString()} />
        <KpiCard label="Total Users" value={localeData.reduce((s, d) => s + d.user_count, 0).toLocaleString()} />
      </div>

      {/* Charts grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Locale distribution */}
        <ChartCard title="User Locale Distribution">
          {localeData.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={localeData}
                  dataKey="user_count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {localeData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 13 }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Traffic sources */}
        <ChartCard title="Traffic Sources">
          {data.traffic_sources.length === 0 ? (
            <EmptyState message="No traffic data yet. Data will appear after deployment." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.traffic_sources} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis type="category" dataKey="source" tick={{ fill: '#cbd5e1', fontSize: 12 }} width={80} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 13 }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="visits" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Signup trends */}
        <ChartCard title="Weekly Signups">
          {signupData.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={signupData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 13 }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                <Line type="monotone" dataKey="signups" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Signups" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Top pages */}
        <ChartCard title="Top Pages">
          {data.top_pages.length === 0 ? (
            <EmptyState message="No pageview data yet." />
          ) : (
            <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-white/10">
                    <th className="py-2 pr-4 font-medium">Page</th>
                    <th className="py-2 pr-4 font-medium text-right">Views</th>
                    <th className="py-2 font-medium text-right">Unique</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_pages.map((p) => (
                    <tr key={p.page_path} className="border-b border-white/5">
                      <td className="py-1.5 pr-4 text-slate-300 truncate max-w-[200px] font-mono text-xs">
                        {p.page_path}
                      </td>
                      <td className="py-1.5 pr-4 text-slate-300 tabular-nums text-right">{p.views}</td>
                      <td className="py-1.5 text-slate-400 tabular-nums text-right">{p.unique_visitors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-white tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-slate-500">
      {message || 'No data available yet.'}
    </div>
  );
}
