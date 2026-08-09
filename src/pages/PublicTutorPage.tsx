/**
 * Public tutor/agency landing page ("vizitinė kortelė").
 *
 * Link-in-bio layout on a branded full-bleed backdrop. The cards are the
 * navigation: selecting one drives the main panel.
 *   - desktop: cards sit left, the panel is always visible on the right and
 *     swaps content as cards are clicked.
 *   - mobile: only the cards show; tapping one opens the panel, with a back
 *     control that returns to the card list.
 *
 * Every panel stays mounted (hidden, not unmounted) so a half-finished booking
 * survives a detour into "Apie mane".
 *
 * Data comes from /api/public-page?slug=… (published rows only). With
 * ?preview=1 the owner's own unpublished page is fetched from the authenticated
 * admin endpoint instead — same document, same session, so the editor's iframe
 * shows exactly what visitors will get.
 *
 * The two DEMO_PAGES slugs stay client-side fixtures: they are showcase URLs,
 * not real people, so they never touch the database.
 *
 * Still missing vs. the plan: the bot-facing SSR renderer.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Star, Clock, Tag, Globe, Check, ShieldCheck, Lock, ChevronRight, ChevronDown,
  Monitor, MapPin, User, Users, GraduationCap, MessageCircle, CalendarDays,
  ArrowLeft, ArrowRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { useTranslation } from '@/lib/i18n';
import { applyCanonicalDocumentMeta, applyPageDocumentMeta } from '@/lib/documentMeta';
import { fmtMoney } from '@/lib/marketMoney';
import {
  chromeFor, formatShortDay, getDemoPage, groupSlotsByDay, publicPageCanonicalUrl, resolveBrand, rowToPublicPage,
  safePublicSocialUrl,
  type BackdropTheme, type ChromeCopy, type PublicPage, type PublicPageDerived,
  type PublicPageFormat, type PublicPageOffering, type PublicPageRow, type ResolvedBrand,
} from '@/lib/publicPage';
import { subscribeToPreview } from '@/lib/publicPageStore';
import { authHeaders } from '@/lib/apiHelpers';
import type { Locale } from '@/lib/i18n/core';

function dayIsoToDate(dayIso: string): Date {
  const [y, m, d] = dayIso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateToDayIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; page: PublicPage }
  | { status: 'not-found' }
  | { status: 'unpublished' };

/**
 * Resolves a slug to a page. Preview mode reads the owner's draft through the
 * authenticated endpoint; everyone else gets the published-only public one.
 */
function usePublicPage(slug: string | undefined, preview: boolean): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // Bumped by the editor after each save so the preview iframe refetches.
  const [revision, setRevision] = useState(0);

  useEffect(() => subscribeToPreview(() => setRevision((r) => r + 1)), []);

  useEffect(() => {
    if (!slug) {
      setState({ status: 'not-found' });
      return;
    }

    const demo = getDemoPage(slug);
    if (demo) {
      setState({ status: 'ready', page: demo });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = preview
          ? await fetch('/api/public-page-admin', { headers: await authHeaders() })
          : await fetch(`/api/public-page?slug=${encodeURIComponent(slug)}`);

        if (cancelled) return;
        if (!res.ok) {
          setState({ status: res.status === 404 ? 'not-found' : 'unpublished' });
          return;
        }

        const { page, derived } = (await res.json()) as {
          page: PublicPageRow; derived: PublicPageDerived;
        };
        if (cancelled) return;
        setState({ status: 'ready', page: rowToPublicPage(page, derived) });
      } catch {
        if (!cancelled) setState({ status: 'not-found' });
      }
    })();

    return () => { cancelled = true; };
  }, [slug, preview, revision]);

  return state;
}

type TabId = 'book' | 'about' | 'lessons' | 'reviews';

/* ---------------------------------------------------------------- */
/* Footer                                                           */
/* ---------------------------------------------------------------- */

/** Three hearts only — they drift off the right edge of the "Tutlio" wordmark. */
const HEARTS = [
  { left: 3, bottom: 1, delay: '0s', duration: '3.8s', size: 9 },
  { left: 9, bottom: 3, delay: '1.3s', duration: '4.4s', size: 7 },
  { left: 6, bottom: 0, delay: '2.6s', duration: '4.1s', size: 8 },
];

const HEART_CSS = `
@keyframes pp-heart-rise {
  0%   { transform: translate(0, 0) scale(.5); opacity: 0; }
  30%  { opacity: .8; }
  100% { transform: translate(6px, -22px) scale(.85); opacity: 0; }
}
.pp-heart {
  position: absolute;
  line-height: 1;
  pointer-events: none;
  will-change: transform, opacity;
  animation-name: pp-heart-rise;
  animation-timing-function: cubic-bezier(.35,.6,.4,1);
  animation-iteration-count: infinite;
}
@media (prefers-reduced-motion: reduce) {
  .pp-heart { animation: none; opacity: 0; }
}
`;

function PageFooter({ chrome }: { chrome: ChromeCopy }) {
  return (
    <footer className="relative mt-12 text-center">
      <p className="text-[13px] text-white/85">
        {chrome.poweredBy}{' '}
        {/* Anchor for the hearts: they rise from just past the wordmark. */}
        <span className="relative inline-block">
          <a href="/" className="font-bold text-white hover:underline">Tutlio</a>
          <span aria-hidden="true" className="absolute left-full bottom-0 w-4 h-full">
            {HEARTS.map((h, i) => (
              <span
                key={i}
                className="pp-heart"
                style={{
                  left: `${h.left}px`,
                  bottom: `${h.bottom}px`,
                  fontSize: `${h.size}px`,
                  animationDelay: h.delay,
                  animationDuration: h.duration,
                }}
              >
                ❤️
              </span>
            ))}
          </span>
        </span>{' '}
        <span aria-hidden="true">🇱🇹</span>
      </p>
    </footer>
  );
}

/* ---------------------------------------------------------------- */
/* Decorative backdrop                                              */
/* ---------------------------------------------------------------- */

const WATERMARKS: Record<BackdropTheme, string[]> = {
  math: ['x² + y²', 'a² + b² = c²', '∫ f(x) dx', '= 2πr', 'A = πr²', '√x', '−b ± √(b²−4ac)', 'f(x) = ax + b', 'sin θ', 'Σ n²'],
  language: ['Hola', 'Guten Tag', 'Bonjour', 'Hello', 'Ciao', 'こんにちは', 'A1 → C1', 'der / die / das', '¿Cómo estás?', 'Thank you'],
  music: ['♪', '♫', '𝄞', '♩', '4/4', 'Andante', '♭', '♯', 'Forte', '𝄢'],
  plain: [],
};

/** Deterministic so the backdrop never reflows between renders. */
const SPOTS = [
  { x: 6, y: 9, s: 30, r: -8 }, { x: 62, y: 5, s: 24, r: 6 }, { x: 84, y: 15, s: 32, r: -4 },
  { x: 3, y: 27, s: 22, r: 4 }, { x: 45, y: 20, s: 20, r: -10 }, { x: 90, y: 33, s: 26, r: 8 },
  { x: 10, y: 46, s: 26, r: -6 }, { x: 72, y: 52, s: 22, r: 5 }, { x: 30, y: 62, s: 24, r: -3 },
  { x: 88, y: 70, s: 28, r: -7 }, { x: 5, y: 74, s: 20, r: 9 }, { x: 55, y: 82, s: 26, r: -5 },
  { x: 20, y: 90, s: 22, r: 3 }, { x: 78, y: 92, s: 24, r: -9 },
];

function Backdrop({
  brand, theme, coverUrl,
}: { brand: ResolvedBrand; theme: BackdropTheme; coverUrl?: string }) {
  const marks = WATERMARKS[theme];
  // A cover photo replaces the watermark but keeps the brand gradient on top,
  // otherwise white text stops being legible over an arbitrary image.
  if (coverUrl) {
    return (
      <div className="fixed inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
        <div className="absolute inset-0 opacity-80" style={{ background: brand.backdrop }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/25" />
      </div>
    );
  }
  return (
    <div className="fixed inset-0 -z-10" style={{ background: brand.backdrop }} aria-hidden="true">
      {marks.length > 0 && (
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
          {SPOTS.map((p, i) => (
            <text
              key={i}
              x={`${p.x}%`} y={`${p.y}%`} fontSize={p.s}
              fill="#ffffff" opacity={0.11} fontStyle="italic"
              fontFamily="Georgia, 'Times New Roman', serif"
              transform={`rotate(${p.r} ${p.x * 12} ${p.y * 8})`}
            >
              {marks[i % marks.length]}
            </text>
          ))}
        </svg>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10" />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Small pieces                                                     */
/* ---------------------------------------------------------------- */

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-4 h-4 ${i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-white/25 text-white/25'}`} />
      ))}
    </span>
  );
}

function SelectPill({
  selected, onClick, brand, children,
}: {
  selected: boolean; onClick: () => void; brand: ResolvedBrand; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 rounded-xl text-[13.5px] font-semibold border transition ${
        selected ? 'border-transparent shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
      }`}
      style={selected ? { backgroundColor: brand.accent, color: brand.accentText } : undefined}
      aria-pressed={selected}
    >
      {children}
      {selected && (
        <span
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
          style={{ backgroundColor: brand.primary }}
        >
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

const SOCIAL_PATHS: Record<string, string> = {
  tiktok: 'M16.5 3a5.4 5.4 0 0 0 4.5 4.4v3a8.4 8.4 0 0 1-4.5-1.4v6.3a6.3 6.3 0 1 1-6.3-6.3c.3 0 .6 0 .9.1v3.1a3.3 3.3 0 1 0 2.4 3.1V3h3z',
  youtube: 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3-5.2 3z',
  x: 'M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.7 21H1.5l7.5-8.6L1.2 3h6.6l4.5 5.6L17.5 3zm-1.1 16h1.8L7.7 4.8H5.8L16.4 19z',
  instagram: 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9a3.7 3.7 0 0 1-.9-1.4c-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm8.4-11.2a1.5 1.5 0 1 1-3.1 0 1.5 1.5 0 0 1 3.1 0z',
  facebook: 'M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z',
};

/** Navigation card. Highlighted when it drives the visible panel (desktop). */
function NavCard({
  icon: Icon, label, active, onClick, brand,
}: {
  icon: typeof User; label: string; active: boolean; onClick: () => void; brand: ResolvedBrand;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-left shadow-sm transition ${
        active ? 'bg-white' : 'bg-white/90 hover:bg-white'
      }`}
      style={active ? { boxShadow: `0 0 0 2px ${brand.accent}, 0 1px 2px rgba(0,0,0,.05)` } : undefined}
      aria-current={active ? 'true' : undefined}
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: active ? brand.accent : '#f3f4f6' }}
      >
        <Icon className="w-4.5 h-4.5 text-gray-600" strokeWidth={1.8} />
      </span>
      <span className="flex-1 text-[14.5px] font-semibold text-gray-900">{label}</span>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Booking panel                                                    */
/* ---------------------------------------------------------------- */

type Step = 'select' | 'details' | 'sent';

function BookingPanel({
  page, brand, chrome, locale, offering, setOffering,
}: {
  page: PublicPage; brand: ResolvedBrand; chrome: ChromeCopy; locale: Locale;
  // Null while the owner has no lessons configured — the enquiry still works.
  offering: PublicPageOffering | null; setOffering: (o: PublicPageOffering) => void;
}) {
  const days = useMemo(() => groupSlotsByDay(page.slots), [page.slots]);
  const availableDaySet = useMemo(() => new Set(days.map((d) => d.day)), [days]);

  const [dayIdx, setDayIdx] = useState(0);
  const [calMonth, setCalMonth] = useState(() =>
    dayIsoToDate(days[0]?.day ?? dateToDayIso(new Date())),
  );
  const [slotStart, setSlotStart] = useState<string | null>(days[0]?.slots[0]?.start ?? null);
  const [format, setFormat] = useState<PublicPageFormat>(page.formats[0]);
  const [step, setStep] = useState<Step>('select');
  const [lessonOpen, setLessonOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const day = days[dayIdx];
  const detailsValid = name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale === 'lt' ? 'lt-LT' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

  /**
   * Sends an enquiry, not a booking: an anonymous visitor has no account and no
   * payment method, so the owner converts this into a real lesson in the app.
   */
  const submit = async () => {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/public-page-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: page.slug,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: [message.trim(), format && `${chrome.pickFormat}: ${format.label}`]
            .filter(Boolean).join('\n'),
          subjectId: offering?.id,
          offeringTitle: offering?.title,
          requestedStart: slotStart ?? undefined,
        }),
      });
      if (res.ok) {
        setStep('sent');
        return;
      }
      setSendError(res.status === 429 ? chrome.enquiryTooMany : chrome.enquiryFailed);
    } catch {
      setSendError(chrome.enquiryFailed);
    } finally {
      setSending(false);
    }
  };

  if (step === 'sent') {
    return (
      <div className="space-y-3 text-center py-6">
        <span
          className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
          style={{ backgroundColor: brand.accent }}
        >
          <Check className="w-6 h-6" style={{ color: brand.accentText }} strokeWidth={2.5} />
        </span>
        <p className="text-[15px] font-bold text-gray-900">{chrome.enquirySentTitle}</p>
        <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto">{chrome.enquirySentBody}</p>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div className="space-y-3">
        <p className="text-[15px] font-bold text-gray-900">{chrome.yourDetails}</p>
        <p className="text-[12.5px] text-gray-500 leading-relaxed">{chrome.enquiryIntro}</p>

        <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100 text-[13px]">
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-gray-500">{chrome.yourRequest}</span>
            <span className="font-medium text-gray-900">{offering?.title ?? '—'}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-gray-500">{chrome.pickTime}</span>
            <span className="font-medium text-gray-900">
              {slotStart ? `${formatShortDay(slotStart.slice(0, 10), locale)} ${fmtTime(slotStart)}` : chrome.anyTime}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-gray-500">{chrome.pickFormat}</span>
            <span className="font-medium text-gray-900">{format?.label ?? '—'}</span>
          </div>
        </div>

        <div>
          <Label htmlFor="pp-name" className="text-[12px]">{chrome.fullName}</Label>
          <Input id="pp-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-white" />
        </div>
        <div>
          <Label htmlFor="pp-email" className="text-[12px]">{chrome.email}</Label>
          <Input id="pp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 bg-white" />
        </div>
        <div>
          <Label htmlFor="pp-phone" className="text-[12px]">{chrome.phone}</Label>
          <Input id="pp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 bg-white" />
        </div>
        <div>
          <Label htmlFor="pp-message" className="text-[12px]">{chrome.messageLabel}</Label>
          <textarea
            id="pp-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
            className="mt-1 w-full rounded-md border border-input bg-white px-3 py-2 text-[13px]"
          />
        </div>

        {sendError && (
          <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-800">{sendError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button" onClick={() => setStep('select')} disabled={sending}
            className="flex-1 rounded-2xl py-3.5 border border-gray-300 bg-white text-[14px] font-semibold text-gray-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />{chrome.back}
          </button>
          <button
            type="button" disabled={!detailsValid || sending} onClick={submit}
            className="flex-1 rounded-2xl py-3.5 text-white text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: brand.primary }}
          >
            {sending ? chrome.sending : chrome.sendEnquiry}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Compact lesson summary that doubles as the picker toggle. */}
      {offering ? (
        <button
          type="button"
          onClick={() => setLessonOpen((v) => !v)}
          className="w-full flex items-start gap-3 pb-4 border-b text-left"
          style={{ borderColor: '#ece9e0' }}
          aria-expanded={lessonOpen}
        >
          <span
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${brand.primary}18` }}
          >
            {offering.group
              ? <Users className="w-5 h-5" style={{ color: brand.primary }} strokeWidth={1.8} />
              : <User className="w-5 h-5" style={{ color: brand.primary }} strokeWidth={1.8} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-gray-900 leading-tight">{offering.title}</span>
            <span className="block text-[13px] text-gray-500 mt-0.5">
              {offering.durationMinutes} {chrome.minutes} · {offering.publicPrice === 0 ? chrome.free : fmtMoney(offering.publicPrice)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold shrink-0 mt-1" style={{ color: brand.primary }}>
            {chrome.change}
            {lessonOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        </button>
      ) : (
        <p className="text-[13px] text-gray-500 pb-4 border-b" style={{ borderColor: '#ece9e0' }}>
          {chrome.noOfferings}
        </p>
      )}

      {lessonOpen && offering && (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {page.offerings.map((o) => {
            const on = o.id === offering.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => { setOffering(o); setLessonOpen(false); }}
                className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition ${
                  on ? 'border-transparent shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                style={on ? { backgroundColor: `${brand.accent}66`, borderColor: brand.accent } : undefined}
                aria-pressed={on}
              >
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: on ? brand.accent : '#f3f4f6' }}
                >
                  {o.group
                    ? <Users className="w-4 h-4 text-gray-600" strokeWidth={1.8} />
                    : <User className="w-4 h-4 text-gray-600" strokeWidth={1.8} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-gray-900 truncate">{o.title}</span>
                  <span className="block text-[12.5px] text-gray-500">
                    {o.durationMinutes} {chrome.minutes} · {o.publicPrice === 0 ? chrome.free : fmtMoney(o.publicPrice)}
                  </span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center border-2 ${on ? 'border-transparent' : 'border-gray-200'}`}
                  style={on ? { backgroundColor: brand.primary } : undefined}
                >
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* A brand-new tutor has no availability rules yet; the enquiry still works
          without a time, so this degrades to a note rather than a dead end. */}
      {days.length === 0 ? (
        <p className="rounded-xl bg-gray-100/70 px-4 py-3 text-[12.5px] text-gray-600 leading-relaxed">
          {chrome.noSlots}
        </p>
      ) : (
        <div>
          <p className="text-[12.5px] font-semibold text-gray-500 mb-2">{chrome.pickDate}</p>
          <div className="rounded-2xl border border-gray-200 bg-white">
            <Calendar
              mode="single"
              captionLayout="label"
              weekStartsOn={1}
              selected={day ? dayIsoToDate(day.day) : undefined}
              month={calMonth}
              onMonthChange={setCalMonth}
              onSelect={(date) => {
                if (!date) return;
                const iso = dateToDayIso(date);
                const idx = days.findIndex((d) => d.day === iso);
                if (idx < 0) return;
                setDayIdx(idx);
                setSlotStart(days[idx]?.slots[0]?.start ?? null);
              }}
              disabled={(date) => !availableDaySet.has(dateToDayIso(date))}
              startMonth={dayIsoToDate(days[0].day)}
              endMonth={dayIsoToDate(days[days.length - 1].day)}
              className="mx-auto w-fit"
              classNames={{
                caption_label: 'text-sm font-semibold text-gray-900 not-sr-only',
                selected: 'bg-transparent text-inherit',
                today: 'bg-transparent',
                day_button:
                  'h-9 w-9 rounded-full p-0 font-semibold text-gray-800 hover:bg-gray-100 aria-selected:bg-[var(--public-cal-accent)] aria-selected:text-[var(--public-cal-accent-text)] aria-selected:hover:bg-[var(--public-cal-accent)]',
                disabled: 'text-gray-300 opacity-60 font-normal',
              }}
              style={
                {
                  '--public-cal-accent': brand.accent,
                  '--public-cal-accent-text': brand.accentText,
                } as CSSProperties
              }
            />
          </div>

          <p className="mt-1 text-center text-[12px] text-gray-500">
            {day ? formatShortDay(day.day, locale) : null}
          </p>

          <p className="text-[12.5px] font-semibold text-gray-500 mt-4 mb-2">{chrome.pickTime}</p>
          <div className="flex flex-wrap gap-2">
            {day?.slots.map((s) => (
              <SelectPill key={s.start} selected={slotStart === s.start} brand={brand} onClick={() => setSlotStart(s.start)}>
                {fmtTime(s.start)}
              </SelectPill>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[12.5px] font-semibold text-gray-500 mb-2">{chrome.pickFormat}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {page.formats.map((f) => {
            const on = f.id === format.id;
            return (
              <button
                key={f.id} type="button" onClick={() => setFormat(f)}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-[13.5px] font-semibold transition ${
                  on ? 'border-transparent shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
                style={on ? { backgroundColor: brand.accent, color: brand.accentText } : undefined}
                aria-pressed={on}
              >
                {f.kind === 'online' ? <Monitor className="w-4 h-4" strokeWidth={1.8} /> : <MapPin className="w-4 h-4" strokeWidth={1.8} />}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 rounded-xl bg-gray-100/70 divide-x divide-gray-200 text-center">
        <div className="px-3 py-2.5 flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={1.8} />
          <span className="text-left">
            <span className="block text-[13px] font-bold text-gray-900">
              {offering ? `${offering.durationMinutes} ${chrome.minutes}` : '—'}
            </span>
            <span className="block text-[11px] text-gray-500">{chrome.duration}</span>
          </span>
        </div>
        <div className="px-3 py-2.5 flex items-center justify-center gap-2">
          <Tag className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={1.8} />
          <span className="text-left">
            <span className="block text-[13px] font-bold text-gray-900">
              {!offering ? '—' : offering.publicPrice === 0 ? chrome.free : fmtMoney(offering.publicPrice)}
            </span>
            <span className="block text-[11px] text-gray-500">{chrome.price}</span>
          </span>
        </div>
        <div className="px-3 py-2.5 col-span-2 sm:col-span-1 flex items-center justify-center gap-2 border-t sm:border-t-0 border-gray-200">
          <Globe className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={1.8} />
          <span className="text-left">
            <span className="block text-[11px] text-gray-500">{chrome.timeShownIn}</span>
            <span className="block text-[12px] font-semibold text-gray-800">{page.timezone}</span>
          </span>
        </div>
      </div>

      {/* Never disabled: a visitor with no slot to pick can still ask. */}
      <button
        type="button" onClick={() => setStep('details')}
        className="w-full rounded-2xl py-4 text-white text-[15px] font-bold flex items-center justify-center gap-2 transition"
        style={{ backgroundColor: brand.primary }}
      >
        {chrome.continueBooking}
        {offering && offering.publicPrice > 0 && <span className="opacity-80">· {fmtMoney(offering.publicPrice)}</span>}
        <ArrowRight className="w-4 h-4" />
      </button>

      <p className="flex items-center justify-center gap-2 text-[12px] text-gray-500">
        <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.8} />
        {chrome.trustLine}
        <Lock className="w-3.5 h-3.5" strokeWidth={1.8} />
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Page                                                             */
/* ---------------------------------------------------------------- */

export default function PublicTutorPage() {
  const { slug } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  const { locale } = useTranslation();
  const chrome = chromeFor(locale);

  /** The editor previews unpublished pages; visitors must not see them. */
  const previewMode = search.get('preview') === '1';

  const state = usePublicPage(slug, previewMode);
  const page = state.status === 'ready' ? state.page : null;

  const [tab, setTab] = useState<TabId>('book');
  /** Mobile only: the card list is the default view; a card opens the panel. */
  const [panelOpen, setPanelOpen] = useState(false);
  const [offering, setOffering] = useState<PublicPageOffering | null>(null);

  // The page arrives after first paint, so the default offering is picked here
  // rather than in useState. Keep the current one if it survived a refetch.
  useEffect(() => {
    if (!page) return;
    setOffering((current) => {
      if (current && page.offerings.some((o) => o.id === current.id)) return current;
      return page.offerings[0] ?? null;
    });
  }, [page]);

  useEffect(() => {
    if (!page) return;
    const canonicalUrl = publicPageCanonicalUrl(page.slug, page.locale);
    applyPageDocumentMeta(`${page.displayName} | Tutlio`, page.headline);
    applyCanonicalDocumentMeta(canonicalUrl);

    // Public pages have one authored locale. On production domains, converge
    // every human-visible alias on the same URL that crawlers and the sitemap use.
    if (!previewMode && /(^|\.)tutlio\.(com|lt|pl)$/i.test(window.location.hostname)) {
      const currentUrl = `${window.location.origin}${window.location.pathname}`;
      if (currentUrl !== canonicalUrl) window.location.replace(canonicalUrl);
    }
  }, [page, previewMode]);

  // Freeze the page behind the mobile sheet; desktop keeps the panel in flow.
  useEffect(() => {
    if (!panelOpen || !window.matchMedia('(max-width: 1023px)').matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [panelOpen]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-[13px] text-gray-400">{chrome.loading}</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-sm">
          <p className="text-[15px] font-semibold text-gray-900">{chrome.notFoundTitle}</p>
          <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{chrome.notFoundBody}</p>
        </div>
      </div>
    );
  }

  // Only reachable in preview: the public endpoint never returns a draft.
  if (!page.published && !previewMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-sm">
          <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-gray-500 mb-3">
            <span className="w-2 h-2 rounded-full bg-gray-300" />
            {chrome.statusDraft}
          </span>
          <p className="text-[15px] font-semibold text-gray-900">{chrome.notLiveTitle}</p>
          <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">{chrome.notLiveBody}</p>
        </div>
      </div>
    );
  }

  const brand = resolveBrand(page);
  const isOrg = page.ownerType === 'organization';
  const isDemo = !!getDemoPage(slug);

  const TABS: { id: TabId; label: string; icon: typeof User }[] = [
    { id: 'book', label: chrome.linkBook, icon: CalendarDays },
    { id: 'about', label: isOrg ? chrome.linkAboutUs : chrome.linkAboutMe, icon: User },
    { id: 'lessons', label: chrome.linkLessons, icon: GraduationCap },
    { id: 'reviews', label: chrome.linkReviews, icon: MessageCircle },
  ];

  const openTab = (id: TabId) => { setTab(id); setPanelOpen(true); };
  const activeLabel = TABS.find((t) => t.id === tab)?.label ?? '';

  const identity = (
    <div className="text-center lg:text-left">
      <div
        className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto lg:mx-0 p-[3px] shadow-xl"
        style={{ background: `linear-gradient(150deg, rgba(255,255,255,0.95) 0%, ${brand.tertiary}cc 55%, rgba(255,255,255,0.7) 100%)` }}
      >
        <div className="w-full h-full rounded-full bg-white/95 flex items-center justify-center overflow-hidden">
          {page.photoUrl
            ? <img src={page.photoUrl} alt="" className="w-full h-full object-cover" />
            : <span className="text-[30px] font-bold" style={{ color: brand.primary }}>{page.initials}</span>}
        </div>
      </div>

      <h1 className="font-display text-[2.1rem] sm:text-[2.6rem] font-bold text-white mt-5 leading-[1.1] tracking-tight">
        {page.displayName}
      </h1>
      <p className="text-white/85 text-[15px] mt-2 leading-snug">{page.headline}</p>

      <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-2 mt-3 text-[13.5px] text-white/90">
        {page.ratingAvg !== null && (
          <span className="inline-flex items-center gap-1.5">
            <Stars value={page.ratingAvg} />
            <span className="font-bold text-white">{page.ratingAvg.toFixed(1)}</span>
            <span className="text-white/75">· {page.ratingCount} {chrome.reviewCount}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" style={{ color: brand.accent }} strokeWidth={2} />
          {chrome.verified}
        </span>
      </div>

      {page.tagline && (
        <p className="font-display text-[1.35rem] sm:text-[1.55rem] font-bold text-white mt-6 leading-snug">
          {page.tagline.emphasis
            ? <>
                {page.tagline.text.replace(page.tagline.emphasis, '')}
                <span style={{ color: brand.tertiary }}>{page.tagline.emphasis}</span>
              </>
            : page.tagline.text}
        </p>
      )}
    </div>
  );

  const cards = (
    <div className="space-y-3">
      {TABS.map((t) => (
        <NavCard
          key={t.id}
          icon={t.icon}
          label={t.label}
          active={tab === t.id}
          brand={brand}
          onClick={() => openTab(t.id)}
        />
      ))}
    </div>
  );

  const safeSocials = Object.entries(page.socials || {})
    .map(([provider, value]) => [provider, safePublicSocialUrl(provider, value)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  const socials = safeSocials.length > 0 && (
    <div className="flex items-center justify-center gap-5">
      {safeSocials.map(([k, href]) => (
        <a
          key={k} href={href} target="_blank" rel="me ugc nofollow noopener noreferrer" aria-label={k}
          className="text-white/75 hover:text-white transition"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path d={SOCIAL_PATHS[k]} />
          </svg>
        </a>
      ))}
    </div>
  );

  /* Every panel stays mounted so booking progress survives a tab detour. */
  const panel = (
    <div className="bg-[#fdfcf7] shadow-xl p-5 sm:p-7 rounded-t-3xl lg:rounded-3xl">
      {/* Sheet grab handle — mobile affordance only. */}
      <div className="lg:hidden flex justify-center -mt-2 mb-3">
        <span className="w-10 h-1 rounded-full bg-gray-300" aria-hidden="true" />
      </div>

      {/* Panel header: dismiss on mobile, plain title on desktop. */}
      <div className="flex items-center gap-2 mb-4 lg:hidden">
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
          aria-label={chrome.backToMenu}
        >
          <ChevronDown className="w-4 h-4 text-gray-600" />
        </button>
        <p className="text-[15px] font-bold text-gray-900">{activeLabel}</p>
      </div>

      <div className={tab === 'book' ? '' : 'hidden'}>
        <p className="text-[15px] font-bold text-gray-900 mb-4 hidden lg:block">{chrome.linkBook}</p>
        <BookingPanel
          page={page} brand={brand} chrome={chrome} locale={locale}
          offering={offering} setOffering={setOffering}
        />
      </div>

      <div className={tab === 'about' ? '' : 'hidden'}>
        <p className="text-[15px] font-bold text-gray-900 mb-3 hidden lg:block">
          {isOrg ? chrome.linkAboutUs : chrome.linkAboutMe}
        </p>
        <p className="text-[14px] text-gray-600 leading-relaxed">{page.bio}</p>
        <div className="grid grid-cols-2 gap-2.5 mt-5">
          {page.city && (
            <div className="rounded-xl bg-gray-100/70 px-4 py-3">
              <p className="text-[11px] text-gray-500">{chrome.basedIn}</p>
              <p className="text-[14px] font-bold text-gray-900 mt-0.5">{page.city}</p>
            </div>
          )}
          {page.ratingAvg !== null && (
            <div className="rounded-xl bg-gray-100/70 px-4 py-3">
              <p className="text-[11px] text-gray-500">{chrome.lessonsGiven}</p>
              <p className="text-[14px] font-bold text-gray-900 mt-0.5">
                {page.ratingAvg.toFixed(1)} · {page.ratingCount}
              </p>
            </div>
          )}
        </div>
        <p className="text-[12px] font-semibold text-gray-500 mt-5 mb-2">{chrome.languages}</p>
        <div className="flex flex-wrap gap-1.5">
          {page.languages.map((l) => (
            <span key={l} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[12px] font-medium">{l}</span>
          ))}
        </div>
      </div>

      <div className={tab === 'lessons' ? '' : 'hidden'}>
        <p className="text-[15px] font-bold text-gray-900 mb-3 hidden lg:block">{chrome.linkLessons}</p>
        <div className="space-y-2.5">
          {page.offerings.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-gray-900">{o.title}</p>
                {o.description && <p className="text-[12px] text-gray-500 mt-0.5">{o.description}</p>}
                <p className="text-[11.5px] text-gray-400 mt-1">{o.durationMinutes} {chrome.minutes}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="text-[15px] font-bold text-gray-900">
                  {o.publicPrice === 0 ? chrome.free : fmtMoney(o.publicPrice)}
                </p>
                <button
                  type="button"
                  onClick={() => { setOffering(o); setTab('book'); }}
                  className="px-3 py-2 rounded-xl text-[12.5px] font-bold"
                  style={{ backgroundColor: brand.accent, color: brand.accentText }}
                >
                  {chrome.bookThis}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={tab === 'reviews' ? '' : 'hidden'}>
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[15px] font-bold text-gray-900 hidden lg:block">{chrome.linkReviews}</p>
          {page.ratingAvg !== null && (
            <span className="text-[13px] font-semibold text-gray-900 ml-auto">
              {page.ratingAvg.toFixed(1)} <span className="text-gray-400 font-normal">({page.ratingCount})</span>
            </span>
          )}
        </div>
        <p className="text-[11.5px] text-gray-400 mb-3 inline-flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          {chrome.reviewsOnlyStudents}
        </p>
        <div className="divide-y divide-gray-100">
          {page.reviews.map((r) => (
            <div key={r.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold flex items-center justify-center shrink-0">
                    {r.authorDisplayName.slice(0, 1)}
                  </span>
                  <span className="text-[12.5px] font-semibold text-gray-900 truncate">{r.authorDisplayName}</span>
                  <span className="inline-flex items-center gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={`w-3 h-3 ${i <= r.rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`} />
                    ))}
                  </span>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{r.createdAt}</span>
              </div>
              <p className="text-[13px] text-gray-600 mt-1.5 leading-relaxed">{r.comment}</p>
              {r.subjectName && (
                <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 text-[11px]">
                  {r.subjectName}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen font-sans">
      <style>{HEART_CSS}</style>
      <Backdrop brand={brand} theme={page.backdropTheme} coverUrl={page.coverUrl} />

      {/* Only the two showcase fixtures carry the sample-data warning. A real
          owner's published page must never tell visitors it isn't real. */}
      {isDemo && (
        <div className="bg-amber-50/95 border-b border-amber-200 px-4 py-2 text-center text-[12px] text-amber-900">
          {chrome.demoBanner}
        </div>
      )}

      <div className="max-w-[1120px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-8 lg:gap-12 items-start">
          {/* Identity + cards. The mobile sheet slides over these. */}
          <div className="lg:sticky lg:top-10">
            {identity}
            <div className="mt-8">{cards}</div>
            <div className="hidden lg:block mt-8">{socials}</div>
          </div>

          {/* Main panel. Static column on desktop; a bottom sheet on mobile —
              kept mounted and translated so it can animate in and out. */}
          <div
            className={`
              fixed inset-x-0 bottom-0 z-40 max-h-[92vh] overflow-y-auto overscroll-contain
              transition-transform duration-300 ease-out
              ${panelOpen ? 'translate-y-0' : 'translate-y-full'}
              lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:translate-y-0 lg:transition-none
            `}
            role="dialog"
            aria-modal={panelOpen ? true : undefined}
            aria-label={activeLabel}
          >
            {panel}
          </div>

          {/* Mobile-only socials, below the cards. */}
          <div className="lg:hidden">{socials}</div>
        </div>

        <PageFooter chrome={chrome} />
      </div>

      {/* Scrim behind the mobile sheet. Fades with the same timing. */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 lg:hidden ${
          panelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setPanelOpen(false)}
        aria-hidden="true"
      />
    </div>
  );
}
