import { useTranslation } from '@/lib/i18n';

export type StudentConnectionRow = {
  linked_user_id?: string | null;
  parent_students?: { parent_id: string }[];
};

/** Account links, not live online presence. Aggregate only rows for the same child. */
export function StudentConnectionStatus({ students }: { students: StudentConnectionRow[] }) {
  const { t } = useTranslation();
  const childConnected = students.some((student) => Boolean(student.linked_user_id));
  const parentConnected = students.some((student) => (student.parent_students?.length ?? 0) > 0);
  const parentsLoaded = students.length > 0 && students.every((student) => Array.isArray(student.parent_students));
  const badgeClass = (connected: boolean) =>
    `inline-flex rounded-md border px-2 py-0.5 text-[11px] ${connected
      ? 'border-green-200 bg-green-50 text-green-700'
      : 'border-gray-200 bg-gray-50 text-gray-600'}`;

  return (
    <span className="inline-flex flex-wrap items-center gap-1" title={t('stu.connectionHint')}>
      <span className={badgeClass(childConnected)}>
        {t(childConnected ? 'stu.childConnected' : 'stu.childNotConnected')}
      </span>
      <span className={badgeClass(parentConnected)}>
        {t(parentConnected ? 'stu.parentConnected' : parentsLoaded ? 'stu.parentNotConnected' : 'stu.parentConnectionUnknown')}
      </span>
    </span>
  );
}
