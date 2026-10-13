import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { isRegistrationOverdue, type StudentRegistrationState } from '@/lib/studentRegistration';
import { registrationText } from '@/lib/studentRegistrationCopy';

export default function StudentRegistrationAlert({ states, error, showLink = false }: {
  states: StudentRegistrationState[]; error?: boolean; showLink?: boolean;
}) {
  const { locale, t } = useTranslation();
  const overdue = states.filter((row) => isRegistrationOverdue(row));
  const names = [...new Set(overdue.map((row) => row.full_name).filter(Boolean))];
  if (!error && !overdue.length) return null;
  return (
    <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{registrationText(locale, error ? 'error' : 'overdue')}</p>
        {!error && <>
          <p className="mt-1">{registrationText(locale, 'adminHint')}</p>
          <p className="mt-1 font-medium">{names.slice(0, 5).join(', ')}{names.length > 5 ? ` (+${names.length - 5})` : ''}</p>
        </>}
        {showLink && <Link className="mt-2 inline-block font-semibold underline" to="/company/students?registration=pending">{t('nav.students')}</Link>}
      </div>
    </div>
  );
}
