import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { isNotificationKey, type NotificationChoice, type NotificationKey, type NotificationPortal } from '@/lib/notificationPreferences';

/** One personal settings surface shared by tutor, student, parent and org admin. */
export default function NotificationPreferencesSettings({ portal }: { portal: NotificationPortal }) {
  const { user } = useUser();
  const { t } = useTranslation();
  const [choices, setChoices] = useState<NotificationChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<NotificationKey | null>(null);
  const [error, setError] = useState<'load' | 'save' | null>(null);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    pending.current = false;
    setChoices([]); setLoading(true); setError(null); setSaving(null); setSaved(false);
    if (!user) return () => { ++generation.current; controller.abort(); };
    void (async () => {
      try {
        const response = await fetch(`/api/notification-preferences?portal=${portal}`, {
          headers: await authHeaders(), signal: controller.signal,
        });
        if (!response.ok) throw new Error('Preferences unavailable');
        const body = await response.json();
        if (!Array.isArray(body.choices) || !body.choices.every((row: NotificationChoice) =>
          isNotificationKey(row.key) && typeof row.enabled === 'boolean')) throw new Error('Invalid preferences');
        if (generation.current === current) setChoices(body.choices);
      } catch {
        if (generation.current === current) setError('load');
      } finally {
        if (generation.current === current) setLoading(false);
      }
    })();
    return () => { ++generation.current; controller.abort(); };
  }, [user?.id, portal, attempt]);

  const save = async (key: NotificationKey, enabled: boolean) => {
    if (!user || pending.current) return;
    pending.current = true;
    const current = generation.current;
    setSaving(key); setError(null); setSaved(false);
    try {
      const result = await supabase.rpc('set_user_notification_preference', { p_category: key, p_enabled: enabled });
      if (result.error || result.data !== enabled) throw new Error('Save failed');
      if (generation.current !== current) return;
      setChoices(rows => rows.map(row => row.key === key ? { ...row, enabled } : row));
      setSaved(true);
    } catch {
      if (generation.current === current) setError('save');
    } finally {
      if (generation.current === current) { pending.current = false; setSaving(null); }
    }
  };

  return (
    <section id="notifications" aria-labelledby={`notifications-${portal}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 scroll-mt-24">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-indigo-600" />
        </div>
        <h2 id={`notifications-${portal}`} className="text-base font-semibold text-gray-900">{t('notifications.title')}</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t(portal === 'org_admin' ? 'notifications.personalDesc' : 'notifications.desc')}</p>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{t('common.loading')}</p>}
      {error && <div role="alert" className="mb-3 text-sm text-red-600">
        {t(error === 'load' ? 'notifications.loadError' : 'notifications.saveError')}
        {error === 'load' && <button type="button" onClick={() => setAttempt(value => value + 1)} className="ms-2 underline">{t('notifications.retry')}</button>}
      </div>}
      {!loading && error !== 'load' && <div className="divide-y divide-gray-100">
        {choices.map(({ key, enabled }) => (
          <label key={key} className="flex items-start gap-3 py-3 cursor-pointer">
            <input type="checkbox" checked={enabled} disabled={saving !== null}
              onChange={event => void save(key, event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 accent-indigo-600 disabled:opacity-50" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">{t(`notifications.${key}`)}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{t(`notifications.${key}Desc`)}</span>
            </span>
            {saving === key && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-indigo-600" />}
          </label>
        ))}
      </div>}
      <p className="mt-4 text-xs text-gray-500">{t('notifications.required')}</p>
      <div role="status" aria-live="polite" className="mt-2 text-xs text-green-700">
        {saved && <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />{t('notifications.saved')}</span>}
      </div>
    </section>
  );
}
