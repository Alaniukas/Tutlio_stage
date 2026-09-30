import { useId } from 'react';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { formatLocalYmd } from '@/lib/monthlyPackagePlan';
import type { StudentNotesDraft } from '@/lib/studentNotes';

type Props = {
  value: StudentNotesDraft;
  onChange: (value: StudentNotesDraft) => void;
  disabled?: boolean;
};

export default function StudentNotesFields({ value, onChange, disabled = false }: Props) {
  const id = useId();
  const { t } = useTranslation();
  const textareaClass = 'w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y disabled:opacity-50';
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('compStu.adminNotesTitle')}</h4>
        <div className="space-y-2 sm:max-w-sm">
          <Label htmlFor={`${id}-contacted`}>{t('compStu.lastContactedAt')}</Label>
          <div className="flex items-center gap-2">
            <DateInput id={`${id}-contacted`} value={value.last_contacted_at} max={formatLocalYmd(new Date())}
              disabled={disabled} onChange={(event) => onChange({ ...value, last_contacted_at: event.target.value })} />
            {value.last_contacted_at && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled}
                onClick={() => onChange({ ...value, last_contacted_at: '' })}>{t('compStu.clearContactDate')}</Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-admin`}>{t('compStu.adminNotesTitle')}</Label>
          <textarea id={`${id}-admin`} value={value.admin_comment} rows={3} disabled={disabled}
            className={textareaClass} placeholder={t('compStu.commentPlaceholder')}
            onChange={(event) => onChange({ ...value, admin_comment: event.target.value })} />
          <p className="text-xs text-gray-500">{t('compStu.commentVisibleAdmin')}</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-tutor`}>{t('compStu.tutorComment')}</Label>
        <textarea id={`${id}-tutor`} value={value.tutor_comment} rows={3} disabled={disabled}
          className={textareaClass} placeholder={t('compStu.tutorCommentPlaceholder')}
          onChange={(event) => onChange({ ...value, tutor_comment: event.target.value })} />
        <p className="text-xs text-gray-500">{t('compStu.tutorCommentHint')}</p>
      </div>
    </div>
  );
}
