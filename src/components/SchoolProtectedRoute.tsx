import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';

export default function SchoolProtectedRoute() {
  const { user: ctxUser, loading: ctxLoading } = useUser();
  const [status, setStatus] = useState<'loading' | 'admin' | 'none'>('loading');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (ctxLoading) {
        setStatus('loading');
        return;
      }
      if (!ctxUser) {
        setStatus('none');
        return;
      }

      try {
        const withTimeout = async <T,>(p: any, ms: number): Promise<T> => {
          let t: any;
          const timeout = new Promise<never>((_, reject) => {
            t = setTimeout(() => reject(new Error('Auth guard timeout')), ms);
          });
          try {
            return await Promise.race([Promise.resolve(p) as Promise<T>, timeout]);
          } finally {
            if (t) clearTimeout(t);
          }
        };

        const result = await withTimeout<any>(
          supabase
            .from('school_admins')
            .select('id')
            .eq('user_id', ctxUser.id)
            .maybeSingle(),
          2500,
        );

        const isAdmin = !!result?.data;
        if (!cancelled) setStatus(isAdmin ? 'admin' : 'none');
      } catch (err) {
        console.error('[SchoolProtectedRoute] check error:', err);
        if (!cancelled) setStatus('none');
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [ctxLoading, ctxUser?.id]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#f4f5f9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return status === 'admin' ? <Outlet /> : <Navigate to="/school/login" replace />;
}
