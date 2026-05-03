import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { Check, Eye, EyeOff, Users } from 'lucide-react';

export default function ParentRegister() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenFromUrl = (params.get('token') || '').trim();

  const [loading, setLoading] = useState(!!tokenFromUrl);
  const [invite, setInvite] = useState<{ parent_email: string; parent_name: string; student_name: string; parent_phone?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Resolved URL token (from link or from code+email lookup) */
  const [resolvedToken, setResolvedToken] = useState<string | null>(tokenFromUrl || null);

  const [manualCode, setManualCode] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [lookupSubmitting, setLookupSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!tokenFromUrl) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error: fetchErr } = await supabase
        .rpc('get_parent_invite_preview', { p_token: tokenFromUrl })
        .maybeSingle() as { data: { used: boolean; parent_email: string; parent_name: string | null; student_full_name: string | null; parent_phone?: string | null; token?: string } | null; error: any };

      if (fetchErr || !data) {
        setError(t('parent.invalidToken'));
      } else if (data.used) {
        setError(t('parent.tokenUsed'));
      } else {
        setInvite({
          parent_email: data.parent_email,
          parent_name: data.parent_name || '',
          student_name: data.student_full_name || '',
          parent_phone: (data as any).parent_phone ?? null,
        });
        setFullName(data.parent_name || '');
        setResolvedToken(tokenFromUrl);
      }
      setLoading(false);
    })();
  }, [tokenFromUrl, t]);

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim().toUpperCase();
    const email = manualEmail.trim();
    if (!code || !email) {
      setError(t('parent.manualMissing'));
      return;
    }
    setLookupSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase
        .rpc('get_parent_invite_preview_by_code', { p_code: code, p_email: email })
        .maybeSingle() as { data: { used: boolean; parent_email: string; parent_name: string | null; student_full_name: string | null; parent_phone?: string | null; token: string } | null; error: any };

      if (rpcErr || !data) {
        setError(t('parent.invalidManualInvite'));
        setLookupSubmitting(false);
        return;
      }
      if (data.used) {
        setError(t('parent.tokenUsed'));
        setLookupSubmitting(false);
        return;
      }
      setInvite({
        parent_email: data.parent_email,
        parent_name: data.parent_name || '',
        student_name: data.student_full_name || '',
        parent_phone: (data as any).parent_phone ?? null,
      });
      setFullName(data.parent_name || '');
      setResolvedToken(data.token);
    } catch {
      setError(t('common.error'));
    } finally {
      setLookupSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !password || password.length < 6) {
      setError(t('parent.fillAll'));
      return;
    }
    if (!resolvedToken && (!manualCode.trim() || !manualEmail.trim())) {
      setError(t('parent.invalidToken'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, string> = {
        fullName: fullName.trim(),
        password,
      };
      if (resolvedToken) {
        body.token = resolvedToken;
      } else {
        body.code = manualCode.trim().toUpperCase();
        body.email = manualEmail.trim();
      }

      const resp = await fetch('/api/register-parent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700"
            >
              {t('parent.goToLogin')}
            </button>
          </div>
        ) : error && !invite && tokenFromUrl ? (
          <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button type="button" onClick={() => navigate('/login')} className="text-violet-600 font-medium text-sm hover:underline">
              {t('parent.goToLogin')}
            </button>
          </div>
        ) : !invite && !tokenFromUrl ? (
          <form onSubmit={handleManualLookup} className="bg-white rounded-3xl p-8 shadow-2xl space-y-4">
            <p className="text-sm text-gray-600 text-center">{t('parent.manualExplain')}</p>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.manualCode')}</label>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono tracking-widest uppercase"
                placeholder="ABC12345"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('common.email')}</label>
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                placeholder="tevas@pastas.lt"
              />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={lookupSubmitting}
              className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {lookupSubmitting ? t('common.loading') : t('parent.manualContinue')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full text-sm text-violet-600 font-medium hover:underline"
            >
              {t('parent.goToLogin')}
            </button>
          </form>
        ) : invite ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-8 shadow-2xl space-y-4">
            <p className="text-sm text-gray-500 text-center">
              {t('parent.registerFor', { student: invite.student_name })}
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('common.email')}</label>
              <input
                type="email"
                value={invite.parent_email}
                disabled
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50"
              />
            </div>
            {invite.parent_phone && (
              <div>
                <label className="text-sm font-medium text-gray-700">{t('common.phone')}</label>
                <input
                  type="tel"
                  value={invite.parent_phone}
                  disabled
                  className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.fullName')}</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                placeholder={t('parent.fullNamePlaceholder')}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('parent.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm pr-10"
                  placeholder="Min. 6 simboliai"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50">
              {submitting ? t('common.loading') : t('parent.registerBtn')}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
