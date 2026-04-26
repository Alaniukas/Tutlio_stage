import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { Check, Eye, EyeOff, Users } from 'lucide-react';

export default function ParentRegister() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<{ parent_email: string; parent_name: string; student_name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError(t('parent.invalidToken')); setLoading(false); return; }

    (async () => {
      const { data, error: fetchErr } = await supabase
        .from('parent_invites')
        .select('parent_email, parent_name, student_id, used, students(full_name)')
        .eq('token', token)
        .maybeSingle();

      if (fetchErr || !data) {
        setError(t('parent.invalidToken'));
      } else if (data.used) {
        setError(t('parent.tokenUsed'));
      } else {
        setInvite({
          parent_email: data.parent_email,
          parent_name: data.parent_name || '',
          student_name: (data.students as any)?.full_name || '',
        });
        setFullName(data.parent_name || '');
      }
      setLoading(false);
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !password || password.length < 6) {
      setError(t('parent.fillAll'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const resp = await fetch('/api/register-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fullName: fullName.trim(), password }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Failed' }));
        setError(err.error || 'Registration failed');
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch {
      setError(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7fb] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto mb-3">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tutlio</h1>
          <p className="text-sm text-gray-500 mt-1">{t('parent.registerTitle')}</p>
        </div>

        {done ? (
          <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('parent.registerDone')}</h2>
            <p className="text-gray-500 text-sm mb-4">{t('parent.registerDoneDesc')}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700"
            >
              {t('parent.goToLogin')}
            </button>
          </div>
        ) : error && !invite ? (
          <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={() => navigate('/login')} className="text-violet-600 font-medium text-sm hover:underline">
              {t('parent.goToLogin')}
            </button>
          </div>
        ) : invite ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-8 shadow-2xl space-y-4">
            <p className="text-sm text-gray-500 text-center">
              {t('parent.registerFor', { student: invite.student_name })}
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('common.email')}</label>
              <input type="email" value={invite.parent_email} disabled
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.fullName')}</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                placeholder={t('parent.fullNamePlaceholder')} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.password')}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm pr-10"
                  placeholder="min 6 characters" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button type="submit" disabled={submitting}
              className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50">
              {submitting ? t('common.loading') : t('parent.registerBtn')}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
