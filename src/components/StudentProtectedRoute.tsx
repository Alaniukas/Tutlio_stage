import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';

export default function StudentProtectedRoute() {
    const { user: ctxUser, profile: ctxProfile, loading: ctxLoading } = useUser();
    const [status, setStatus] = useState<'loading' | 'student' | 'none'>('loading');
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    // Allow rendering success UI right after Stripe redirect,
    // even if auth state isn't fully restored yet.
    const allowInvoiceSuccess = params.get('invoice_paid') === 'true';

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

            setStatus('loading');

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
                    supabase.rpc('get_student_by_user_id', { p_user_id: ctxUser.id }),
                    2500
                );

                const studentRows = result?.data;
                const rpcError = result?.error;

                if (rpcError) throw rpcError;

                const studentData = studentRows?.[0] ?? null;
                if (!cancelled) setStatus(studentData ? 'student' : 'none');
            } catch (err) {
                console.error('[StudentProtectedRoute] Error checking student status:', err);
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
            <div className="min-h-screen bg-[#f7f7fb] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (status === 'student') return <Outlet />;
    if (allowInvoiceSuccess) return <Outlet />;
    return <Navigate to="/login" replace />;
}
