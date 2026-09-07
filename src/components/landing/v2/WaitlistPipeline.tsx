import { Check } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { getLandingDemoPersonas } from './demoPersonas';

/**
 * The waitlist lifecycle as a three-column board: students queue for a taken
 * slot, the next in line is offered it automatically when someone cancels, and
 * the claimed slot becomes a booking. Mirrors src/pages/Waitlist.tsx.
 */

type Entry = { nameIndex: number; subject: string; whenKey: string };

const COLUMNS: { key: string; titleKey: string; dot: string; entries: Entry[]; done?: boolean }[] = [
  {
    key: 'waiting',
    titleKey: 'landing.v2.wlWaiting',
    dot: 'bg-amber-400',
    entries: [
      { nameIndex: 0, subject: 'landing.v2.wlSubjMath', whenKey: 'landing.v2.wlJustNow' },
      { nameIndex: 1, subject: 'landing.v2.wlSubjEng', whenKey: 'landing.v2.wlAgo1h' },
      { nameIndex: 2, subject: 'landing.v2.wlSubjPhys', whenKey: 'landing.v2.wlAgo2h' },
    ],
  },
  {
    key: 'offered',
    titleKey: 'landing.v2.wlOffered',
    dot: 'bg-blue-400',
    entries: [{ nameIndex: 3, subject: 'landing.v2.wlSubjMath', whenKey: 'landing.v2.wlAgo2h' }],
  },
  {
    key: 'booked',
    titleKey: 'landing.v2.wlBooked',
    dot: 'bg-emerald-400',
    done: true,
    entries: [
      { nameIndex: 4, subject: 'landing.v2.wlSubjPhys', whenKey: 'landing.v2.wlAgo2h' },
      { nameIndex: 5, subject: 'landing.v2.wlSubjEng', whenKey: 'landing.v2.wlAgo3h' },
      { nameIndex: 6, subject: 'landing.v2.wlSubjMath', whenKey: 'landing.v2.wlAgo3h' },
    ],
  },
];

export default function WaitlistPipeline() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const names = [
    personas.students[0],
    personas.tutors[1],
    personas.students[2],
    personas.profileStudent,
    personas.students[1],
    personas.children[3],
    personas.students[3],
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <p className="font-display text-sm font-semibold text-zinc-900 sm:text-base">
            {t('landing.v2.wlPipeline')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <p className="text-[11px] font-medium text-emerald-600 sm:text-xs">
            {t('landing.v2.wlAutoOffer')}
          </p>
        </div>
      </div>

      {/* Three columns don't fit 375px legibly, so below sm the board scrolls
          sideways the way a real kanban does instead of shrinking to ellipses. */}
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto p-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-x-visible sm:p-5">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className="flex min-h-[220px] w-[136px] shrink-0 flex-col rounded-xl bg-zinc-50 p-2 sm:w-auto sm:min-w-0 sm:p-3"
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${col.dot}`} />
                <p className="truncate text-[11px] font-semibold text-zinc-700 sm:text-xs">
                  {t(col.titleKey)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-1.5 text-[10px] font-semibold text-zinc-500 shadow-sm sm:text-[11px]">
                {col.entries.length}
              </span>
            </div>

            <div className="mt-2 space-y-2 sm:mt-3">
              {col.entries.map((entry) => (
                <div
                  key={`${col.key}-${entry.nameIndex}`}
                  className={`rounded-lg border p-2 sm:p-2.5 ${
                    col.done ? 'border-emerald-100 bg-emerald-50/60' : 'border-zinc-100 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <p className="min-w-0 truncate text-[11px] font-semibold text-zinc-900 sm:text-xs">
                      {names[entry.nameIndex]}
                    </p>
                    {col.done && <Check className="h-3 w-3 shrink-0 text-emerald-600" strokeWidth={3} />}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-600 sm:text-[10px]">
                      {t(entry.subject)}
                    </span>
                    {/* Dropped on mobile so the subject chip keeps its words. */}
                    <span className="hidden shrink-0 text-[9px] text-zinc-400 sm:inline sm:text-[10px]">
                      {t(entry.whenKey)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
