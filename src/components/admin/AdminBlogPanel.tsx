import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Plus, Pencil, Trash2, Eye, Globe, Upload, X, Image as ImageIcon } from 'lucide-react';
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/core';

type BlogFormData = Record<string, string>;

type BlogView = 'list' | 'edit';

const LOCALE_FIELD_TYPES = ['title', 'excerpt', 'content'] as const;

function buildEmptyForm(): BlogFormData {
  const f: BlogFormData = { slug: '', cover_image: '', tag: '', status: 'draft' };
  for (const loc of SUPPORTED_LOCALES) {
    for (const type of LOCALE_FIELD_TYPES) f[`${type}_${loc}`] = '';
  }
  return f;
}

function postToForm(p: Record<string, unknown>): BlogFormData {
  const f = buildEmptyForm();
  for (const key of Object.keys(f)) {
    if (p[key] !== undefined && p[key] !== null) f[key] = String(p[key]);
  }
  return f;
}

export default function AdminBlogPanel({ adminSecret }: { adminSecret: string }) {
  const [view, setView] = useState<BlogView>('list');
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(buildEmptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lang, setLang] = useState<Locale>('lt');

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin-blog', { headers: { 'x-admin-secret': adminSecret } });
      const data = await res.json();
      if (res.ok) setPosts(data.posts || []);
      else setError(data.error || 'Failed to load');
    } catch {
      setError('Server error');
    }
    setLoading(false);
  }, [adminSecret]);

  useEffect(() => { if (view === 'list') void fetchPosts(); }, [view, fetchPosts]);

  const openEdit = async (id: string) => {
    setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin-blog?id=${id}`, { headers: { 'x-admin-secret': adminSecret } });
      const data = await res.json();
      if (res.ok && data.post) {
        setForm(postToForm(data.post));
        setEditId(id);
        setView('edit');
      }
    } catch { setError('Failed to load post'); }
  };

  const openNew = () => { setForm(buildEmptyForm()); setEditId(null); setError(''); setSuccess(''); setView('edit'); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const url = editId ? `/api/admin-blog?id=${editId}` : '/api/admin-blog';
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(editId ? 'Post updated' : 'Post created');
        if (!editId && data.post?.id) setEditId(data.post.id);
        if (data.post) setForm(postToForm(data.post));
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch { setError('Server error'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this blog post?')) return;
    try {
      const res = await fetch(`/api/admin-blog?id=${id}`, { method: 'DELETE', headers: { 'x-admin-secret': adminSecret } });
      if (res.ok) { setSuccess('Post deleted'); void fetchPosts(); }
    } catch { setError('Failed to delete'); }
  };

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Only images allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Max 5 MB'); return; }
    setUploading(true); setError('');
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/upload-blog-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify({ base64, contentType: file.type, fileName: file.name.replace(/\.[^.]+$/, '') }),
      });
      const data = await res.json();
      if (res.ok && data.url) updateField('cover_image', data.url);
      else setError(data.error || 'Upload failed');
    } catch { setError('Upload failed'); }
    setUploading(false);
  };

  const updateField = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  if (view === 'edit') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => { setView('list'); setEditId(null); }} className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to posts
        </button>

        {(error || success) && (
          <div className={`rounded-xl px-4 py-3 text-sm ${success ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
            {error || success}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Post details</p>
              <div className="ml-auto flex gap-1">
                {SUPPORTED_LOCALES.map(loc => (
                  <button key={loc} type="button" onClick={() => setLang(loc)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${lang === loc ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                    {LOCALE_LABELS[loc]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Title ({LOCALE_LABELS[lang]})</Label>
              <Input
                value={form[`title_${lang}`] || ''}
                onChange={(e) => updateField(`title_${lang}`, e.target.value)}
                required={lang === 'lt'}
                placeholder={lang === 'lt' ? 'Straipsnio pavadinimas' : 'Article title'}
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Slug</Label>
              <Input value={form.slug} onChange={(e) => updateField('slug', e.target.value)} placeholder="auto-generated-from-title"
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl" />
              <p className="text-xs text-slate-500">Leave empty to auto-generate from Lithuanian title</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Excerpt ({LOCALE_LABELS[lang]})</Label>
              <textarea
                value={form[`excerpt_${lang}`] || ''}
                onChange={(e) => updateField(`excerpt_${lang}`, e.target.value)}
                placeholder={lang === 'lt' ? 'Trumpas aprašymas...' : 'Short description...'}
                rows={2}
                className="w-full rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Content ({LOCALE_LABELS[lang]}) — Markdown</Label>
              <textarea
                value={form[`content_${lang}`] || ''}
                onChange={(e) => updateField(`content_${lang}`, e.target.value)}
                placeholder={lang === 'lt' ? 'Straipsnio turinys...' : 'Article content...'}
                rows={12}
                className="w-full rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 px-3 py-2 text-sm font-mono resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Cover image</Label>
              {form.cover_image ? (
                <div className="relative rounded-xl overflow-hidden bg-white/5 border border-white/10">
                  <img src={form.cover_image} alt="Cover" className="w-full h-40 object-cover" />
                  <button type="button" onClick={() => updateField('cover_image', '')}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button type="button" disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-32 rounded-xl border-2 border-dashed border-white/15 hover:border-white/30 bg-white/5 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50">
                  {uploading ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-5 h-5" /> <span className="text-sm">Click to upload cover image</span></>
                  )}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImageUpload(f); e.target.value = ''; }} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Tag</Label>
              <Input value={form.tag} onChange={(e) => updateField('tag', e.target.value)} placeholder="e.g. tips, case-study"
                className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300">Status</Label>
              <select value={form.status} onChange={(e) => updateField('status', e.target.value)}
                className="w-full h-10 rounded-xl bg-white/10 border border-white/20 text-white px-3 text-sm">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl font-semibold text-sm">
              {saving ? 'Saving...' : editId ? 'Update post' : 'Create post'}
            </button>
            {editId && form.status === 'published' && (
              <a href={`/blog/${form.slug}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm text-slate-300">
                <Eye className="w-4 h-4" /> View
              </a>
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Blog Posts ({posts.length})</h2>
        <button type="button" onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> New post
        </button>
      </div>

      {(error || success) && (
        <div className={`rounded-xl px-4 py-3 text-sm ${success ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
          {error || success}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No blog posts yet</div>
        ) : (
          <div className="divide-y divide-white/10">
            {posts.map((post) => (
              <div key={String(post.id)} className="p-4 hover:bg-white/5 transition-colors flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-white truncate">{String(post.title_lt || post.title_en || '(untitled)')}</p>
                    <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${post.status === 'published' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {String(post.status)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    /{String(post.slug)}
                    {post.tag && <> · <span className="text-slate-400">{String(post.tag)}</span></>}
                    {post.published_at && <> · {new Date(String(post.published_at)).toLocaleDateString('lt-LT')}</>}
                  </p>
                  {post.excerpt_lt && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{String(post.excerpt_lt)}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {post.status === 'published' && (
                    <a href={`/blog/${String(post.slug)}`} target="_blank" rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10" title="View">
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                  <button type="button" onClick={() => void openEdit(String(post.id))} className="p-2 text-indigo-400 hover:text-indigo-300 rounded-lg hover:bg-white/10" title="Edit">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => void handleDelete(String(post.id))} className="p-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-white/10" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
