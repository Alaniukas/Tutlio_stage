import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '@/lib/apiHelpers';
import { isProKlaseOrg } from '@/lib/marketMoney';
import type { StudentRegistrationState } from '@/lib/studentRegistration';

export function useStudentRegistrationStatus(organizationId: string | null | undefined, revision = '') {
  const [result, setResult] = useState<{ organizationId: string; enabled: boolean; states: StudentRegistrationState[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    let running = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (running || cancelled || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const response = await fetch('/api/student-registration-status', {
          headers: await authHeaders(), signal: controller.signal, cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) {
          if (!cancelled && data.enabled === true) setResult((previous) => ({
            organizationId, enabled: true, states: previous?.organizationId === organizationId ? previous.states : [],
          }));
          throw new Error('Registration status unavailable');
        }
        if (!cancelled) {
          setResult({ organizationId, enabled: data.enabled === true, states: Array.isArray(data.states) ? data.states : [] });
          if (data.enabled !== true) window.clearInterval(timer);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally { running = false; }
    };
    const timer = window.setInterval(() => void refresh(), 60_000);
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [organizationId, revision]);
  const current = result?.organizationId === organizationId ? result : null;
  const byStudentId = useMemo(() => new Map(current?.states.map((row) => [row.student_id, row]) || []), [current]);
  return {
    enabled: current?.enabled ?? isProKlaseOrg(organizationId),
    states: current?.states || [], byStudentId, error,
  };
}
