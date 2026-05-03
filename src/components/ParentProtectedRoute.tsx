import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';

const PARENT_PROFILE_CACHE_PREFIX = 'tutlio_parent_profile_id_for_';
const RETRY_DELAYS_MS = [400, 1200, 3000];

function readParentCache(userId: string): string | null {
    try {
        return localStorage.getItem(`${PARENT_PROFILE_CACHE_PREFIX}${userId}`);
    } catch {
        return null;
    }
}

function writeParentCache(userId: string, profileId: string | null) {
    try {
        if (profileId) {
            localStorage.setItem(`${PARENT_PROFILE_CACHE_PREFIX}${userId}`, profileId);
        } else {
            localStorage.removeItem(`${PARENT_PROFILE_CACHE_PREFIX}${userId}`);
        }
    } catch {
        // ignore
    }
}

export default function ParentProtectedRoute() {
    const { user: ctxUser, loading: ctxLoading } = useUser();
    const [status, setStatus] = useState<'loading' | 'parent' | 'none'>('loading');
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;

        const setIfNotCancelled = (next: 'loading' | 'parent' | 'none') => {
            if (!cancelledRef.current) setStatus(next);
        };

        const run = async () => {
            if (ctxLoading) {
                setIfNotCancelled('loading');
                return;
            }
            if (!ctxUser) {
                setIfNotCancelled('none');
                return;
            }

            // Optimistic: if we cached a parent profile id for this user before,
            // immediately allow the route while we re-verify in the background.
            const cached = readParentCache(ctxUser.id);
            if (cached) {
                setIfNotCancelled('parent');
            } else {
                setIfNotCancelled('loading');
            }

            // Retry the RPC a few times with backoff to absorb transient network/RLS errors.
            // Only redirect to /login when the RPC clearly returns "no parent" (no error + null).
            for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt += 1) {
                if (cancelledRef.current) return;
                try {
                    const { data, error } = await supabase
                        .rpc('get_parent_profile_id_by_user_id', { p_user_id: ctxUser.id });

                    if (cancelledRef.current) return;

                    if (!error) {
                        if (data) {
                            writeParentCache(ctxUser.id, String(data));
                            setIfNotCancelled('parent');
                        } else {
                            // Definitive "no parent profile" — clear cache and bounce to login.
                            writeParentCache(ctxUser.id, null);
                            setIfNotCancelled('none');
                        }
                        return;
                    }

                    console.warn(
                        `[ParentProtectedRoute] RPC error attempt ${attempt + 1}:`,
                        error.message,
                    );
                } catch (err) {
                    console.warn(
                        `[ParentProtectedRoute] RPC threw attempt ${attempt + 1}:`,
                        err,
                    );
                }

                const delay = RETRY_DELAYS_MS[attempt];
                if (delay == null) break;
                await new Promise((r) => setTimeout(r, delay));
            }

            // All attempts failed (network/server). Trust the cache if we have it,
            // otherwise stay in loading rather than redirecting — the user's actual
            // queries will surface a clearer error if there is no parent profile.
            if (!cancelledRef.current) {
                if (cached) {
                    setIfNotCancelled('parent');
                } else {
                    setIfNotCancelled('loading');
                }
            }
        };

        void run();
        return () => {
            cancelledRef.current = true;
        };
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
