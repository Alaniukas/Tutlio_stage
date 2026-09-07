import { CircleCheck, Mail, Phone } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { demoAvatarUrl, MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';

/**
 * Student records feeding into one profile: three student nodes tethered by
 * curved connectors to the profile card below. Filled with sample data so the
 * mock reads as a real student record, not a wireframe.
 *
 * The node layer is a fixed 320x160 coordinate space so the SVG paths and the
 * absolutely-positioned avatars stay locked together at any width.
 */

const NODES = [
  { seed: 'gabija-profile', nameIndex: 0, cx: 30, cy: 26, ring: '#86efac', bg: 'dcfce7' },
  { seed: 'ieva-profile', nameIndex: 1, cx: 138, cy: 82, ring: '#c4b5fd', bg: 'ede9fe' },
  { seed: 'lukas-profile', nameIndex: 2, cx: 292, cy: 48, ring: '#7dd3fc', bg: 'e0f2fe' },
] as const;

/** Node bottom → card top, in the same 320x160 space. */
const CONNECTORS = [
  { d: 'M30,47 C30,105 62,108 72,160', stroke: '#86efac' },
  { d: 'M138,103 C138,130 148,134 150,160', stroke: '#c4b5fd' },
  { d: 'M292,69 C292,120 248,114 238,160', stroke: '#7dd3fc' },
] as const;

const ROWS = [
  { labelKey: 'landing.v2.profileNotes', valueKey: 'landing.v2.demo.profileNoteValue' },
  { labelKey: 'landing.v2.profileAttendance', value: '97 % (28/29)' },
  { labelKey: 'landing.v2.profilePayments', valueKey: 'landing.v2.demo.profilePaymentsValue' },
] as const;

export default function StudentProfileMockup() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const nodeNames = [personas.students[0], personas.profileStudent, personas.students[1]];

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
          <img
            key={node.seed}
            src={demoAvatarUrl(node.seed, node.bg)}
            alt={nodeNames[node.nameIndex]}
            loading="lazy"
            decoding="async"
            className="absolute rounded-full bg-white object-cover"
            style={{
              left: `${(node.cx / 320) * 100}%`,
              top: `${(node.cy / 160) * 100}%`,
              width: `${(42 / 320) * 100}%`,
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 0 2px ${node.ring}`,
            }}
          />
        ))}

        <span className="absolute left-[19%] top-[2%] inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 shadow-sm sm:text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t('landing.v2.pillAttendance')}
        </span>
        <span className="absolute right-[17%] top-[20%] whitespace-nowrap rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 shadow-sm sm:text-[11px]">
          {t('landing.v2.pillExam')}
        </span>
        <span className="absolute left-[49%] top-[46%] whitespace-nowrap rounded-full border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 shadow-sm sm:text-[11px]">
          {t('landing.v2.pillLevel')}
        </span>
      </div>

      {/* Profile card. */}
      <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.2)] sm:p-6">
        <p className="font-display text-lg font-semibold text-zinc-900 sm:text-xl">
          {t('landing.v2.profileTitle')}
        </p>

        <div className="mt-4 flex items-center gap-3 sm:gap-4">
          <MiniAvatar seed="ieva-profile" alt={personas.profileStudent} size="lg" ring className="!h-12 !w-12 sm:!h-14 sm:!w-14" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-zinc-900 sm:text-lg">
              {personas.profileStudent}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate text-xs text-zinc-600 sm:text-sm">{personas.profilePhone}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate text-xs text-zinc-600 sm:text-sm">{personas.profileEmail}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4 sm:mt-5 sm:pt-5">
          {ROWS.map((row) => (
            <div key={row.labelKey} className="flex items-center justify-between gap-3">
              <p className="shrink-0 text-sm text-zinc-700 sm:text-base">{t(row.labelKey)}</p>
              <p className="truncate text-right text-sm font-medium text-zinc-900 sm:text-base">
                {'valueKey' in row ? t(row.valueKey) : row.value}
              </p>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-700 sm:text-base">{t('landing.v2.profileParent')}</p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900">
              <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              {t('landing.v2.profileParentActive')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
