import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, setRememberMe } from '@/lib/supabase';
import { getPasswordResetRedirectTo } from '@/lib/auth-redirects';
import { hasActiveSubscription, tutorHasPlatformSubscriptionAccess } from '@/lib/subscription';
import { getOrgAdminDashboardPath } from '@/lib/orgAdminDashboardPath';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, ChevronRight, Sparkles, Building2, Users } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useOrgBranding } from '@/hooks/useOrgBranding';

// ─── SVG Illustrations ────────────────────────────────────────────────────────

function TutorIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Whiteboard */}
      <rect x="20" y="10" width="120" height="78" rx="6" fill="#e0e7ff" stroke="#a5b4fc" strokeWidth="1.5" />
      <rect x="28" y="18" width="104" height="62" rx="3" fill="white" />
      {/* Board lines */}
      <line x1="40" y1="32" x2="100" y2="32" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="44" x2="88" y2="44" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="40" y1="56" x2="95" y2="56" stroke="#a5b4fc" strokeWidth="1.5" strokeLinecap="round" />
      {/* Math formula */}
      <text x="105" y="36" fontSize="10" fill="#6366f1" fontWeight="bold">f(x)</text>
      <line x1="40" y1="68" x2="78" y2="68" stroke="#c7d2fe" strokeWidth="1.5" strokeLinecap="round" />
      {/* Tutor figure */}
      <circle cx="136" cy="56" r="11" fill="#818cf8" />
      <rect x="126" y="68" width="20" height="22" rx="4" fill="#6366f1" />
      {/* Pointer arm */}
      <line x1="126" y1="74" x2="110" y2="62" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      {/* Board stand */}
      <line x1="80" y1="88" x2="65" y2="108" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" />
      <line x1="80" y1="88" x2="95" y2="108" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" />
      <line x1="60" y1="108" x2="100" y2="108" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" />
      {/* Stars / sparks */}
      <circle cx="18" cy="20" r="3" fill="#fbbf24" opacity="0.6" />
      <circle cx="148" cy="14" r="2" fill="#34d399" opacity="0.7" />
      <circle cx="12" cy="80" r="2" fill="#f472b6" opacity="0.6" />
    </svg>
  );
}

function StudentIllustration() {
  return (
    <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Laptop */}
      <rect x="30" y="38" width="100" height="62" rx="5" fill="#e0e7ff" stroke="#a5b4fc" strokeWidth="1.5" />
      <rect x="38" y="45" width="84" height="48" rx="3" fill="white" />
      {/* Screen content */}
      <rect x="44" y="51" width="40" height="5" rx="2" fill="#c7d2fe" />
      <rect x="44" y="60" width="64" height="3" rx="1.5" fill="#e0e7ff" />
      <rect x="44" y="67" width="52" height="3" rx="1.5" fill="#e0e7ff" />
      <rect x="44" y="74" width="58" height="3" rx="1.5" fill="#e0e7ff" />
      {/* Chart on screen */}
      <rect x="90" y="54" width="6" height="22" rx="2" fill="#818cf8" />
      <rect x="100" y="62" width="6" height="14" rx="2" fill="#a5b4fc" />
      <rect x="110" y="58" width="6" height="18" rx="2" fill="#6366f1" />
      {/* Laptop base */}
      <rect x="20" y="100" width="120" height="6" rx="3" fill="#c7d2fe" />
      {/* Student figure */}
      <circle cx="80" cy="20" r="12" fill="#818cf8" />
      {/* cap */}
      <rect x="68" y="13" width="24" height="4" rx="1" fill="#4f46e5" />
      <rect x="79" y="10" width="2" height="6" rx="1" fill="#4f46e5" />
      <circle cx="82" cy="10" r="2" fill="#fbbf24" />
      {/* body */}
      <rect x="68" y="32" width="24" height="6" rx="3" fill="#6366f1" />
      {/* Sparkles */}
      <circle cx="15" cy="45" r="3" fill="#fbbf24" opacity="0.7" />
      <circle cx="148" cy="38" r="2" fill="#34d399" opacity="0.7" />
      <circle cx="20" cy="100" r="2" fill="#f472b6" opacity="0.6" />
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

type Role = null | 'tutor' | 'student' | 'parent';
type StudentMode = null | 'register' | 'login';
type TutorMode = null | 'login';

function fallbackNameFromEmail(email?: string | null): string {
  const raw = (email || '').trim();
  if (!raw.includes('@')) return 'Tutor';
  const local = raw.split('@')[0] || '';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() + cleaned.slice(1) : 'Tutor';
}

function isStudentAuthUser(user: { user_metadata?: any } | null | undefined): boolean {
  const role = String(user?.user_metadata?.role || '').trim().toLowerCase();
  const appRole = String((user as any)?.app_metadata?.role || '').trim().toLowerCase();
  const studentId = String(user?.user_metadata?.student_id || '').trim();
  const appStudentId = String((user as any)?.app_metadata?.student_id || '').trim();
  return role === 'student' || appRole === 'student' || studentId.length > 0 || appStudentId.length > 0;
}

function messageForAuthHashError(code: string, detailEnc: string | null): string {
  const c = (code || '').toLowerCase();
  if (c === 'otp_expired') {
    return 'This link has expired or has already been used. This often happens when an email system (e.g. Microsoft Defender) opens the link before you do. Request a new link via "Forgot password?" and open it as soon as possible.';
  }
  if (detailEnc) {
    try {
      return decodeURIComponent(detailEnc.replace(/\+/g, ' '));
    } catch {
      return detailEnc.replace(/\+/g, ' ');
    }
  }
  return 'The login or recovery link is invalid. Please try again or request a new password reset email.';
}

export default function Login() {
  const { t, locale } = useTranslation();
  const { branding: orgBranding } = useOrgBranding();
  const [role, setRole] = useState<Role>(null);
  const [studentMode, setStudentMode] = useState<StudentMode>(null);
  const [tutorMode, setTutorMode] = useState<TutorMode>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Tutor / student login form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMeState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student register form (invite code)
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Tutor company code flow
  const [tutorOrgCode, setTutorOrgCode] = useState('');
  const [tutorOrgCodeMode, setTutorOrgCodeMode] = useState(false);
  const [tutorOrgCodeError, setTutorOrgCodeError] = useState<string | null>(null);

  const claimOrgInvite = async (tokenRaw: string, accessToken?: string | null): Promise<{ organizationId?: string }> => {
    const token = String(tokenRaw || '').trim().toUpperCase();
    if (!token) return {};

    let bearer = accessToken || null;
    if (!bearer) {
      const { data: { session } } = await supabase.auth.getSession();
      bearer = session?.access_token || null;
    }
    if (!bearer) return {};

    const response = await fetch('/api/claim-tutor-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return {};
    return (await response.json().catch(() => ({}))) || {};
  };
  const [authHashBanner, setAuthHashBanner] = useState<string | null>(null);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const ensureTutorProfile = async (user: { id: string; email?: string | null; user_metadata?: any }) => {
    const displayName =
      (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
      fallbackNameFromEmail(user.email);

    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email ?? '',
      full_name: displayName,
      phone: user.user_metadata?.phone || '',
    });

    const { data: ensured } = await supabase
      .from('profiles')
      .select('id, organization_id, subscription_status, manual_subscription_exempt')
      .eq('id', user.id)
      .maybeSingle();

    return ensured;
  };

  // Redirect already-logged-in user to the right page (tutor → dashboard, student → /student, etc.)
  const redirectByRole = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    // Check if user just logged out - don't auto-redirect them back
    // Only clear the flag if there's NO session (logout completed)
    if (sessionStorage.getItem('tutlio_logout_intent') === '1') {
      if (!session?.user) {
        sessionStorage.removeItem('tutlio_logout_intent');
      }
      return false;
    }

    if (!session?.user) return false;
    const user = session.user;

    const { data: orgAdmin, error: orgAdminErr } = await supabase
      .from('organization_admins').select('id').eq('user_id', user.id).maybeSingle();
    if (orgAdminErr) {
      console.warn('[Login] redirectByRole organization_admins check failed:', orgAdminErr);
    }
    if (orgAdmin) {
      const path = await getOrgAdminDashboardPath(supabase, user.id);
      navigate(path);
      return true;
    }

    // Parent: use SECURITY DEFINER RPC to avoid RLS recursion on parent_profiles.
    const { data: parentProfileId, error: parentErr } = await supabase
      .rpc('get_parent_profile_id_by_user_id', { p_user_id: user.id });
    if (parentErr) {
      console.warn('[Login] redirectByRole parent profile lookup failed:', parentErr);
    }
    if (parentProfileId) { navigate('/parent'); return true; }

    const { data: studentRows } = await supabase
      .rpc('get_student_by_user_id', { p_user_id: user.id });
    let student = studentRows?.[0] ?? null;
    if (!student && user.email) {
      try {
        const { data: linkRows, error: rpcError } = await supabase.rpc('get_student_by_email_for_linking', { p_email: user.email });
        if (rpcError) {
          console.warn('[Login] RPC get_student_by_email_for_linking failed:', rpcError);
          // Continue without linking - don't block login
        } else {
          const linkRow = linkRows?.[0];
          if (linkRow) {
            if (!linkRow.linked_user_id) {
              await supabase.from('students').update({ linked_user_id: user.id }).eq('id', linkRow.id);
            }
            navigate('/student');
            return true;
          }
        }
      } catch (err) {
        console.error('[Login] Error in student linking:', err);
        // Continue without linking - don't block login
      }
    }
    if (student) { navigate('/student'); return true; }

    let { data: profile, error: profileError } = await supabase
      .from('profiles').select('id, organization_id, subscription_status, manual_subscription_exempt').eq('id', user.id).maybeSingle();
    if (profileError) {
      console.warn('[Login] profile lookup in redirectByRole failed:', profileError);
    }

    const meta = user.user_metadata || {};
    if (meta.org_token) {
      const claimResult = await claimOrgInvite(meta.org_token as string, session.access_token);
      if (claimResult.organizationId) {
        const { data: updated } = await supabase
          .from('profiles').select('id, organization_id, subscription_status, manual_subscription_exempt').eq('id', user.id).maybeSingle();
        profile = updated;
      }
    } else if (!profile && meta.full_name) {
      try {
        const { data: studentByEmailRows, error: rpcError } = await supabase.rpc('get_student_by_email_for_linking', { p_email: user.email || '' });
        if (rpcError) {
          console.warn('[Login] RPC get_student_by_email_for_linking failed:', rpcError);
          // Continue without linking - don't block login
        } else {
          const studentByEmail = studentByEmailRows?.[0];
          if (studentByEmail) {
            if (!studentByEmail.linked_user_id) {
              await supabase.from('students').update({ linked_user_id: user.id }).eq('id', studentByEmail.id);
            }
            navigate('/student');
            return true;
          }
        }
      } catch (err) {
        console.error('[Login] Error in student linking (profile check):', err);
        // Continue without linking - don't block login
      }
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: meta.full_name,
        phone: meta.phone || '',
        email: user.email,
      });
      const { data: created } = await supabase
        .from('profiles').select('id, organization_id, subscription_status, manual_subscription_exempt').eq('id', user.id).maybeSingle();
      profile = created;
    }

    if (!profile) {
      if (isStudentAuthUser(user)) {
        console.warn('[Login] Student auth user has no linked student row yet; skip tutor profile creation');
        return false;
      }
      // Legacy users may exist in auth without a profile row.
      profile = await ensureTutorProfile(user);
    }
    if (!profile) return false;

    // Tutor: if has org or subscription → dashboard. Otherwise stay on login so user can sign out
    const hasAccess = tutorHasPlatformSubscriptionAccess(profile);
    if (hasAccess) {
      navigate('/dashboard');
      return true;
    }
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (authSession?.access_token) {
      try {
        const res = await fetch('/api/refresh-my-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authSession.access_token}` },
        });
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (hasActiveSubscription(data?.subscription_status) || ['canceled', 'past_due', 'unpaid'].includes(data?.subscription_status || '')) {
          navigate('/dashboard');
          return true;
        }
      } catch (_) {}
    }
    return false;
  };

  // When user opens /login with existing session (e.g. "remember me" + reload) → auto redirect
  useEffect(() => {
    redirectByRole();
  }, []);

  useEffect(() => {
    const code = searchParams.get('auth_error');
    if (!code) return;
    const detail = searchParams.get('auth_error_detail');
    setAuthHashBanner(messageForAuthHashError(code, detail));
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('auth_error');
        next.delete('auth_error_detail');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  // When URL has access_token (e.g. after email confirmation) → set session from hash then redirect
  useEffect(() => {
    const hash = window.location.hash?.replace(/^#/, '') || '';
    if (!hash.includes('access_token')) return;
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return;
    (async () => {
      await supabase.auth.setSession({ access_token, refresh_token });
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      redirectByRole();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared login handler – works for both tutor and student
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRememberMe(rememberMe);
    // Clear logout intent when user is actively logging in
    sessionStorage.removeItem('tutlio_logout_intent');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
    } else if (data.user) {
      const { data: orgAdminRow, error: orgAdminRowError } = await supabase
        .from('organization_admins')
        .select('id')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (orgAdminRowError) {
        console.warn('[Login] organization_admins lookup failed during login:', orgAdminRowError);
      }
      if (orgAdminRow) {
        setLoading(false);
        const path = await getOrgAdminDashboardPath(supabase, data.user.id);
        navigate(path);
        return;
      }

      if (role === 'parent') {
        const { data: parentProfileId, error: parentErr } = await supabase
          .rpc('get_parent_profile_id_by_user_id', { p_user_id: data.user.id });
        if (parentErr) {
          console.warn('[Login] parent_profiles lookup failed during login:', parentErr);
        }
        if (parentProfileId) {
          setLoading(false);
          navigate('/parent');
          return;
        }
        await supabase.auth.signOut();
        setError(t('login.noParentFound'));
        setLoading(false);
        return;
      }

      if (role === 'student') {
        // Use RPC function to bypass RLS
        const { data: studentRows } = await supabase
          .rpc('get_student_by_user_id', { p_user_id: data.user.id });

        const studentData = studentRows?.[0] ?? null;

        if (studentData) {
          setLoading(false);
          navigate('/student');
          return;
        } else {
          await supabase.auth.signOut();
          setError(t('login.noStudentFound'));
          setLoading(false);
          return;
        }
      }

      if (role === 'tutor') {
        if (isStudentAuthUser(data.user)) {
          const { data: studentRows } = await supabase
            .rpc('get_student_by_user_id', { p_user_id: data.user.id });
          if (studentRows?.[0]) {
            setLoading(false);
            navigate('/student');
            return;
          }
          await supabase.auth.signOut();
          setError(t('login.noStudentFound'));
          setLoading(false);
          return;
        }

        let { data: tutorData, error: tutorError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();
        if (tutorError) {
          console.warn('[Login] Tutor profile lookup failed:', tutorError);
        }

        // Check org_token in metadata to link to organization even if profile exists (or create one)
        const meta = data.user?.user_metadata || {};
        console.log('🔍 SIGNUP FLOW - USER METADATA:', meta);
        console.log('🔍 SIGNUP FLOW - ORG TOKEN FROM METADATA:', meta.org_token);

        if (meta.org_token) {
          const metaOrgToken = String(meta.org_token).trim().toUpperCase();
          console.log('🔍 SIGNUP FLOW - SEARCHING FOR INVITE WITH TOKEN:', metaOrgToken);
          const claimResult = await claimOrgInvite(metaOrgToken, data.session?.access_token);
          console.log('🔍 SIGNUP FLOW - CLAIM RESULT:', claimResult);
          if (claimResult.organizationId) {
            const { data: updated } = await supabase
              .from('profiles').select('id').eq('id', data.user.id).maybeSingle();
            tutorData = updated;
          }
        } else if (!tutorData && meta.full_name) {
          try {
            const { data: studentByEmailRows, error: rpcError } = await supabase.rpc('get_student_by_email_for_linking', { p_email: data.user.email || '' });
            if (rpcError) {
              console.warn('[Login] RPC get_student_by_email_for_linking failed:', rpcError);
              // Continue without linking - don't block login
            } else {
              const studentByEmail = studentByEmailRows?.[0];
              if (studentByEmail) {
                if (!studentByEmail.linked_user_id) {
                  await supabase.from('students').update({ linked_user_id: data.user.id }).eq('id', studentByEmail.id);
                }
                setLoading(false);
                navigate('/student');
                return;
              }
            }
          } catch (err) {
            console.error('[Login] Error in student linking (Google OAuth):', err);
            // Continue without linking - don't block login
          }
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: meta.full_name,
            phone: meta.phone || '',
            email: data.user.email,
          });
          const { data: created } = await supabase
            .from('profiles').select('id').eq('id', data.user.id).maybeSingle();
          tutorData = created;
        }

        if (!tutorData) {
          const ensured = await ensureTutorProfile(data.user);
          tutorData = ensured ? { id: ensured.id } : null;
        }

        if (tutorData) {
          setLoading(false);
          await supabase.auth.getSession();
          navigate('/dashboard');
          return;
        }

        // Do not hard-fail login on transient RLS/policy errors in profile lookup.
        // User is already authenticated; downstream pages remain protected by RLS/API auth.
        console.warn('[Login] tutor profile not resolved after auth - allowing dashboard navigation');
        setLoading(false);
        navigate('/dashboard');
        return;
      }

      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t('login.enterEmail'));
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordResetRedirectTo(import.meta.env.VITE_APP_URL, window.location.origin),
    });
    if (error) {
      setError(t('login.resetError') + error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  const handleStudentAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    const code = inviteCode.trim().toUpperCase();
    const { data, error } = await supabase
      .rpc('get_student_by_invite_code', { p_invite_code: code });
    if (error || !data?.[0]?.id) {
      setInviteError(t('login.codeNotFound'));
      setInviteLoading(false);
      return;
    }
    navigate(`/book/${code}`);
  };

  const resetStudent = () => {
    setStudentMode(null);
    setError(null);
    setInviteError(null);
    setIsForgotPassword(false);
    setResetSent(false);
  };

  const resetTutor = () => {
    setTutorMode(null);
    setTutorOrgCodeMode(false);
    setTutorOrgCode('');
    setTutorOrgCodeError(null);
    setError(null);
    setIsForgotPassword(false);
    setResetSent(false);
  };

  const handleTutorOrgCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = tutorOrgCode.trim().toUpperCase();
    if (!code) return;
    setTutorOrgCodeError(null);
    const { data, error } = await supabase
      .rpc('validate_tutor_invite_token', { p_token: code })
      .maybeSingle();
    if (error || !data) {
      setTutorOrgCodeError(t('login.codeNotFound'));
      return;
    }
    if ((data as any).used) {
      setTutorOrgCodeError(t('login.codeAlreadyUsed'));
      return;
    }
    navigate(`/register?org_token=${code}`);
  };

  const reset = () => {
    setRole(null);
    setStudentMode(null);
    setTutorMode(null);
    setTutorOrgCodeMode(false);
    setTutorOrgCode('');
    setTutorOrgCodeError(null);
    setError(null);
    setInviteError(null);
    setIsForgotPassword(false);
    setResetSent(false);
  };

  const backToStudentGroup = () => {
    setRole('student');
    setStudentMode(null);
    setError(null);
    setInviteError(null);
    setIsForgotPassword(false);
    setResetSent(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left Column: Marketing/Image Sidebar ────────────────────────────── */}
      <div className="hidden lg:block w-1/2 relative bg-indigo-950 overflow-hidden">
        <div className="absolute inset-0 z-0">
          {/* Associative photo from Unsplash */}
          <img
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80"
            alt="Students studying"
            className="w-full h-full object-cover opacity-50 mix-blend-overlay"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/80 to-violet-900/80 z-10" />

        <div className="relative z-20 flex flex-col justify-between p-12 h-full text-white">
          <Link to="/" className="flex items-center gap-2 hover:bg-white/20 transition-all w-fit text-sm font-medium bg-white/10 px-5 py-2.5 rounded-full backdrop-blur border border-white/10">
            <ArrowLeft className="w-4 h-4" />
            {t('auth.goBackToMain')}
          </Link>

          <div className="max-w-xl space-y-6">
            <h1 className="text-5xl font-bold leading-tight tracking-tight">{t('login.heroTitle')}</h1>
            <p className="text-indigo-200 text-xl leading-relaxed font-light">
              {t('login.heroDesc')}
            </p>
          </div>

          <div className="text-sm text-indigo-300 font-medium">
            {t('login.copyright', { year: String(new Date().getFullYear()) })}
          </div>
        </div>
      </div>

      {/* ── Right Column: Forms ─────────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 flex flex-col items-center justify-start lg:justify-center px-4 py-8 lg:py-4 relative">

        {/* Decorative blobs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Mobile back link – part of normal flow so it's always visible */}
        <div className="w-full max-w-md mb-4 lg:hidden relative z-10">
          <Link to="/" className="flex items-center gap-2 hover:bg-white/20 transition-all w-fit text-sm font-medium bg-white/10 px-4 py-2 rounded-full backdrop-blur border border-white/10 text-white">
            <ArrowLeft className="w-4 h-4" />
            {t('common.back')}
          </Link>
        </div>

        <div className="relative w-full max-w-md z-10">
          {/* Logo */}
          <div className="text-center mb-8">
            {orgBranding?.logo_url ? (
              <>
                <img src={orgBranding.logo_url} alt={orgBranding.name} className="h-14 max-w-[180px] object-contain mx-auto mb-3" />
                <h1 className="text-2xl font-bold text-white tracking-tight">{orgBranding.name}</h1>
                <p className="text-indigo-300 text-xs mt-2 opacity-70">powered by Tutlio</p>
              </>
            ) : (
              <>
                <img src="/logo-icon.png" alt="Tutlio" className="w-14 h-14 rounded-2xl mx-auto mb-3 shadow-xl" />
                <h1 className="text-2xl font-bold text-white tracking-tight">Tutlio</h1>
              </>
            )}
            <p className="text-indigo-300 text-sm mt-1">{t('login.welcomeBack')}</p>
          </div>

          {authHashBanner && (
            <div className="flex items-start gap-2 text-sm text-amber-100 bg-amber-800/40 border border-amber-700/50 rounded-xl px-3 py-2.5 mb-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{authHashBanner}</span>
            </div>
          )}

          {/* ── STEP 1: Role selection ─────────────────────────────────────────── */}
          {role === null && (
            <div
              className="space-y-3"
              key="selection"
            >
              <p className="text-center text-white/70 text-sm font-medium mb-5">
                {t('login.chooseRole')}
              </p>

              {/* Company admin — separate company login page */}
              <button
                type="button"
                onClick={() => {
                  let path = '/company/login';
                  try {
                    path = sessionStorage.getItem('tutlio_org_admin_login') || path;
                  } catch {
                    /* ignore */
                  }
                  navigate(path);
                }}
                className="group w-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 hover:border-emerald-400/40 rounded-2xl p-5 text-left transition-all duration-200 flex items-center gap-5"
              >
                <div className="w-24 h-18 flex-shrink-0 flex items-center justify-center opacity-95">
                  <div className="w-[88px] h-[72px] rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                    <Building2 className="w-12 h-12 text-emerald-200" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-base">{t('login.companyAdmin')}</p>
                  <p className="text-indigo-300 text-sm mt-0.5">{t('login.companyAdminDesc')}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>

              {/* Tutor card */}
              <button
                type="button"
                onClick={() => setRole('tutor')}
                className="group w-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 hover:border-white/40 rounded-2xl p-5 text-left transition-all duration-200 flex items-center gap-5"
              >
                <div className="w-24 h-18 flex-shrink-0 opacity-90">
                  <TutorIllustration />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-base">{t('common.tutor')}</p>
                  <p className="text-indigo-300 text-sm mt-0.5">{t('login.tutorDesc')}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>

              {/* Student card */}
              <button
                type="button"
                onClick={() => setRole('student')}
                className="group w-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 hover:border-white/40 rounded-2xl p-5 text-left transition-all duration-200 flex items-center gap-5"
              >
                <div className="w-24 h-18 flex-shrink-0 opacity-90">
                  <StudentIllustration />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-base">
                    {locale === 'lt' ? 'Mokiniai / Tėvai' : 'Students / Parents'}
                  </p>
                  <p className="text-indigo-300 text-sm mt-0.5">
                    {locale === 'lt'
                      ? 'Prisijunkite kaip mokinys arba kaip tėvai'
                      : 'Login as a student or as a parent'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/40 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            </div>
          )}

          {/* ── STEP 2a: Tutor - choose subscribe or login ────────────────────── */}
          {role === 'tutor' && tutorMode === null && (
            <div
              key="tutor-choice"
              className="bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Illustration header */}
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 px-6 pt-6 pb-3 flex items-end gap-4">
                <div className="w-28 h-20 flex-shrink-0 drop-shadow-lg">
                  <TutorIllustration />
                </div>
                <div className="pb-2">
                  <p className="text-white/80 text-xs font-medium uppercase tracking-wider">{t('login.choose')}</p>
                  <h2 className="text-white text-xl font-bold leading-tight">{t('common.tutor')}</h2>
                </div>
              </div>

              <div className="p-6 space-y-3">
                <p className="text-sm text-gray-500 mb-4">{t('login.haveAccountOrNew')}</p>

                {/* New Tutor - Subscribe */}
                <Link
                  to="/register"
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t('common.register')}</p>
                    <p className="text-xs text-gray-400">{t('login.createNewAccount')}</p>
                  </div>
                </Link>

                {/* Existing Tutor - Login */}
                <button
                  type="button"
                  onClick={() => setTutorMode('login')}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <ArrowRight className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t('common.login')}</p>
                    <p className="text-xs text-gray-400">{t('login.alreadyHaveAccount')}</p>
                  </div>
                </button>

                {/* Back button */}
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Atgal
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2b: Tutor LOGIN form ─────────────────────────────────────── */}
          {role === 'tutor' && tutorMode === 'login' && (
            <div
              key="tutor-form"
              className="bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Illustration header */}
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 px-6 pt-6 pb-3 flex items-end gap-4">
                <div className="w-28 h-20 flex-shrink-0 drop-shadow-lg">
                  <TutorIllustration />
                </div>
                <div className="pb-2">
                  <p className="text-white/80 text-xs font-medium uppercase tracking-wider">{t('login.loginLabel')}</p>
                  <h2 className="text-white text-xl font-bold leading-tight">{t('common.tutor')}</h2>
                </div>
              </div>

              <div className="p-6">
                {isForgotPassword ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <p className="text-sm text-gray-500 font-medium mb-4">
                      {t('login.forgotPasswordDesc')}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="vardas@pavyzdys.lt"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="rounded-xl border-gray-200"
                      />
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </div>
                    )}
                    {resetSent && (
                      <div className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 font-medium border border-green-200">
                        {t('login.resetLinkSent', { email })}
                      </div>
                    )}
                    {!resetSent && (
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {loading ? t('common.sending') : t('login.sendResetLink')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(null); }}
                      className="w-full text-sm text-gray-500 hover:text-indigo-600 transition-colors mt-2"
                    >
                      {t('login.backToLogin')}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="vardas@pavyzdys.lt"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="rounded-xl border-gray-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-sm font-medium text-gray-700">{t('common.password')}</Label>
                        <button
                          type="button"
                          onClick={() => { setIsForgotPassword(true); setError(null); }}
                          className="text-sm text-indigo-600 hover:underline font-medium"
                        >
                          {t('login.forgotPassword')}
                        </button>
                      </div>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={(e) => {
                          setTimeout(() => {
                            e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 300);
                        }}
                        required
                        className="rounded-xl border-gray-200"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMeState(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{t('login.rememberMe')}</span>
                    </label>
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {loading ? t('common.connecting') : t('common.login')}
                    </button>
                  </form>
                )}

                {/* Company code toggle */}
                {tutorOrgCodeMode ? (
                  <form onSubmit={handleTutorOrgCode} className="mt-5 pt-4 border-t border-gray-100 space-y-3">
                    <p className="text-sm font-medium text-gray-700">{t('login.companyInviteCode')}</p>
                    <Input
                      value={tutorOrgCode}
                      onChange={(e) => setTutorOrgCode(e.target.value.toUpperCase())}
                      placeholder="pvz. ABC12345"
                      className="rounded-xl border-gray-200 font-mono text-base tracking-widest text-center uppercase"
                      autoFocus
                    />
                    {tutorOrgCodeError && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {tutorOrgCodeError}
                      </div>
                    )}
                    <button type="submit" disabled={!tutorOrgCode.trim()}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                      {t('login.registerWithCode')}
                    </button>
                    <button type="button" onClick={() => { setTutorOrgCodeMode(false); setTutorOrgCode(''); setTutorOrgCodeError(null); }}
                      className="w-full text-sm text-gray-400 hover:text-gray-700 transition-colors">
                      {t('login.backToLogin')}
                    </button>
                  </form>
                ) : !tutorOrgCodeMode ? (
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={resetTutor}
                      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    {t('common.back')}
                    </button>
                    <div className="text-right space-y-1">
                      <p className="text-sm text-gray-400">
                        {t('login.haveCompanyCode')}{' '}
                        <button type="button" onClick={() => setTutorOrgCodeMode(true)}
                          className="text-indigo-600 hover:underline font-medium">
                          {t('login.registerWithCode')}
                        </button>
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* ── STEP 2c: Parent login (same auth as student/tutor) ─────────────── */}
          {role === 'parent' && (
            <div key="parent-form" className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-br from-fuchsia-600 to-violet-700 px-6 pt-6 pb-3 flex items-end gap-4">
                <div className="w-28 h-20 flex-shrink-0 flex items-center justify-center">
                  <Users className="w-16 h-16 text-white/90 drop-shadow-lg" />
                </div>
                <div className="pb-2">
                  <p className="text-white/80 text-xs font-medium uppercase tracking-wider">{t('login.loginLabel')}</p>
                  <h2 className="text-white text-xl font-bold leading-tight">{t('login.parentRole')}</h2>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">
                  {t('login.parentNoAccount')}{' '}
                  <Link to="/parent-register" className="text-violet-600 font-medium hover:underline">
                    {t('login.parentRegisterLink')}
                  </Link>
                </p>
                {isForgotPassword ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="p-email" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                      <Input
                        id="p-email"
                        type="email"
                        placeholder="vardas@pavyzdys.lt"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="rounded-xl border-gray-200"
                      />
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </div>
                    )}
                    {resetSent && (
                      <div className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 font-medium border border-green-200">
                        {t('login.resetLinkSent', { email })}
                      </div>
                    )}
                    {!resetSent && (
                      <button type="submit" disabled={loading}
                        className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                        {loading ? t('common.sending') : t('login.sendResetLink')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(null); }}
                      className="w-full text-sm text-gray-500 hover:text-violet-600 transition-colors mt-2"
                    >
                      {t('login.backToLogin')}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="p-email2" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                      <Input
                        id="p-email2"
                        type="email"
                        placeholder="vardas@pavyzdys.lt"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="rounded-xl border-gray-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="p-password" className="text-sm font-medium text-gray-700">{t('common.password')}</Label>
                        <button
                          type="button"
                          onClick={() => { setIsForgotPassword(true); setError(null); }}
                          className="text-sm text-violet-600 hover:underline font-medium"
                        >
                          {t('login.forgotPassword')}
                        </button>
                      </div>
                      <Input
                        id="p-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="rounded-xl border-gray-200"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMeState(e.target.checked)}
                        className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span>{t('login.rememberMe')}</span>
                    </label>
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </div>
                    )}
                    <button type="submit" disabled={loading}
                      className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                      {loading ? t('common.connecting') : t('common.login')}
                    </button>
                  </form>
                )}
                <button type="button" onClick={reset}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mt-2">
                  <ArrowLeft className="w-3.5 h-3.5" /> {t('common.back')}
                </button>

                <button
                  type="button"
                  onClick={backToStudentGroup}
                  className="w-full text-sm text-violet-600 font-medium hover:underline"
                >
                  {locale === 'lt' ? 'Atgal į Mokiniai / Tėvai' : 'Back to Students / Parents'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2b: Student section ──────────────────────────────────────── */}
          {role === 'student' && (
            <div key="student-form" className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Illustration header */}
              <div className="bg-gradient-to-br from-violet-500 to-violet-700 px-6 pt-6 pb-3 flex items-end gap-4">
                <div className="w-28 h-20 flex-shrink-0 drop-shadow-lg">
                  <StudentIllustration />
                </div>
                <div className="pb-2">
                  <p className="text-white/80 text-xs font-medium uppercase tracking-wider">
                    {studentMode === 'login' ? t('login.loginLabel') : studentMode === 'register' ? t('login.registrationLabel') : t('login.choose')}
                  </p>
                  <h2 className="text-white text-xl font-bold leading-tight">{t('common.student')}</h2>
                </div>
              </div>

              <div className="p-6">
                {/* Sub-choice: no mode selected yet */}
                {studentMode === null && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500 mb-4">{t('login.haveAccountOrNew')}</p>
                    <button
                      type="button"
                      onClick={() => setStudentMode('login')}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 border-gray-100 hover:border-violet-300 hover:bg-violet-50 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <ArrowRight className="w-5 h-5 text-violet-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{t('common.login')}</p>
                        <p className="text-xs text-gray-400">{t('login.alreadyHaveAccount')}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentMode('register')}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 border-gray-100 hover:border-violet-300 hover:bg-violet-50 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{t('login.registerWithCode')}</p>
                        <p className="text-xs text-gray-400">{t('login.hasInviteCode')}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole('parent')}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 border-gray-100 hover:border-fuchsia-300 hover:bg-fuchsia-50 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-fuchsia-100 flex items-center justify-center flex-shrink-0">
                        <Users className="w-5 h-5 text-fuchsia-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">
                          {locale === 'lt' ? 'Tėvų prisijungimas' : 'Parent login'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {locale === 'lt' ? 'Prisijunkite kaip tėvai / globėjai' : 'Login as a parent / guardian'}
                        </p>
                      </div>
                    </button>
                  </div>
                )}

                {/* Student LOGIN with email+password */}
                {studentMode === 'login' && (
                  isForgotPassword ? (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <p className="text-sm text-gray-500 font-medium mb-4">
                        {t('login.forgotPasswordDesc')}
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="s-email" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                        <Input
                          id="s-email"
                          type="email"
                          placeholder="vardas@pavyzdys.lt"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="rounded-xl border-gray-200"
                        />
                      </div>
                      {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {error}
                        </div>
                      )}
                      {resetSent && (
                        <div className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3 font-medium border border-green-200">
                          {t('login.resetLinkSent', { email })}
                        </div>
                      )}
                      {!resetSent && (
                        <button type="submit" disabled={loading}
                          className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                          {loading ? t('common.sending') : t('login.sendResetLink')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(null); }}
                        className="w-full text-sm text-gray-500 hover:text-violet-600 transition-colors mt-2"
                      >
                        {t('login.backToLogin')}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="s-email" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                        <Input
                          id="s-email"
                          type="email"
                          placeholder="vardas@pavyzdys.lt"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="rounded-xl border-gray-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="s-password" className="text-sm font-medium text-gray-700">{t('common.password')}</Label>
                          <button
                            type="button"
                            onClick={() => { setIsForgotPassword(true); setError(null); }}
                            className="text-sm text-violet-600 hover:underline font-medium"
                          >
                            {t('login.forgotPassword')}
                          </button>
                        </div>
                        <Input
                          id="s-password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onFocus={(e) => {
                            setTimeout(() => {
                              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 300);
                          }}
                          required
                          className="rounded-xl border-gray-200"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMeState(e.target.checked)}
                          className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        />
                        <span>{t('login.rememberMe')}</span>
                      </label>
                      {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {error}
                        </div>
                      )}
                      <button type="submit" disabled={loading}
                        className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors">
                        {loading ? t('common.connecting') : t('common.login')}
                      </button>
                    </form>
                  )
                )}

                {/* Student REGISTER with invite code */}
                {studentMode === 'register' && (
                  <form onSubmit={handleStudentAccess} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">{t('login.inviteCode')}</Label>
                      <Input
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="pvz. AB12CD"
                        maxLength={8}
                        className="rounded-xl border-gray-200 font-mono text-xl tracking-widest text-center uppercase"
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-gray-400 -mt-2">{t('login.inviteCodeDesc')}</p>
                    {inviteError && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {inviteError}
                      </div>
                    )}
                    <button type="submit" disabled={inviteLoading || !inviteCode.trim()}
                      className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                      {inviteLoading ? t('login.checking') : (<><BookOpen className="w-4 h-4" /> {t('login.continue')}</>)}
                    </button>
                  </form>
                )}

                {/* Back + switch link */}
                <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <button type="button" onClick={studentMode ? resetStudent : reset}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> {t('common.back')}
                  </button>
                  {studentMode === 'register' && (
                    <button type="button" onClick={() => setStudentMode('login')}
                      className="text-sm text-violet-600 hover:underline font-medium">
                      {t('login.alreadyHaveAccount')}
                    </button>
                  )}
                  {studentMode === 'login' && (
                    <button type="button" onClick={() => setStudentMode('register')}
                      className="text-sm text-violet-600 hover:underline font-medium">
                      {t('login.registerWithCode')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
