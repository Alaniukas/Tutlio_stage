import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { hasActiveSubscription, tutorHasPlatformSubscriptionAccess } from '@/lib/subscription';
import { ensureTutorPresetSubjects } from '@/lib/ensureTutorPresetSubjects';
import { useUser } from '@/contexts/UserContext';

export default function ProtectedRoute() {
  const location = useLocation();
  const { user: ctxUser, profile: ctxProfile, loading: ctxLoading } = useUser();
  const [status, setStatus] = useState<'loading' | 'tutor' | 'org_admin' | 'student' | 'none' | 'needs_subscription'>('loading');
  const [redirectToSubscription, setRedirectToSubscription] = useState(false);
  const resolvedForUserRef = useRef<string | null>(null);

  const isDashboard = location.pathname === '/dashboard';
  const isDashboardWithSuccess = isDashboard && new URLSearchParams(location.search).get('subscription_success') === '1';

  // Recheck subscription when needs_subscription and on dashboard
  useEffect(() => {
    if (status !== 'needs_subscription' || !isDashboard) return;
    setRedirectToSubscription(false);
    const recheck = async () => {
      if (!ctxUser) return;
      const { data: { session } } = await supabase.auth.getSession();
      let hasAccess = false;
      if (session?.access_token) {
        try {
          const res = await fetch('/api/refresh-my-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          });
          const data = res.ok ? await res.json().catch(() => null) : null;
          if (hasActiveSubscription(data?.subscription_status) || ['canceled', 'past_due', 'unpaid'].includes(data?.subscription_status || '')) hasAccess = true;
        } catch (_) {}
      }
      if (!hasAccess) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_status, organization_id, manual_subscription_exempt')
          .eq('id', ctxUser.id)
          .single();
        hasAccess = tutorHasPlatformSubscriptionAccess(profile);
      }
      if (hasAccess) setStatus('tutor');
      else setRedirectToSubscription(true);
    };
    const delay = isDashboardWithSuccess ? 1500 : 0;
    const t = setTimeout(recheck, delay);
    return () => clearTimeout(t);
  }, [status, isDashboard, isDashboardWithSuccess]);

  // Handle subscription_success param separately so we don't re-run full auth on every route change
  useEffect(() => {
    if (!isDashboardWithSuccess || status !== 'needs_subscription') return;

    let cancelled = false;
    const check = async () => {
      if (!ctxUser) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const res = await fetch('/api/refresh-my-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          });
          const data = res.ok ? await res.json().catch(() => null) : null;
          if (!cancelled && hasActiveSubscription(data?.subscription_status)) {
            setStatus('tutor');
          }
        } catch (_) {}
      }
    };
    const t = setTimeout(check, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isDashboardWithSuccess, status, ctxUser?.id]);

  // Main auth check — only re-runs on actual auth/profile changes, NOT on route changes
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (ctxLoading) {
        if (!resolvedForUserRef.current) setStatus('loading');
        return;
      }

      if (!ctxUser) {
        resolvedForUserRef.current = null;
        setStatus('none');
        return;
      }

      // Skip re-check if we already resolved a terminal status for this same user
      if (resolvedForUserRef.current === ctxUser.id) return;

      setStatus('loading');

      let profile: {
        organization_id: string | null;
        subscription_status?: string | null;
        manual_subscription_exempt?: boolean | null;
      } | null = ctxProfile
        ? {
            organization_id: ctxProfile.organization_id,
            subscription_status: ctxProfile.subscription_status,
            manual_subscription_exempt: ctxProfile.manual_subscription_exempt,
          }
        : null;
      if (!profile) {
        const { data: fetched } = await supabase
          .from('profiles')
          .select('organization_id, subscription_status, manual_subscription_exempt')
          .eq('id', ctxUser.id)
          .maybeSingle();
        profile = fetched;
      }

      try {
        if (!ctxProfile) {
          const { data: studentRows } = await supabase.rpc('get_student_by_user_id', { p_user_id: ctxUser.id });
          if (studentRows && studentRows.length > 0) {
            if (!cancelled) { resolvedForUserRef.current = ctxUser.id; setStatus('student'); }
            return;
          }
        }
      } catch (err) {
        console.error('[ProtectedRoute] Error checking student status:', err);
        if (!cancelled) setStatus('loading');
        return;
      }

      const { data: orgAdmin } = await supabase
        .from('organization_admins')
        .select('id')
        .eq('user_id', ctxUser.id)
        .maybeSingle();

      if (orgAdmin) {
        if (!cancelled) { resolvedForUserRef.current = ctxUser.id; setStatus('org_admin'); }
        return;
      }

      const orgToken = ctxUser.user_metadata?.org_token;
      let linkedToOrg = false;

      if (orgToken && !profile?.organization_id) {
        const { data: invite } = await supabase
          .from('tutor_invites')
          .select('id, organization_id, used, subjects_preset, cancellation_hours, cancellation_fee_percent, reminder_student_hours, reminder_tutor_hours, break_between_lessons, min_booking_hours, company_commission_percent')
          .eq('token', orgToken)
          .maybeSingle();

        if (invite) {
          await supabase
            .from('profiles')
            .upsert({
              id: ctxUser.id,
              email: ctxUser.email,
              full_name: ctxUser.user_metadata?.full_name,
              phone: ctxUser.user_metadata?.phone || '',
              organization_id: invite.organization_id,
              cancellation_hours: invite.cancellation_hours ?? 24,
              cancellation_fee_percent: invite.cancellation_fee_percent ?? 0,
              reminder_student_hours: invite.reminder_student_hours ?? 2,
              reminder_tutor_hours: invite.reminder_tutor_hours ?? 2,
              break_between_lessons: invite.break_between_lessons ?? 0,
              min_booking_hours: invite.min_booking_hours ?? 1,
              company_commission_percent: invite.company_commission_percent ?? 0,
            });

          if (!invite.used) {
            await supabase
              .from('tutor_invites')
              .update({ used: true, used_by_profile_id: ctxUser.id })
              .eq('id', invite.id);

            await ensureTutorPresetSubjects(ctxUser.id, invite.subjects_preset as any);
          }
          linkedToOrg = true;
        }
      }

      if (linkedToOrg) {
        const { data: freshProfile } = await supabase
          .from('profiles')
          .select('organization_id, subscription_status, manual_subscription_exempt')
          .eq('id', ctxUser.id)
          .single();
        profile = freshProfile;
      }

      if (!profile) {
        if (!cancelled) { resolvedForUserRef.current = ctxUser.id; setStatus('needs_subscription'); }
        return;
      }

      const hasAccess = tutorHasPlatformSubscriptionAccess(profile);

      if (hasAccess) {
        if (!cancelled) { resolvedForUserRef.current = ctxUser.id; setStatus('tutor'); }
      } else {
        if (!cancelled) { resolvedForUserRef.current = ctxUser.id; setStatus('needs_subscription'); }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [ctxLoading, ctxUser?.id, ctxProfile?.organization_id, ctxProfile?.subscription_status, ctxProfile?.manual_subscription_exempt]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#f4f5f9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'org_admin') {
    return <Navigate to="/company" replace />;
  }

  if (status === 'student') {
    return <Navigate to="/student" replace />;
  }

  if (status === 'needs_subscription') {
    if (location.pathname === '/dashboard') return <Outlet />;
    if (redirectToSubscription) return <Navigate to="/registration/subscription" replace />;
    return <Navigate to="/registration/subscription" replace />;
  }

  return status === 'tutor' ? <Outlet /> : <Navigate to="/login" replace />;
}
