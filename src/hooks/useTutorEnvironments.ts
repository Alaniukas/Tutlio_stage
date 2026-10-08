import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { clearTutorEnvironmentState, reloadTutorEnvironment } from '@/lib/tutorEnvironmentSession';
import { TutorEnvironmentError, type TutorEnvironment, type TutorEnvironmentErrorCode } from '@/lib/tutorEnvironments';

export async function requestTutorEnvironments(method = 'GET', body?: Record<string, string>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new TutorEnvironmentError('unauthorized');
  const response = await fetch('/api/tutor-environments', {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new TutorEnvironmentError(result.error || 'failed');
  return result;
}

export function useTutorEnvironments() {
  const { user, profile } = useUser();
  const [environments, setEnvironments] = useState<TutorEnvironment[]>([]);
  const [error, setError] = useState<TutorEnvironmentErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setEnvironments([]);
    setError(null);
    if (!user?.id || !profile?.organization_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void requestTutorEnvironments().then((result) => {
      if (!cancelled) setEnvironments(result.environments);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof TutorEnvironmentError ? err.code : 'failed');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, profile?.organization_id]);

  const switchEnvironment = useCallback(async (tutorId: string) => {
    if (busyRef.current || tutorId === user?.id) return;
    busyRef.current = true;
    setBusy(true);
    setSwitching(true);
    setError(null);
    try {
      const result = await requestTutorEnvironments('POST', { action: 'switch', tutorId });
      if (result.tutorId !== tutorId || !result.session?.access_token || !result.session?.refresh_token) {
        throw new TutorEnvironmentError('failed');
      }
      // Hide/unmount the old company's UI before a SIGNED_IN event can change
      // auth.uid() underneath its cached forms and background subscriptions.
      clearTutorEnvironmentState();
      const { data, error: authError } = await supabase.auth.setSession(result.session);
      if (authError || data.user?.id !== tutorId) throw new TutorEnvironmentError('failed');
      reloadTutorEnvironment();
    } catch (err) {
      setError(err instanceof TutorEnvironmentError ? err.code : 'failed');
      setSwitching(false);
      busyRef.current = false;
      setBusy(false);
    }
  }, [user?.id]);

  return {
    environments, error, loading, busy, switching,
    switchEnvironment,
    clearError: () => setError(null),
  };
}
