import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowLeft, School } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { buildPlatformPath } from '@/lib/platform';

export default function SchoolLogin() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: adminRow } = await supabase
        .from('school_admins')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (adminRow) navigate('/school', { replace: true });
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
      .from('school_admins')
      .select('id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (!adminRow) {
      await supabase.auth.signOut();
      setError('This account is not a school administrator.');
      setLoading(false);
      return;
    }

    navigate('/school');
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-emerald-900 to-teal-950 flex-col justify-between p-12 text-white">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-medium bg-white/10 hover:bg-white/20 transition-all w-fit px-5 py-2.5 rounded-full backdrop-blur border border-white/10"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('auth.goBackToMain')}
        </Link>

        <div className="space-y-6 max-w-xl">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
            <School className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-bold leading-tight">School Administration</h1>
          <p className="text-emerald-200 text-lg leading-relaxed font-light">
            Manage contracts, payments, and student registrations for your school.
          </p>
        </div>

        <div className="text-sm text-emerald-300/60">
          &copy; {new Date().getFullYear()} Tutlio
        </div>
      </div>

      <div className="w-full lg:w-1/2 bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-950 flex flex-col items-center justify-center px-4 py-12 relative">
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-md z-10">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mx-auto mb-3 shadow-xl">
              <School className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Tutlio</h1>
            <p className="text-emerald-300/70 text-sm mt-1">School Admin Portal</p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-700 to-teal-900 px-6 py-5">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider">School Admin</p>
              <h2 className="text-white text-xl font-bold mt-0.5">Log in to your account</h2>
            </div>

            <form onSubmit={handleLogin} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">{t('common.email')}</Label>
                <Input id="email" type="email" placeholder="admin@school.lt" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">{t('common.password')}</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="rounded-xl border-gray-200" />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors">
                {loading ? t('common.connecting') : t('common.login')}
              </button>

              <div className="pt-2 border-t border-gray-100">
                <button type="button" onClick={handleGoToMainLogin} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('auth.backToTutorStudentLogin')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
