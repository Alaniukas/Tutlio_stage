import type { ClassGroupCancelScope } from '@/lib/schoolClassGroupSessions';
import { useTranslation } from '@/lib/i18n';

export type ClassGroupCancelStudentOption = {
  student_id: string;
  name: string;
};

export function ClassGroupCancelScopeFields({
  scope,
  onScopeChange,
  studentId,
  onStudentIdChange,
  students,
  radioName,
}: {
  scope: ClassGroupCancelScope;
  onScopeChange: (scope: ClassGroupCancelScope) => void;
  studentId: string;
  onStudentIdChange: (studentId: string) => void;
  students: ClassGroupCancelStudentOption[];
  radioName: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium text-gray-800">{t('cal.cancelClassGroupChoiceDesc')}</p>
      <label className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
        <input
          type="radio"
          name={radioName}
          checked={scope === 'whole_occurrence'}
          onChange={() => onScopeChange('whole_occurrence')}
          className="mt-1 shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-900">{t('cal.cancelWholeGroup')}</span>
          <span className="mt-0.5 block text-xs leading-snug text-gray-500">{t('cal.cancelWholeGroupDesc')}</span>
        </span>
      </label>
      <label className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
        <input
          type="radio"
          name={radioName}
          checked={scope === 'one_student'}
          onChange={() => onScopeChange('one_student')}
          className="mt-1 shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-900">{t('cal.cancelOneStudent')}</span>
          <span className="mt-0.5 block text-xs leading-snug text-gray-500">{t('cal.cancelOneStudentDesc')}</span>
        </span>
      </label>
      {scope === 'one_student' && (
        <div className="min-w-0">
          <label className="text-xs font-semibold text-gray-700" htmlFor={`${radioName}-student`}>
            {t('cal.cancelPickStudent')}
          </label>
          <select
            id={`${radioName}-student`}
            value={studentId}
            onChange={(e) => onStudentIdChange(e.target.value)}
            className="mt-1 w-full min-w-0 max-w-full rounded-lg border border-gray-200 p-2 text-sm"
          >
            {students.map((row) => (
              <option key={row.student_id} value={row.student_id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
