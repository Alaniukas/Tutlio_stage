import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';

type Denial = { id: string; email: string; created_at: string };

const ERROR_KEYS: Record<string, string> = {
  recording_access_invalid_email: 'school.recordings.access.invalidEmail',
  recording_access_person_not_in_school: 'school.recordings.access.personNotInSchool',
  recording_access_setup_required: 'school.recordings.access.setupRequired',
};

export default function RecordingAccessPanel() {
  const { t } = useTranslation();
  const [denials, setDenials] = useState<Denial[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/school-recording-access', { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDenials(result.denials || []);
      setError('');
    } catch (loadError) {
      setError(t(ERROR_KEYS[(loadError as Error)?.message] || 'school.recordings.access.failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const changeAccess = async (action: 'revoke' | 'restore', denialId?: string) => {
    setBusyId(denialId || 'revoke');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/school-recording-access', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(action === 'revoke' ? { action, email } : { action, denialId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === 'revoke') setEmail('');
      setMessage(t(action === 'revoke' ? 'school.recordings.access.revoked' : 'school.recordings.access.restored'));
      await load();
    } catch (changeError) {
      setError(t(ERROR_KEYS[(changeError as Error)?.message] || 'school.recordings.access.failed'));
    } finally {
      setBusyId(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busyId && email.trim()) void changeAccess('revoke');
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-gray-900">
          <Shield className="h-4 w-4 text-[var(--org-brand)]" />
          {t('school.recordings.access.title')}
        </h2>
        <p className="mt-2 text-sm text-gray-600">{t('school.recordings.access.scopeHelp')}</p>
        <p className="mt-1 text-xs text-amber-800">{t('school.recordings.access.legacyHelp')}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="recording-access-email">{t('school.recordings.access.email')}</Label>
          <Input id="recording-access-email" type="email" required value={email}
            onChange={(event) => setEmail(event.target.value)} disabled={busyId !== null}
            autoComplete="off" />
        </div>
        <Button type="submit" variant="outline" disabled={loading || busyId !== null || !email.trim()}>
          {busyId === 'revoke' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('school.recordings.access.revoke')}
        </Button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {loading ? <p className="text-sm text-gray-500">{t('common.loading')}</p>
        : !denials.length ? <p className="text-sm text-gray-500">{t('school.recordings.access.empty')}</p>
        : (
          <ul className="divide-y divide-gray-100">
            {denials.map((denial) => (
              <li key={denial.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-sm text-gray-800 break-all">{denial.email}</span>
                <Button type="button" size="sm" variant="outline" disabled={busyId !== null}
                  onClick={() => void changeAccess('restore', denial.id)}>
                  {busyId === denial.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('school.recordings.access.restore')}
                </Button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
