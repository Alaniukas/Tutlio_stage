import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { isStudentLoginName } from '@/lib/studentLoginIdentity';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { schoolFamilyAccountCopy, schoolFamilyAccountError } from '@/lib/schoolFamilyAccountCopy';

type Preview = {
  role: 'parent' | 'student';
  email: string;
  studentName: string;
  orgName: string | null;
  branding: {
    name: string;
    logoUrl: string | null;
    brandColor: string;
    brandColorSecondary: string;
  } | null;
  alreadyActivated: boolean;
  requiresPasswordSetup?: boolean;
  loginUrl: string;
};

export default function MvAccountActivate() {
  const { t, locale } = useTranslation();
  const copy = schoolFamilyAccountCopy(locale);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = (params.get('t') || '').trim();

  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  useEffect(() => {
    if (!token) {
      setError(t('mvActivate.invalidLink'));
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/mv-account-activate?t=${encodeURIComponent(token)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(token.startsWith('sf1.') ? t('mvActivate.invalidLink') : (json as { error?: string }).error || t('mvActivate.invalidLink'));
          return;
        }
        setPreview(json as Preview);
        if ((json as Preview).alreadyActivated) setDone(true);
      } catch {
        setError(t('common.error'));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, t]);

  const handleActivate = async () => {
    if (!token) return;
    if (preview?.requiresPasswordSetup && password !== passwordConfirm) { setError(copy.passwordMismatch); return; }
    setActivating(true);
    setError(null);
    try {
      const res = await fetch('/api/mv-account-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...(preview?.requiresPasswordSetup ? { password } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(token.startsWith('sf1.') ? schoolFamilyAccountError((json as { error?: string }).error || '', copy) : (json as { error?: string }).error || t('common.error'));
        return;
      }
      setDone(true);
      const loginUrl = (json as { loginUrl?: string }).loginUrl;
      if (loginUrl) {
        window.setTimeout(() => navigate(loginUrl.replace(/^https?:\/\/[^/]+/, '')), 1200);
      }
    } catch {
      setError(t('common.error'));
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm space-y-5">
        <div className="text-center space-y-2">
          {preview?.branding?.logoUrl && (
            <img
              src={preview.branding.logoUrl}
              alt={preview.branding.name}
              className="mx-auto max-h-16 max-w-[220px] object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{t('mvActivate.title')}</h1>
          {preview?.orgName && (
            <p className="text-sm text-gray-500">{preview.orgName}</p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {preview && (
          <>
            <p className="text-sm text-gray-600 leading-relaxed">
              {token.startsWith('sf1.')
                ? done ? copy.activationReadyIntro
                  : (preview.role === 'parent' ? copy.activationParentIntro : copy.activationStudentIntro).replace('{org}', preview.orgName || '')
                : preview.role === 'parent'
                ? t('mvActivate.parentDesc', { org: preview.orgName || '', student: preview.studentName })
                : t('mvActivate.studentDesc', { org: preview.orgName || '', student: preview.studentName })}
            </p>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <span className="text-gray-500">
                {t(isStudentLoginName(preview.email) ? 'login.studentUsername' : 'mvActivate.accountEmail')}: {' '}
              </span>
              <strong>{preview.email}</strong>
            </div>
            {done ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                <p className="text-sm text-emerald-800 font-medium">{token.startsWith('sf1.') ? copy.activationSuccess : t('mvActivate.success')}</p>
                <Button
                  type="button"
                  className="rounded-xl w-full"
                  style={preview.branding ? { backgroundColor: preview.branding.brandColor } : undefined}
                  onClick={() => navigate(preview.loginUrl.replace(/^https?:\/\/[^/]+/, ''))}
                >
                  {t('mvActivate.goLogin')}
                </Button>
              </div>
            ) : (
              <>
              {preview.requiresPasswordSetup && <div className="space-y-3">
                <p className="text-sm font-medium">{copy.choosePassword}</p>
                <p className="text-xs text-gray-600">{copy.passwordHint}</p>
                <div className="space-y-1"><Label htmlFor="family-new-password">{t('auth.newPassword')}</Label><Input id="family-new-password" type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="family-confirm-password">{t('onboard.confirmPassword')}</Label><Input id="family-confirm-password" type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} /></div>
              </div>}
              <Button
                type="button"
                className="rounded-xl w-full bg-emerald-700 hover:bg-emerald-800"
                style={preview.branding ? { backgroundColor: preview.branding.brandColor } : undefined}
                disabled={activating || (preview.requiresPasswordSetup && (password.length < 10 || password !== passwordConfirm))}
                onClick={() => void handleActivate()}
              >
                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : t('mvActivate.confirmBtn')}
              </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
