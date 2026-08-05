/**
 * Public page editor — the owner-facing side of the landing card.
 *
 * Always edits the caller's own page: there is no slug in the route, and the
 * API resolves the row from the Bearer token — a solo tutor's page, or the
 * organization's page when the caller is an org admin. Edits autosave; the
 * preview is the real public page in an iframe (in preview mode, so an
 * unpublished draft still renders) rather than a mock of it.
 *
 * Exported twice on purpose: the default export carries the tutor chrome, while
 * PublicPageEditorContent is bare for the company routes, which already sit
 * inside CompanyLayout's <Outlet />.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload, Trash2, ExternalLink, Copy, Check, Globe, Loader2, AlertCircle,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import { publicPagePath, type PublicPageRow } from '@/lib/publicPage';
import {
  BACKDROP_THEMES, BRAND_PRESETS, PublicPageLoadError, SOCIAL_FIELDS,
  loadMyPage, savePage, uploadImage,
  type ImageKind, type LoadErrorCode, type PublicPageDraft, type SaveErrorCode,
} from '@/lib/publicPageStore';

const IMAGE_ERRORS: Record<string, string> = {
  'unsupported-type': 'Netinkamas formatas. Įkelkite JPG, PNG arba WEBP.',
  'too-large': 'Failas per didelis (iki 8 MB).',
  'decode-failed': 'Nepavyko nuskaityti paveikslėlio.',
  'canvas-unavailable': 'Naršyklė nepalaiko paveikslėlių apdorojimo.',
  'upload-failed': 'Nepavyko įkelti paveikslėlio. Bandykite dar kartą.',
};

const FORBIDDEN_COPY: Record<LoadErrorCode, string> = {
  'org-tutor': 'Priklausote organizacijai — viešą puslapį tvarko jos administratorius.',
  'org-excluded': 'Šiai organizacijai viešas puslapis neįjungtas.',
  'not-a-tutor': 'Ši sritis skirta korepetitoriams ir organizacijoms.',
  unknown: 'Ši sritis jums nepasiekiama.',
};

const SLUG_ERRORS: Record<SaveErrorCode, string> = {
  'slug-invalid': 'Naudokite tik mažąsias raides, skaičius ir brūkšnelius (3–80 simbolių).',
  'slug-reserved': 'Šis adresas rezervuotas.',
  'slug-taken': 'Šis adresas jau užimtas.',
  unknown: 'Nepavyko išsaugoti. Patikrinkite ryšį ir bandykite dar kartą.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 className="text-[13px] font-bold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[12px] text-gray-600">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function ImagePicker({
  label, kind, value, onChange, onError, round,
}: {
  label: string; kind: ImageKind; value?: string;
  onChange: (v: string | undefined) => void;
  onError: (msg: string | null) => void;
  round?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    onError(null);
    try {
      onChange(await uploadImage(file, kind));
    } catch (err) {
      onError(IMAGE_ERRORS[(err as Error).message] ?? IMAGE_ERRORS['upload-failed']);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <div
          className={`w-16 h-16 shrink-0 bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center ${round ? 'rounded-full' : 'rounded-lg'}`}
        >
          {value
            ? <img src={value} alt="" className="w-full h-full object-cover" />
            : <span className="text-[10px] text-gray-400">nėra</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-700 hover:border-gray-400 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Įkelti
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-600 hover:border-gray-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Šalinti
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
    </Field>
  );
}

type Status = 'loading' | 'ready' | 'forbidden' | 'error';

/** Tutor-side route: the editor inside the tutor sidebar chrome. */
export default function PublicPageEditor() {
  return (
    <Layout>
      <PublicPageEditorContent />
    </Layout>
  );
}

export function PublicPageEditorContent() {
  const { locale } = useTranslation();

  const [status, setStatus] = useState<Status>('loading');
  const [forbiddenReason, setForbiddenReason] = useState(FORBIDDEN_COPY.unknown);
  const [row, setRow] = useState<PublicPageRow | null>(null);
  /** Slug is edited locally and only committed on blur — see commitSlug. */
  const [slugInput, setSlugInput] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const pending = useRef<PublicPageDraft>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    applyPageDocumentMeta('Vizitinė kortelė | Tutlio', 'Landing page editor');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { page } = await loadMyPage();
        if (cancelled) return;
        setRow(page);
        setSlugInput(page.slug);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PublicPageLoadError && err.forbidden) {
          setForbiddenReason(FORBIDDEN_COPY[err.code]);
          setStatus('forbidden');
          return;
        }
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Flush the queued patch. Debounced so typing doesn't fire a request per key. */
  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    const result = await savePage(patch);
    setSaving(false);

    if (result.ok && result.page) {
      setRow(result.page);
      setError(null);
      return;
    }
    if (result.code && result.code.startsWith('slug')) setSlugError(SLUG_ERRORS[result.code]);
    else setError(SLUG_ERRORS[result.code ?? 'unknown']);
  }, []);

  const patch = useCallback((p: PublicPageDraft) => {
    // Optimistic: the form reads from `row`, so apply locally first.
    setRow((current) => (current ? { ...current, ...toRow(p) } : current));
    pending.current = { ...pending.current, ...p };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 600);
  }, [flush]);

  // Don't lose the last keystrokes when the editor unmounts mid-debounce.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    void flush();
  }, [flush]);

  const commitSlug = useCallback(async () => {
    const next = slugInput.toLowerCase().trim();
    if (!row || next === row.slug) return;
    setSlugError(null);
    setSaving(true);
    const result = await savePage({ slug: next });
    setSaving(false);
    if (result.ok && result.page) {
      setRow(result.page);
      setSlugInput(result.page.slug);
    } else {
      setSlugError(SLUG_ERRORS[result.code ?? 'unknown']);
    }
  }, [slugInput, row]);

  const togglePublished = useCallback(async () => {
    if (!row) return;
    setSaving(true);
    const result = await savePage({ published: !row.published });
    setSaving(false);
    if (result.ok && result.page) setRow(result.page);
    else setError(SLUG_ERRORS[result.code ?? 'unknown']);
  }, [row]);

  const publicPath = useMemo(
    () => (row ? publicPagePath(row.slug, locale) : ''),
    [row, locale],
  );

  if (status !== 'ready' || !row) {
    return (
      <div className="flex items-center justify-center py-24 px-6">
        {status === 'loading' && (
          <span className="inline-flex items-center gap-2 text-[13px] text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Kraunama…
          </span>
        )}
        {status === 'forbidden' && (
          <div className="text-center max-w-sm">
            <AlertCircle className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <p className="text-[14px] font-semibold text-gray-900">Vizitinė kortelė nepasiekiama</p>
            <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{forbiddenReason}</p>
          </div>
        )}
        {status === 'error' && (
          <div className="text-center max-w-sm">
            <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-[14px] font-semibold text-gray-900">Nepavyko įkelti puslapio</p>
            <p className="text-[13px] text-gray-500 mt-1.5">Atnaujinkite puslapį ir bandykite dar kartą.</p>
          </div>
        )}
      </div>
    );
  }

  const live = row.published;
  const publicUrl = `${window.location.origin}${publicPath}`;
  // No remount key: the iframe is a separate document that refetches on the
  // save ping, so it keeps its scroll position and open tab between edits.
  const previewSrc = `${publicPath}?preview=1`;

  const copyUrl = () => {
    navigator.clipboard?.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="-m-4 sm:-m-6 bg-gray-50 min-h-full">
      {/* Status bar — the green dot is the live indicator. */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-[1280px] mx-auto px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              {live && (
                <span className="absolute inline-flex w-full h-full rounded-full bg-green-400 opacity-70 animate-ping" />
              )}
              <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${live ? 'bg-green-500' : 'bg-gray-300'}`} />
            </span>
            <span className={`text-[13px] font-bold ${live ? 'text-green-700' : 'text-gray-500'}`}>
              {live ? 'Paskelbta' : 'Juodraštis'}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-[12.5px] text-gray-500 truncate">{publicPath}</span>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {live && (
              <>
                <button
                  type="button" onClick={copyUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-700 hover:border-gray-400"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Nukopijuota' : 'Kopijuoti nuorodą'}
                </button>
                <Link
                  to={publicPath}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-[12.5px] font-semibold text-gray-700 hover:border-gray-400"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Atidaryti
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={togglePublished}
              disabled={!!slugError || saving}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12.5px] font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
                live ? 'border border-gray-300 bg-white text-gray-700 hover:border-gray-400' : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {!live && <Globe className="w-3.5 h-3.5" />}
              {live ? 'Nebeskelbti' : 'Paskelbti'}
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border-t border-red-200 px-5 py-2 text-[12px] text-red-800">{error}</div>
        )}
      </header>

      <div className="max-w-[1280px] mx-auto px-5 py-6 grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 items-start">
        {/* Form */}
        <div className="space-y-4">
          <Section title="Adresas">
            <Field label="Nuoroda" hint={`${window.location.origin}${publicPagePath('', locale)}…`}>
              <Input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase().trim())}
                onBlur={commitSlug}
                className="bg-white"
              />
              {slugError && <p className="text-[11px] text-red-600 mt-1">{slugError}</p>}
            </Field>
          </Section>

          <Section title="Paveikslėliai">
            <ImagePicker
              label="Nuotrauka / logotipas" kind="avatar" round
              value={row.photo_url ?? undefined}
              onChange={(v) => patch({ photoUrl: v ?? null })}
              onError={setError}
            />
            <ImagePicker
              label="Viršelio paveikslėlis" kind="cover"
              value={row.cover_url ?? undefined}
              onChange={(v) => patch({ coverUrl: v ?? null })}
              onError={setError}
            />
            <p className="text-[11px] text-gray-400">
              Be viršelio rodomas spalvų fonas su dalyko rašto raštu.
            </p>
          </Section>

          <Section title="Tekstai">
            <Field label="Vardas / pavadinimas">
              <Input value={row.display_name} onChange={(e) => patch({ displayName: e.target.value })} className="bg-white" />
            </Field>
            <Field label="Paantraštė">
              <Input value={row.headline} onChange={(e) => patch({ headline: e.target.value })} className="bg-white" />
            </Field>
            <Field label="Šūkis" hint="Paryškintas žodis rodomas kita spalva.">
              <Input
                value={row.tagline_text ?? ''}
                onChange={(e) => patch({ taglineText: e.target.value })}
                className="bg-white"
              />
            </Field>
            <Field label="Paryškintas žodis">
              <Input
                value={row.tagline_emphasis ?? ''}
                onChange={(e) => patch({ taglineEmphasis: e.target.value })}
                className="bg-white"
              />
            </Field>
            <Field label="Apie">
              <textarea
                value={row.bio}
                onChange={(e) => patch({ bio: e.target.value })}
                rows={5}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-[13px]"
              />
            </Field>
            <Field label="Miestas" hint="Nurodžius miestą puslapyje atsiranda kontaktinių pamokų formatas.">
              <Input value={row.city ?? ''} onChange={(e) => patch({ city: e.target.value })} className="bg-white" />
            </Field>
            <Field label="Kalbos" hint="Atskirkite kableliais.">
              <Input
                value={(row.languages ?? []).join(', ')}
                onChange={(e) => patch({ languages: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="bg-white"
              />
            </Field>
          </Section>

          <Section title="Išvaizda">
            <Field label="Spalvos">
              <div className="grid grid-cols-3 gap-2">
                {BRAND_PRESETS.map((p) => {
                  const on = row.brand_color === p.brandColor;
                  return (
                    <button
                      key={p.id} type="button"
                      onClick={() => patch({
                        brandColor: p.brandColor,
                        brandColorSecondary: p.brandColorSecondary,
                        brandColorTertiary: p.brandColorTertiary,
                        accentColor: p.accentColor,
                        accentTextColor: p.accentTextColor,
                      })}
                      className={`rounded-lg border p-2 text-left ${on ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300'}`}
                      aria-pressed={on}
                    >
                      <span
                        className="block h-7 rounded"
                        style={{ background: `linear-gradient(135deg, ${p.brandColor}, ${p.brandColorSecondary}, ${p.brandColorTertiary})` }}
                      />
                      <span className="block text-[11px] text-gray-600 mt-1">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Fono raštas">
              <div className="flex flex-wrap gap-2">
                {BACKDROP_THEMES.map((t) => {
                  const on = row.backdrop_theme === t.id;
                  return (
                    <button
                      key={t.id} type="button"
                      onClick={() => patch({ backdropTheme: t.id })}
                      className={`px-3 py-1.5 rounded-lg border text-[12.5px] font-semibold ${
                        on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                      aria-pressed={on}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Section>

          <Section title="Užklausos">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={row.booking_enabled}
                onChange={(e) => patch({ bookingEnabled: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                <span className="block text-[13px] font-semibold text-gray-800">Priimti užklausas</span>
                <span className="block text-[11.5px] text-gray-500 mt-0.5">
                  Lankytojai gali palikti kontaktus ir pageidaujamą laiką — užklausa ateina jums el. paštu.
                </span>
              </span>
            </label>
          </Section>

          <Section title="Socialiniai tinklai">
            {SOCIAL_FIELDS.map((s) => (
              <Field key={s.key} label={s.label}>
                <Input
                  value={row.socials?.[s.key] ?? ''}
                  placeholder="https://…"
                  onChange={(e) => patch({ socials: { ...row.socials, [s.key]: e.target.value || undefined } })}
                  className="bg-white"
                />
              </Field>
            ))}
          </Section>

          <p className="text-[11.5px] text-gray-400 leading-relaxed">
            Pamokos, kainos ir laisvi laikai imami iš jūsų pamokų nustatymų ir kalendoriaus — čia jų keisti nereikia.
          </p>
        </div>

        {/* Live preview — the real page, not a mock of it. */}
        <div className="lg:sticky lg:top-20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-gray-500">Peržiūra</p>
            <p className="text-[11px] text-gray-400">Atnaujinama išsaugojus</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <iframe
              src={previewSrc}
              title="Peržiūra"
              className="w-full h-[720px] border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Applies a camelCase draft onto the snake_case row for the optimistic update. */
function toRow(p: PublicPageDraft): Partial<PublicPageRow> {
  const r: Partial<PublicPageRow> = {};
  if (p.slug !== undefined) r.slug = p.slug;
  if (p.displayName !== undefined) r.display_name = p.displayName;
  if (p.headline !== undefined) r.headline = p.headline;
  if (p.bio !== undefined) r.bio = p.bio;
  if (p.taglineText !== undefined) r.tagline_text = p.taglineText;
  if (p.taglineEmphasis !== undefined) r.tagline_emphasis = p.taglineEmphasis;
  if (p.photoUrl !== undefined) r.photo_url = p.photoUrl;
  if (p.coverUrl !== undefined) r.cover_url = p.coverUrl;
  if (p.city !== undefined) r.city = p.city;
  if (p.languages !== undefined) r.languages = p.languages;
  if (p.timezone !== undefined) r.timezone = p.timezone;
  if (p.brandColor !== undefined) r.brand_color = p.brandColor;
  if (p.brandColorSecondary !== undefined) r.brand_color_secondary = p.brandColorSecondary;
  if (p.brandColorTertiary !== undefined) r.brand_color_tertiary = p.brandColorTertiary;
  if (p.accentColor !== undefined) r.accent_color = p.accentColor;
  if (p.accentTextColor !== undefined) r.accent_text_color = p.accentTextColor;
  if (p.backdropTheme !== undefined) r.backdrop_theme = p.backdropTheme;
  if (p.socials !== undefined) r.socials = p.socials;
  if (p.published !== undefined) r.published = p.published;
  if (p.bookingEnabled !== undefined) r.booking_enabled = p.bookingEnabled;
  return r;
}
