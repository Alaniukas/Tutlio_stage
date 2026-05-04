import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getPasswordResetRedirectTo } from '@/lib/auth-redirects';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowLeft, Building2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { buildPlatformPath } from '@/lib/platform';
import { getOrgAdminDashboardPath } from '@/lib/orgAdminDashboardPath';

export default function CompanyLogin() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  /** Tik `/school` (ne `/schools` landing). */
  const isSchoolLogin = location.pathname === '/school/login' || location.pathname.startsWith('/school/');
  const heroTitle = isSchoolLogin ? t('school.loginHeroTitle') : t('companyLogin.title');
  const heroSubtitle = isSchoolLogin ? t('school.loginHeroSubtitle') : t('companyLogin.subtitle');
  const portalBadge = isSchoolLogin ? t('school.loginPortalBadge') : t('companyLogin.adminLogin');
  const cardBadge = isSchoolLogin ? t('school.loginCardBadge') : t('companyLogin.loginTitle');
  const cardTitle = isSchoolLogin ? t('school.loginCardTitle') : t('companyLogin.loginSubtitle');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: adminRow } = await supabase
        .from('organization_admins')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (adminRow) {
        const path = await getOrgAdminDashboardPath(supabase, session.user.id);
        navigate(path, { replace: true });
      }
    })();
  }, [navigate]);

  const handleGoToMainLogin = async () => {
    sessionStorage.setItem('tutlio_logout_intent', '1');
    void supabase.auth.signOut({ scope: 'global' });
    void supabase.auth.signOut({ scope: 'local' });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach((k) => localStorage.removeItem(k));
    window.location.href = `${window.location.origin}${buildPlatformPath('/login')}`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
      return;
    }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (!adminRow) {
      await supabase.auth.signOut();
      setError(isSchoolLogin ? t('school.notSchoolAdmin') : t('companyLogin.noAdminAccount'));
      setLoading(false);
      return;
    }

    const path = await getOrgAdminDashboardPath(supabase, data.user.id);
    navigate(path);
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

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-slate-900 to-indigo-950 flex-col justify-between p-12 text-white">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-medium bg-white/10 hover:bg-white/20 transition-all w-fit px-5 py-2.5 rounded-full backdrop-blur border border-white/10"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('auth.goBackToMain')}
        </Link>

        <div className="space-y-6 max-w-xl">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-bold leading-tight">{heroTitle}</h1>
          <p className="text-slate-300 text-lg leading-relaxed font-light">{heroSubtitle}</p>
        </div>

        <div className="text-sm text-slate-400">
          {t('companyLogin.copyright', { year: new Date().getFullYear() })}
        </div>
      </div>

      <div className="w-full lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col items-center justify-center px-4 py-12 relative">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-slate-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-md z-10">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-3 shadow-xl">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Tutlio</h1>
            <p className="text-slate-400 text-sm mt-1">{portalBadge}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-slate-700 to-slate-900 px-6 py-5">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider">{cardBadge}</p>
              <h2 className="text-white text-xl font-bold mt-0.5">{cardTitle}</h2>
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
                      placeholder={t('companyLogin.emailPlaceholder')}
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
                      className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-900 disabled:opacity-50 transition-colors"
                    >
                      {loading ? t('common.sending') : t('login.sendResetLink')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(false); setResetSent(false); setError(null); }}
                    className="w-full text-sm text-gray-500 hover:text-slate-700 transition-colors mt-2"
                  >
                    {t('login.backToLogin')}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                    <Input id="email" type="email" placeholder={t('companyLogin.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl border-gray-200" />
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
                    <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-xl border-gray-200" />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-semibold hover:bg-slate-900 disabled:opacity-50 transition-colors">
                    {loading ? t('common.connecting') : t('common.login')}
                  </button>
                </form>
              )}

              <div className="pt-4 mt-4 border-t border-gray-100">
                <button type="button" onClick={handleGoToMainLogin} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('auth.backToTutorStudentLogin')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
