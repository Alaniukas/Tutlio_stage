import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import type { TutorEnvironment, TutorEnvironmentErrorCode } from '@/lib/tutorEnvironments';

type Tutor = { id: string; full_name: string | null; email: string | null };

export default function AdminTutorEnvironmentsDialog({ tutor, organizationId, organizations, adminSecret, onClose }: {
  tutor: Tutor;
  organizationId: string;
  organizations: Array<{ id: string; name: string }>;
  adminSecret: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [environments, setEnvironments] = useState<TutorEnvironment[]>([]);
  const [otherOrganizationId, setOtherOrganizationId] = useState('');
  const [candidates, setCandidates] = useState<Tutor[]>([]);
  const [otherTutorId, setOtherTutorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TutorEnvironmentErrorCode | null>(null);
  const headers = { 'x-admin-secret': adminSecret, 'Content-Type': 'application/json' };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/admin-tutor-environments?tutorId=${encodeURIComponent(tutor.id)}`, {
      headers: { 'x-admin-secret': adminSecret }, cache: 'no-store',
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw result.error;
      if (!cancelled) setEnvironments(result.environments);
    }).catch(code => { if (!cancelled) setError(typeof code === 'string' ? code as TutorEnvironmentErrorCode : 'failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tutor.id, adminSecret]);

  useEffect(() => {
    let cancelled = false;
    setCandidates([]);
    setOtherTutorId('');
    if (!otherOrganizationId) { setCandidatesLoading(false); return; }
    setCandidatesLoading(true);
    void fetch(`/api/admin-organizations?id=${encodeURIComponent(otherOrganizationId)}`, {
      headers: { 'x-admin-secret': adminSecret }, cache: 'no-store',
    }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error();
      if (!cancelled) setCandidates(result.tutors || []);
    }).catch(() => { if (!cancelled) setError('failed'); })
      .finally(() => { if (!cancelled) setCandidatesLoading(false); });
    return () => { cancelled = true; };
  }, [otherOrganizationId, adminSecret]);

  const updateAccess = async (method: 'POST' | 'DELETE', target: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/admin-tutor-environments', { method, headers,
        body: JSON.stringify({ tutorId: tutor.id, otherTutorId: target }), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'failed'); return; }
      setEnvironments(result.environments);
      setOtherOrganizationId('');
    } catch { setError('failed'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={next => { if (!next && !busy) onClose(); }}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] rounded-2xl" hideClose={busy}>
        <DialogHeader>
          <DialogTitle>{t('tutorEnv.admin.title')}: {tutor.full_name || tutor.email}</DialogTitle>
          <DialogDescription>{t('tutorEnv.admin.hint')}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t(`tutorEnv.error.${error}`)}</p>}
        {loading ? <p role="status">{t('common.loadingDots')}</p> : (
          <div className="space-y-2">
            {environments.map(environment => (
              <div key={environment.tutorId} className="flex min-w-0 items-center gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{environment.organizationName}</p>
                  <p className="truncate text-xs text-gray-500">{environment.email}</p>
                </div>
                {environment.tutorId !== tutor.id && <button type="button" disabled={busy}
                  onClick={() => void updateAccess('DELETE', environment.tutorId)}
                  className="min-h-11 px-2 text-xs text-red-600 disabled:opacity-50">{t('tutorEnv.admin.remove')}</button>}
              </div>
            ))}
          </div>
        )}
        <form className="min-w-0 space-y-3 border-t pt-4" onSubmit={event => { event.preventDefault(); void updateAccess('POST', otherTutorId); }}>
          <label className="block text-sm font-medium text-gray-700">{t('tutorEnv.admin.organization')}
            <select required disabled={busy || loading} value={otherOrganizationId} onChange={event => setOtherOrganizationId(event.target.value)}
              className="mt-1 h-11 w-full min-w-0 rounded-lg border bg-white px-3">
              <option value="">—</option>
              {organizations.filter(org => org.id !== organizationId).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">{t('tutorEnv.admin.account')}
            <select required disabled={busy || !otherOrganizationId || candidatesLoading} value={otherTutorId} onChange={event => setOtherTutorId(event.target.value)}
              className="mt-1 h-11 w-full min-w-0 rounded-lg border bg-white px-3">
              <option value="">{candidatesLoading ? t('common.loadingDots') : '—'}</option>
              {candidates.filter(candidate => !environments.some(env => env.tutorId === candidate.id)).map(candidate => (
                <option key={candidate.id} value={candidate.id}>{candidate.full_name} ({candidate.email})</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || loading || !otherTutorId || candidatesLoading}
            className="min-h-11 w-full rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? t('common.saving') : t('tutorEnv.admin.assign')}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
