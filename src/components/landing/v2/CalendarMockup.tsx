import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { LandingAudience } from './audience';
import { AvatarStack, MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';

/**
 * Hand-built week calendar for the "calendar built for tutors" card: a
 * simplified product surface in the landing's own visual language rather
 * than a screenshot of a real account. Sample lessons, as on any product
 * mock. Rows are fixed-height so the card can crop the bottom edge.
 */
const ROWS = 14; // 30-minute rows from 09:00
const ROW_PX = 26;
const FIRST_HOUR = 9;
const TODAY = 3; // Thursday

interface Lesson {
  day: number;
  start: number;
  span: number;
  subjectKey: string;
  tone: string;
  person: number;
  group?: boolean;
}

const LESSONS: Lesson[] = [
  { day: 0, start: 0, span: 2, subjectKey: 'landing.v2.demo.subjectEnglish', tone: 'border-sky-400 bg-sky-50 text-sky-900', person: 1 },
  { day: 0, start: 5, span: 2, subjectKey: 'landing.v2.demo.subjectBiology', tone: 'border-emerald-400 bg-emerald-50 text-emerald-900', person: 2 },
  { day: 1, start: 1, span: 2, subjectKey: 'landing.v2.demo.subjectPhysics', tone: 'border-violet-400 bg-violet-50 text-violet-900', person: 2 },
  { day: 1, start: 6, span: 2, subjectKey: 'landing.v2.demo.subjectChemistry', tone: 'border-teal-400 bg-teal-50 text-teal-900', person: 3 },
  { day: 2, start: 2, span: 2, subjectKey: 'landing.v2.demo.subjectHistory', tone: 'border-rose-400 bg-rose-50 text-rose-900', person: 0 },
  { day: 2, start: 7, span: 2, subjectKey: 'landing.v2.demo.subjectEnglish', tone: 'border-sky-400 bg-sky-50 text-sky-900', person: 1 },
  { day: 3, start: 0, span: 3, subjectKey: 'landing.v2.demo.subjectMath', tone: 'border-orange-400 bg-orange-50 text-orange-900', person: 0, group: true },
  { day: 3, start: 5, span: 2, subjectKey: 'landing.v2.demo.subjectEnglish', tone: 'border-sky-400 bg-sky-50 text-sky-900', person: 1 },
  { day: 4, start: 1, span: 2, subjectKey: 'landing.v2.demo.subjectMath', tone: 'border-orange-400 bg-orange-50 text-orange-900', person: 0 },
  { day: 4, start: 6, span: 2, subjectKey: 'landing.v2.demo.subjectBiology', tone: 'border-emerald-400 bg-emerald-50 text-emerald-900', person: 2 },
];

const TUTOR_SEEDS = ['rasa-a', 'tomas-k', 'inga-j', 'mantas-k'] as const;
const STUDENT_SEEDS = ['emilija-m', 'lukas-k', 'sofija-g', 'jonas-p'] as const;
const GROUP_SEEDS = ['emilija-m', 'lukas-k', 'sofija-g'] as const;
const DATES = ['10', '11', '12', '13', '14'] as const;

export default function CalendarMockup({ audience }: { audience: LandingAudience }) {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const isSolo = audience === 'solo';
  const weekdays = t('landing.v2.demo.weekdays').split('|').slice(0, 5);
  const people = (isSolo ? STUDENT_SEEDS : TUTOR_SEEDS).map((seed, index) => ({
    seed,
    name: isSolo ? personas.students[index] : personas.tutors[index],
  }));
  const groupStudents = GROUP_SEEDS.map((seed, index) => ({ seed, name: personas.students[index] }));

  return (
    <div className="flex h-full w-full flex-col bg-white text-zinc-900">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">{t('landing.feature.calendar')}</p>
            <p className="truncate text-[10px] text-zinc-500">
              {isSolo ? t('landing.v2.demo.weekLong') : t('landing.v2.demo.schoolWeek')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-0.5 rounded-lg border border-zinc-200 p-0.5 sm:flex">
            <ChevronLeft className="h-3.5 w-3.5 text-zinc-400" />
            <span className="px-1.5 text-[10px] font-medium text-zinc-600">{t('landing.v2.demo.weekShort')}</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
          </span>
          <span className="hidden rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 sm:inline">
            {t('landing.v2.demo.waitingCount', { count: 3 })}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[10px] font-semibold text-white">
            <Plus className="h-3 w-3" />
            {t('landing.v2.demo.addLesson').replace(/^\+\s*/, '')}
          </span>
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: '40px repeat(5, minmax(0, 1fr))',
          gridTemplateRows: `30px repeat(${ROWS}, ${ROW_PX}px)`,
        }}
      >
        {/* Day header. */}
        <div className="border-b border-e border-zinc-100 bg-zinc-50" style={{ gridColumn: 1, gridRow: 1 }} />
        {weekdays.map((day, index) => (
          <div
            key={day}
            className={`flex items-center justify-center gap-1 border-b border-zinc-100 bg-zinc-50 ${index < 4 ? 'border-e' : ''}`}
            style={{ gridColumn: index + 2, gridRow: 1 }}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">{day}</span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                index === TODAY ? 'bg-orange-500 text-white' : 'text-zinc-700'
              }`}
            >
              {DATES[index]}
            </span>
          </div>
        ))}

        {/* Time grid. */}
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={`row-${row}`} className="contents">
            <div
              className="flex items-start justify-end border-e border-zinc-100 pe-1.5 pt-0.5"
              style={{ gridColumn: 1, gridRow: row + 2 }}
            >
              {row % 2 === 0 && (
                <span className="text-[8px] font-medium tabular-nums text-zinc-400">
                  {String(FIRST_HOUR + row / 2).padStart(2, '0')}:00
                </span>
              )}
            </div>
            {weekdays.map((day, col) => (
              <div
                key={`${day}-${row}`}
                className={`${col < 4 ? 'border-e' : ''} ${row % 2 === 1 ? 'border-b border-zinc-100' : 'border-b border-dashed border-zinc-100/80'} ${
                  col === TODAY ? 'bg-orange-50/30' : ''
                }`}
                style={{ gridColumn: col + 2, gridRow: row + 2 }}
              />
            ))}
          </div>
        ))}

        {/* Lessons. */}
        {LESSONS.map((lesson) => {
          const person = people[lesson.person];
          return (
            <div
              key={`${lesson.day}-${lesson.start}`}
              className={`z-10 m-0.5 flex min-w-0 flex-col justify-between overflow-hidden rounded-md border-s-[3px] px-1.5 py-1 shadow-sm ${lesson.tone}`}
              style={{ gridColumn: lesson.day + 2, gridRow: `${lesson.start + 2} / span ${lesson.span}` }}
            >
              <p className="truncate text-[9px] font-semibold leading-tight sm:text-[10px]">{t(lesson.subjectKey)}</p>
              {lesson.group ? (
                <div className="flex items-center gap-1">
                  <AvatarStack people={groupStudents} size="xs" max={3} />
                  <span className="truncate text-[8px] opacity-70">{t('landing.v2.demo.groupLessons')}</span>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-1">
                  <MiniAvatar seed={person.seed} alt={person.name} size="xs" />
                  <span className="truncate text-[8px] opacity-80">{person.name}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
