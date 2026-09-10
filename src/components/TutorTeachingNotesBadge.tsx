import { cn } from '@/lib/utils';

type TutorTeachingNotesBadgeProps = {
  notes?: string | null;
  className?: string;
};

/** Compact subjects/grades note shown beside a tutor's name in admin pickers. */
export default function TutorTeachingNotesBadge({ notes, className }: TutorTeachingNotesBadgeProps) {
  const text = String(notes || '').trim();
  if (!text) return null;

  return (
    <span
      className={cn(
        'inline-flex max-w-[16rem] shrink-0 truncate rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-white',
        className,
      )}
      title={text}
    >
      {text}
    </span>
  );
}
