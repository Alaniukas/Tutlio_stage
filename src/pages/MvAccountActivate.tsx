import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';

type Preview = {
  role: 'parent' | 'student';
  email: string;
  studentName: string;
  orgName: string | null;
  alreadyActivated: boolean;
  loginUrl: string;
};

export default function MvAccountActivate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = (params.get('t') || '').trim();

  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
          setError((json as { error?: string }).error || t('mvActivate.invalidLink'));
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
    setActivating(true);
    setError(null);
    try {
      const res = await fetch('/api/mv-account-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error || t('common.error'));
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

        {preview && !error && (
          <>
            <p className="text-sm text-gray-600 leading-relaxed">
              {preview.role === 'parent'
                ? t('mvActivate.parentDesc', { student: preview.studentName })
                : t('mvActivate.studentDesc', { student: preview.studentName })}
            </p>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <span className="text-gray-500">{t('mvActivate.accountEmail')}: </span>
              <strong>{preview.email}</strong>
            </div>
            {done ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                <p className="text-sm text-emerald-800 font-medium">{t('mvActivate.success')}</p>
                <Button
                  type="button"
                  className="rounded-xl w-full"
                  onClick={() => navigate(preview.loginUrl.replace(/^https?:\/\/[^/]+/, ''))}
                >
                  {t('mvActivate.goLogin')}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                className="rounded-xl w-full bg-emerald-700 hover:bg-emerald-800"
                disabled={activating}
                onClick={() => void handleActivate()}
              >
                {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : t('mvActivate.confirmBtn')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
