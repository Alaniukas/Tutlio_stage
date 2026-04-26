import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';

export default function ParentProtectedRoute() {
    const { user: ctxUser, loading: ctxLoading } = useUser();
    const [status, setStatus] = useState<'loading' | 'parent' | 'none'>('loading');

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            if (ctxLoading) { setStatus('loading'); return; }
            if (!ctxUser) { setStatus('none'); return; }

            setStatus('loading');
            try {
                const { data } = await supabase
                    .from('parent_profiles')
                    .select('id')
                    .eq('user_id', ctxUser.id)
                    .maybeSingle();
                if (!cancelled) setStatus(data ? 'parent' : 'none');
            } catch {
                if (!cancelled) setStatus('none');
            }
        };

        void run();
        return () => { cancelled = true; };
    }, [ctxLoading, ctxUser?.id]);

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-[#f7f7fb] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (status === 'parent') return <Outlet />;
    return <Navigate to="/login" replace />;
}
