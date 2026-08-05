import { CircleCheck, Mail, Phone } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

/**
 * Student records feeding into one profile: three student nodes tethered by
 * curved connectors to the profile card below. Contact values are drawn as
 * redacted bars — the point is that the data lives in one place, not what it says.
 *
 * The node layer is a fixed 320x160 coordinate space so the SVG paths and the
 * absolutely-positioned avatars stay locked together at any width.
 */

const NODES = [
  { initials: 'GP', cx: 30, cy: 26, ring: '#86efac', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { initials: 'IM', cx: 138, cy: 82, ring: '#c4b5fd', bg: 'bg-violet-100', text: 'text-violet-700' },
  { initials: 'LR', cx: 292, cy: 48, ring: '#7dd3fc', bg: 'bg-sky-100', text: 'text-sky-700' },
] as const;

/** Node bottom → card top, in the same 320x160 space. */
const CONNECTORS = [
  { d: 'M30,47 C30,105 62,108 72,160', stroke: '#86efac' },
  { d: 'M138,103 C138,130 148,134 150,160', stroke: '#c4b5fd' },
  { d: 'M292,69 C292,120 248,114 238,160', stroke: '#7dd3fc' },
] as const;

const ROWS = [
  { labelKey: 'landing.v2.profileNotes', bar: 'w-16' },
  { labelKey: 'landing.v2.profileAttendance', bar: 'w-10' },
  { labelKey: 'landing.v2.profilePayments', bar: 'w-20' },
] as const;

export default function StudentProfileMockup() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-[380px]">
      {/* Node layer. */}
      <div className="relative aspect-[320/160] w-full">
        <svg
          viewBox="0 0 320 160"
          fill="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          {CONNECTORS.map((c) => (
            <path key={c.d} d={c.d} stroke={c.stroke} strokeWidth={2} strokeLinecap="round" />
          ))}
        </svg>

        {NODES.map((node) => (
          <span
            key={node.initials}
            className={`absolute flex items-center justify-center rounded-full text-[11px] font-semibold sm:text-xs ${node.bg} ${node.text}`}
            style={{
              left: `${(node.cx / 320) * 100}%`,
              top: `${(node.cy / 160) * 100}%`,
              width: `${(42 / 320) * 100}%`,
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 0 2px ${node.ring}`,
            }}
          >
            {node.initials}
          </span>
        ))}

        <span className="absolute left-[19%] top-[2%] rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 sm:text-[11px]">
          {t('landing.v2.pillAttendance')}
        </span>
        <span className="absolute right-[17%] top-[20%] whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700 sm:text-[11px]">
          {t('landing.v2.pillExam')}
        </span>
        <span className="absolute left-[49%] top-[46%] whitespace-nowrap rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 sm:text-[11px]">
          {t('landing.v2.pillLevel')}
        </span>
      </div>

      {/* Profile card. */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.2)] sm:p-6">
        <p className="font-display text-lg font-semibold text-zinc-900 sm:text-xl">
          {t('landing.v2.profileTitle')}
        </p>

        <div className="mt-4 flex items-center gap-3 sm:gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700 sm:h-14 sm:w-14">
            IM
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-zinc-900 sm:text-lg">
              Ieva Mockutė
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span aria-hidden className="h-2 w-20 rounded-full bg-zinc-200" />
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span aria-hidden className="h-2 w-24 rounded-full bg-zinc-200" />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4 sm:mt-5 sm:pt-5">
          {ROWS.map(({ labelKey, bar }) => (
            <div key={labelKey} className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-700 sm:text-base">{t(labelKey)}</p>
              <span aria-hidden className={`h-2 shrink-0 rounded-full bg-zinc-200 ${bar}`} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-700 sm:text-base">{t('landing.v2.profileParent')}</p>
            <CircleCheck className="h-5 w-5 shrink-0 text-zinc-900" />
          </div>
        </div>
      </div>
    </div>
  );
}
