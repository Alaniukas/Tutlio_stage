import { useEffect, useState } from 'react';
import ParentLayout from '@/components/ParentLayout';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { Archive, Eye, EyeOff, Check, LogOut, BellOff, Bell, AlertTriangle, UserPlus, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import PwaInstallGuide from '@/components/PwaInstallGuide';
import { parentFullNameForUserDeduped } from '@/lib/preload';
import { getCached } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';

type MvChild = {
  studentId: string;
  fullName: string;
  email: string | null;
  linkedUserId: string | null;
  alreadyRequested: boolean;
  unpaid: boolean;
};

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

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

  const [disableLessonReminders, setDisableLessonReminders] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [mvChildrenLoading, setMvChildrenLoading] = useState(true);
  const [isMvParent, setIsMvParent] = useState(false);
  const [mvChildren, setMvChildren] = useState<MvChild[] | null>(null);
  const [addChildName, setAddChildName] = useState('');
  const [addChildEmail, setAddChildEmail] = useState('');
  const [addingChild, setAddingChild] = useState(false);
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, string>>({});
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [childBanner, setChildBanner] = useState<string | null>(null);

  const loadMvChildren = async () => {
    setMvChildrenLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/parent-child', { headers });
      if (!res.ok) {
        setIsMvParent(false);
        setMvChildren(null);
        return;
      }
      const body = await res.json().catch(() => null);
      if (!body?.isMoksloVaisiai) {
        setIsMvParent(false);
        setMvChildren(null);
        return;
      }
      const list = Array.isArray(body?.children) ? (body.children as MvChild[]) : [];
      setIsMvParent(true);
      setMvChildren(list);
      setInviteDrafts((prev) => {
        const next = { ...prev };
        for (const child of list) {
          if (next[child.studentId] === undefined) next[child.studentId] = child.email || '';
        }
        return next;
      });
    } catch {
      setIsMvParent(false);
      setMvChildren(null);
    } finally {
      setMvChildrenLoading(false);
    }
  };

  useEffect(() => {
    if (!ctxUser) {
      setMvChildrenLoading(false);
      return;
    }
    void loadMvChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxUser?.id]);

  useEffect(() => {
    if (!ctxUser) return;
    let cancelled = false;

    void (async () => {
      setEmail(ctxUser.email || '');
      const [fromProfile] = await Promise.all([
        parentFullNameForUserDeduped(ctxUser.id),
        supabase
          .from('parent_profiles')
          .select('disable_lesson_reminders')
          .eq('user_id', ctxUser.id)
          .maybeSingle()
          .then(({ data }) => {
            if (!cancelled && data) setDisableLessonReminders(!!data.disable_lesson_reminders);
          }),
      ]);
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

  const toggleLessonReminders = async () => {
    if (!ctxUser || savingReminders) return;
    setSavingReminders(true);
    const newVal = !disableLessonReminders;
    const { error: err } = await supabase
      .from('parent_profiles')
      .update({ disable_lesson_reminders: newVal })
      .eq('user_id', ctxUser.id);
    if (!err) setDisableLessonReminders(newVal);
    setSavingReminders(false);
  };

  const handleAddChild = async () => {
    if (!addChildName.trim() || addingChild) return;
    setAddingChild(true);
    setError(null);
    setChildBanner(null);
    try {
      const headers = await authHeaders();
      const inviteEmail = addChildEmail.trim();
      const res = await fetch('/api/parent-child', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'add',
          fullName: addChildName.trim(),
          email: inviteEmail || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error === 'invalid_email' ? t('parent.inviteChildInvalidEmail') : t('parent.addChildFailed'));
        return;
      }
      setAddChildName('');
      setAddChildEmail('');
      setChildBanner(
        body?.emailSent === false && inviteEmail
          ? t('parent.inviteChildFailed')
          : t('parent.addChildSuccess'),
      );
      await loadMvChildren();
    } catch {
      setError(t('parent.addChildFailed'));
    } finally {
      setAddingChild(false);
    }
  };

  const handleInviteChild = async (studentId: string) => {
    const email = (inviteDrafts[studentId] || '').trim();
    if (!email || inviteBusyId) return;
    if (!looksLikeEmail(email)) {
      setError(t('parent.inviteChildInvalidEmail'));
      return;
    }
    setInviteBusyId(studentId);
    setError(null);
    setChildBanner(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/parent-child', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'invite', studentId, email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error === 'invalid_email' ? t('parent.inviteChildInvalidEmail') : t('parent.inviteChildFailed'));
        return;
      }
      setChildBanner(t('parent.inviteChildSuccess'));
      await loadMvChildren();
    } catch {
      setError(t('parent.inviteChildFailed'));
    } finally {
      setInviteBusyId(null);
    }
  };

  const handleArchiveChild = async (studentId: string) => {
    if (archivingId) return;
    setArchivingId(studentId);
    setError(null);
    setChildBanner(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/parent-child', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'archive', studentId }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 409 || body?.unpaid) {
        setError(t('parent.archiveChildBlockedUnpaid'));
        setArchiveConfirmId(null);
        return;
      }
      if (!res.ok) {
        setError(t('parent.archiveChildFailed'));
        return;
      }
      setArchiveConfirmId(null);
      setChildBanner(t('parent.archiveChildPending'));
      await loadMvChildren();
    } catch {
      setError(t('parent.archiveChildFailed'));
    } finally {
      setArchivingId(null);
    }
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

        {childBanner && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-sm text-emerald-700 font-medium">
            {childBanner}
          </div>
        )}

        {mvChildrenLoading && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-orange-100/40 space-y-4 animate-pulse">
            <div className="h-5 w-40 bg-gray-100 rounded-lg" />
            <div className="h-3 w-full max-w-md bg-gray-100 rounded-lg" />
            <div className="h-28 bg-gray-50 rounded-2xl border border-gray-100" />
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('common.loading')}
            </div>
          </div>
        )}

        {!mvChildrenLoading && isMvParent && mvChildren && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-orange-100/40 space-y-5">
            <div>
              <h2 className="font-bold text-gray-900">{t('parent.childrenAccountsTitle')}</h2>
              <p className="text-xs text-gray-500 mt-1">{t('parent.childrenAccountsDesc')}</p>
            </div>

            <div className="rounded-2xl border border-orange-100/60 bg-[#fffefc] p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">{t('parent.addChildTitle')}</p>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {t('parent.addChildName')}
                </label>
                <input
                  type="text"
                  value={addChildName}
                  onChange={(e) => setAddChildName(e.target.value)}
                  className="w-full px-4 py-3 bg-white rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-orange-100/60"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {t('parent.addChildEmail')}
                </label>
                <input
                  type="email"
                  value={addChildEmail}
                  onChange={(e) => setAddChildEmail(e.target.value)}
                  placeholder={t('parent.addChildEmailPlaceholder')}
                  className="w-full px-4 py-3 bg-white rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-orange-100/60"
                />
                <p className="text-[11px] text-gray-500">{t('parent.addChildEmailHint')}</p>
              </div>
              <button
                type="button"
                disabled={addingChild || !addChildName.trim()}
                onClick={() => void handleAddChild()}
                className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                {addingChild ? t('common.saving') : t('parent.addChildCta')}
              </button>
            </div>

            {mvChildren.map((child) => (
              <div
                key={child.studentId}
                className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{child.fullName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {child.linkedUserId ? t('parent.childRegistered') : t('parent.childNotRegistered')}
                    </p>
                    {!child.linkedUserId && (
                      <p className="text-[11px] text-gray-400 mt-1">{t('parent.childNotRegisteredDesc')}</p>
                    )}
                  </div>
                </div>

                {!child.linkedUserId && !child.alreadyRequested && (
                  <div className="space-y-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-3">
                    <p className="text-xs font-semibold text-gray-500">{t('parent.inviteChildOptionalTitle')}</p>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {t('parent.addChildEmail')}
                    </label>
                    <input
                      type="email"
                      value={inviteDrafts[child.studentId] ?? ''}
                      onChange={(e) =>
                        setInviteDrafts((prev) => ({ ...prev, [child.studentId]: e.target.value }))
                      }
                      placeholder={t('parent.addChildEmailPlaceholder')}
                      className="w-full px-4 py-3 bg-white rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 border border-gray-100"
                    />
                    <p className="text-[11px] text-gray-500">{t('parent.addChildEmailHint')}</p>
                    <button
                      type="button"
                      disabled={inviteBusyId === child.studentId || !(inviteDrafts[child.studentId] || '').trim()}
                      onClick={() => void handleInviteChild(child.studentId)}
                      className="w-full py-2.5 rounded-xl border border-violet-200 text-violet-700 font-semibold text-sm hover:bg-violet-50 disabled:opacity-50"
                    >
                      {inviteBusyId === child.studentId ? t('common.saving') : t('parent.inviteChildCta')}
                    </button>
                  </div>
                )}

                {child.alreadyRequested ? (
                  <p className="text-sm text-amber-800 bg-amber-50 rounded-2xl px-4 py-3 font-medium">
                    {t('parent.archiveChildPending')}
                  </p>
                ) : child.unpaid ? (
                  <p className="text-sm text-red-700 bg-red-50 rounded-2xl px-4 py-3 font-medium">
                    {t('parent.archiveChildBlockedUnpaid')}
                  </p>
                ) : archiveConfirmId === child.studentId ? (
                  <div className="bg-red-50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700 font-medium">{t('parent.archiveChildConfirm')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setArchiveConfirmId(null)}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={archivingId === child.studentId}
                        onClick={() => void handleArchiveChild(child.studentId)}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-50"
                      >
                        {archivingId === child.studentId ? t('common.saving') : t('parent.archiveChildCta')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setArchiveConfirmId(child.studentId)}
                    className="w-full py-2.5 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    {t('parent.archiveChildTitle')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-3xl p-5 shadow-sm border border-orange-100/40">
          <h2 className="font-bold text-gray-900 mb-4">{t('parent.notificationsTitle')}</h2>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {disableLessonReminders
                ? <BellOff className="w-5 h-5 text-gray-400 shrink-0" />
                : <Bell className="w-5 h-5 text-orange-500 shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{t('parent.lessonRemindersLabel')}</p>
                <p className="text-xs text-gray-400">{t('parent.lessonRemindersDesc')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggleLessonReminders()}
              disabled={savingReminders}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 disabled:opacity-50 ${
                !disableLessonReminders ? 'bg-orange-500' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={!disableLessonReminders}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                  !disableLessonReminders ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
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
