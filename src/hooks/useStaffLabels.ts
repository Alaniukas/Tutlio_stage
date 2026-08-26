import { useOrgEntityType } from '@/contexts/OrgEntityContext';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { staffNounKey, staffNounPluralKey } from '@/lib/schoolStaffLabels';
import { useTranslation } from '@/lib/i18n';

export function useStaffLabels() {
  const entity = useOrgEntityType();
  const { hasFeature } = useOrgFeatures();
  const { t } = useTranslation();
  const isSchool = entity === 'school' || hasFeature('school_teacher_labels');
  return {
    isSchool,
    staff: t(staffNounKey(isSchool)),
    staffPlural: t(staffNounPluralKey(isSchool)),
    student: t('role.student'),
  };
}
