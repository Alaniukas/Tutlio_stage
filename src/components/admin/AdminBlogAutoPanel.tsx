import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Zap, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BlogAutoSettings {
  enabled: boolean;
  interval_days: number;
  last_run_at: string | null;
}

interface BlogAutoKeyword {
  id: string;
  keyword: string;
  tag: string;
  enabled: boolean;
  sort_order: number;
  last_used_at: string | null;
}

interface GenerationLogRow {
  id: string;
  post_id: string | null;
  keyword: string;
  status: string;
  error: string | null;
  created_at: string;
}

export default function AdminBlogAutoPanel({ adminSecret }: { adminSecret: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settings, setSettings] = useState<BlogAutoSettings>({ enabled: false, interval_days: 1, last_run_at: null });
  const [keywords, setKeywords] = useState<BlogAutoKeyword[]>([]);
  const [log, setLog] = useState<GenerationLogRow[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newTag, setNewTag] = useState('');

  const headers = { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin-blog-auto', { headers: { 'x-admin-secret': adminSecret } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      if (data.settings) {
        setSettings({
          enabled: !!data.settings.enabled,
          interval_days: Number(data.settings.interval_days) || 1,
          last_run_at: data.settings.last_run_at || null,
        });
      }
      setKeywords(data.keywords || []);
      setLog(data.log || []);
    } catch (e: any) {
      setError(e?.message || 'Load failed');
    }
    setLoading(false);
  }, [adminSecret]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async (patch: Partial<BlogAutoSettings>) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin-blog-auto?action=settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (data.settings) {
        setSettings({
          enabled: !!data.settings.enabled,
          interval_days: Number(data.settings.interval_days) || 1,
          last_run_at: data.settings.last_run_at || null,
        });
      }
      setSuccess('Settings saved');
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    }
    setSaving(false);
  };

  const addKeyword = async () => {
    const keyword = newKeyword.trim();
    if (!keyword) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin-blog-auto?action=keyword', {
        method: 'POST',
        headers,
        body: JSON.stringify({ keyword, tag: newTag.trim(), sort_order: keywords.length }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Add failed');
      setNewKeyword('');
      setNewTag('');
      setSuccess('Keyword added');
      void load();
    } catch (e: any) {
      setError(e?.message || 'Add failed');
    }
    setSaving(false);
  };

  const deleteKeyword = async (id: string) => {
    if (!confirm('Delete this keyword?')) return;
    try {
      const res = await fetch(`/api/admin-blog-auto?action=keyword&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-secret': adminSecret },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      void load();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    }
  };

  const toggleKeyword = async (row: BlogAutoKeyword) => {
    try {
      const res = await fetch(`/api/admin-blog-auto?action=keyword&id=${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) throw new Error('Update failed');
      void load();
    } catch (e: any) {
      setError(e?.message || 'Update failed');
    }
  };

  const generateNow = async (keywordId?: string) => {
    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin-blog-auto?action=generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(keywordId ? { keywordId } : {}),
      });
      const data = await res.json();
      if (!res.ok && !data.skipped) throw new Error(data.reason || data.error || 'Generation failed');
      if (data.skipped) setSuccess(`Skipped: ${data.reason}`);
      else setSuccess(data.postId ? `Draft created (${data.keyword})` : 'Done');
      void load();
    } catch (e: any) {
      setError(e?.message || 'Generation failed');
    }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-300">Auto SEO blog</h2>
          <p className="text-xs text-slate-500 mt-0.5">Generuoja LT/EN/PL draft kas {settings.interval_days} d. · el. laiškas su Publish</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {(error || success) && (
        <div className={`rounded-xl px-4 py-3 text-sm ${success ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
          {error || success}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={saving}
              onChange={(e) => void saveSettings({ enabled: e.target.checked })}
              className="rounded border-white/20"
            />
            <span className="text-sm text-slate-200">Auto-generavimas įjungtas</span>
          </label>
          <div className="flex items-center gap-2">
            <Label className="text-slate-400 text-xs">Intervalas (d.)</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={settings.interval_days}
              disabled={saving}
              onChange={(e) => {
                const v = Math.min(30, Math.max(1, Number(e.target.value) || 2));
                setSettings((s) => ({ ...s, interval_days: v }));
              }}
              onBlur={() => void saveSettings({ interval_days: settings.interval_days })}
              className="w-16 h-8 bg-white/10 border-white/20 text-white text-sm rounded-lg"
            />
          </div>
          {settings.last_run_at && (
            <span className="text-xs text-slate-500">
              Paskutinis: {new Date(settings.last_run_at).toLocaleString('lt-LT')}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={generating}
          onClick={() => void generateNow()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl text-sm font-medium"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Generuoti dabar
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Raktažodžiai</h3>
        <div className="flex flex-wrap gap-2">
          <Input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Raktažodis / tema"
            className="flex-1 min-w-[180px] bg-white/10 border-white/20 text-white rounded-xl"
          />
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Tag (optional)"
            className="w-32 bg-white/10 border-white/20 text-white rounded-xl"
          />
          <button
            type="button"
            disabled={saving || !newKeyword.trim()}
            onClick={() => void addKeyword()}
            className="inline-flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl text-sm"
          >
            <Plus className="w-4 h-4" /> Pridėti
          </button>
        </div>

        {keywords.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">Nėra raktažodžių — pridėkite bent vieną.</p>
        ) : (
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden">
            {keywords.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02]">
                <input
                  type="checkbox"
                  checked={k.enabled}
                  onChange={() => void toggleKeyword(k)}
                  className="rounded border-white/20"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{k.keyword}</p>
                  {k.tag && <p className="text-xs text-slate-500">{k.tag}</p>}
                </div>
                {k.last_used_at && (
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {new Date(k.last_used_at).toLocaleDateString('lt-LT')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void generateNow(k.id)}
                  disabled={generating}
                  className="text-xs text-emerald-400 hover:text-emerald-300 shrink-0"
                >
                  Gen.
                </button>
                <button
                  type="button"
                  onClick={() => void deleteKeyword(k.id)}
                  className="p-1.5 text-red-400 hover:text-red-300 rounded-lg hover:bg-white/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Generation log</h3>
        {log.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">Dar nėra įrašų</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {log.map((row) => (
              <div key={row.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-white/5 last:border-0">
                <span className={`shrink-0 font-semibold ${row.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {row.status}
                </span>
                <span className="text-slate-300 flex-1 min-w-0 truncate">{row.keyword}</span>
                <span className="text-slate-500 shrink-0">{new Date(row.created_at).toLocaleString('lt-LT')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
