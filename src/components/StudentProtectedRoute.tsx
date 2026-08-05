import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { resolveAccountPortals, setLastRolePortal, type AccountPortals } from '@/lib/account-portal';
import { rpcGetStudentByUserIdDeduped } from '@/lib/preload';
import { useUser } from '@/contexts/UserContext';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function resolveStudentWithRetry(userId: string, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
        const result = await rpcGetStudentByUserIdDeduped(userId);
        if (result?.error) throw result.error;
        if (result?.data?.[0]) return result;
        if (i < attempts - 1) await sleep(350 * (i + 1));
    }
    return null;
}

export default function StudentProtectedRoute() {
    const { user: ctxUser, profile: ctxProfile, loading: ctxLoading } = useUser();
    const [status, setStatus] = useState<'loading' | 'student' | 'tutor' | 'parent' | 'none'>('loading');
    const [isFrozen, setIsFrozen] = useState(false);
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    // Allow rendering success UI right after Stripe redirect,
    // even if auth state isn't fully restored yet.
    const allowInvoiceSuccess = params.get('invoice_paid') === 'true';

    useEffect(() => {
        setLastRolePortal('student');
    }, []);

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

                const portals = await withTimeout<AccountPortals>(
                    resolveAccountPortals(ctxUser.id),
                    2500,
                );

                if (portals.tutor && !portals.student) {
                    const retryResult = await withTimeout<any>(
                        resolveStudentWithRetry(ctxUser.id, 3),
                        4000,
                    );
                    const retryStudent = retryResult?.data?.[0] ?? null;
                    if (retryStudent) {
                        if (!cancelled) {
                            setStatus('student');
                            setIsFrozen(!!retryStudent.detached_at);
                        }
                        return;
                    }
                    if (!cancelled) setStatus('tutor');
                    return;
                }
                if (portals.parent && !portals.student) {
                    if (!cancelled) setStatus('parent');
                    return;
                }

                const result = await withTimeout<any>(rpcGetStudentByUserIdDeduped(ctxUser.id), 2500);

                const studentRows = result?.data;
                const rpcError = result?.error;

                if (rpcError) throw rpcError;

                const studentData = studentRows?.[0] ?? null;
                if (!cancelled) {
                    setStatus(studentData ? 'student' : 'none');
                    setIsFrozen(!!studentData?.detached_at);
                }
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

    if (status === 'tutor') return <Navigate to="/dashboard" replace />;
    if (status === 'parent') return <Navigate to="/parent" replace />;

    if (status === 'student') return (
        <>
            {isFrozen && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800 font-medium">
                    Your account is currently frozen. You can view your data but cannot make changes.
                </div>
            )}
            <Outlet context={{ isFrozen }} />
        </>
    );
    if (allowInvoiceSuccess) return <Outlet />;
    return <Navigate to="/login" replace />;
}
