import { useEffect, useState } from 'react';
import ParentLayout from '@/components/ParentLayout';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { Eye, EyeOff, Check, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import PwaInstallGuide from '@/components/PwaInstallGuide';
import { parentFullNameForUserDeduped } from '@/lib/preload';
import { getCached } from '@/lib/dataCache';

function pickNonEmpty(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : '';
    if (s) return s;
  }
  return null;
}

/** Vardui ir pavardei iš `full_name`; jei laikoma viena eilute – visa eilute rodoma kaip vardas. */
function splitFullName(display: string | null): { first: string; last: string } {
  const t = typeof display === 'string' ? display.trim() : '';
  if (!t) return { first: '', last: '' };
  const idx = t.indexOf(' ');
  if (idx === -1) return { first: t, last: '' };
  return { first: t.slice(0, idx).trim(), last: t.slice(idx + 1).trim() };
}

export default function ParentSettings() {
  const { t } = useTranslation();
  const { user: ctxUser } = useUser();
  const navigate = useNavigate();

  const [parentName, setParentName] = useState<string | null>(() =>
    pickNonEmpty(getCached<{ parentName?: string | null }>('parent_dashboard')?.parentName ?? undefined),
  );
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [savingPass, setSavingPass] = useState(false);
  const [successPass, setSuccessPass] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctxUser) return;
    let cancelled = false;

    void (async () => {
      setEmail(ctxUser.email || '');
      const fromProfile = await parentFullNameForUserDeduped(ctxUser.id);
      if (cancelled) return;

      const fromRpc = pickNonEmpty(fromProfile ?? undefined);

      const meta = ctxUser.user_metadata as Record<string, unknown> | undefined;
      const metaName =
        typeof meta?.full_name === 'string'
          ? meta.full_name
          : typeof meta?.name === 'string'
            ? meta.name
            : undefined;

      const fromCache = pickNonEmpty(getCached<{ parentName?: string | null }>('parent_dashboard')?.parentName);

      setParentName(
        pickNonEmpty(fromRpc, metaName, fromCache, ctxUser.email?.split('@')[0]),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [ctxUser?.id]);

  const nameParts = splitFullName(parentName);

  const changePassword = async () => {
    if (password !== passwordConfirm) {
      setError(t('studentSettings.passwordMismatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('studentSettings.minChars'));
      return;
    }
    setSavingPass(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setSavingPass(false);
      return;
    }
    setSuccessPass(true);
    setPassword('');
    setPasswordConfirm('');
    setTimeout(() => setSuccessPass(false), 3000);
    setSavingPass(false);
  };

  const handleLogout = async () => {
    try {
      const prefix = 'tutlio_parent_profile_id_for_';
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <ParentLayout>
      <div className="px-4 pt-6 space-y-6 pb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 mb-1">{t('parent.settingsTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('parent.settingsSubtitle')}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-orange-100/40">
          <h2 className="font-bold text-gray-900 mb-4">{t('studentSettings.personalInfo')}</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  {t('parent.settingsFirstName')}
                </label>
                <p className="px-4 py-3 bg-[#fffefc] rounded-2xl text-sm text-gray-700 font-medium border border-orange-100/60">
                  {nameParts.first || '—'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  {t('parent.settingsLastName')}
                </label>
                <p className="px-4 py-3 bg-[#fffefc] rounded-2xl text-sm text-gray-700 font-medium border border-orange-100/60">
                  {nameParts.last || '—'}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                {t('common.email')}
              </label>
              <p className="px-4 py-3 bg-[#fffefc] rounded-2xl text-sm text-gray-700 font-medium border border-orange-100/60">
                {email || '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-orange-100/40">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">{t('studentSettings.passwordTitle')}</h2>
            {successPass && (
              <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                <Check className="w-3 h-3" /> {t('studentSettings.changed')}
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('studentSettings.newPassword')}
                className="w-full px-4 py-3 pr-12 bg-[#fffefc] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-orange-100/60"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-3 text-gray-400"
              >
                {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <input
              type={showPass ? 'text' : 'password'}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder={t('studentSettings.repeatPassword')}
              className="w-full px-4 py-3 bg-[#fffefc] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-orange-100/60"
            />
          </div>
          <button
            type="button"
            onClick={() => void changePassword()}
            disabled={savingPass || !password}
            className="mt-4 w-full py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {savingPass ? t('studentSettings.changing') : t('studentSettings.changePassword')}
          </button>
        </div>

        <PwaInstallGuide />

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full py-4 mt-2 rounded-3xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" /> {t('parent.logout')}
        </button>

        <div className="pb-4" />
      </div>
    </ParentLayout>
  );
}
