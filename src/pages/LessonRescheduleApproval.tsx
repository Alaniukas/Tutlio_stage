import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation, isValidLocale, t as translate } from '@/lib/i18n';
import { LOCALE_FORMAT_TAGS } from '@/lib/i18n/locales';
import { lessonRescheduleApprovalErrorKey, lessonRescheduleApprovalText } from '@/lib/i18n/lessonRescheduleApprovalCopy';
import type { LessonRescheduleApprovalPreview } from '@/lib/lessonRescheduleApproval';

export default function LessonRescheduleApproval() {
  const [params] = useSearchParams();
  const { locale, t } = useTranslation();
  const request = params.get('request') || '';
  const recipient = params.get('recipient') || '';
  const token = params.get('t') || '';
  const [preview, setPreview] = useState<LessonRescheduleApprovalPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const language = isValidLocale(preview?.locale) ? preview.locale : locale;
  const label = (key: string) => translate(language, key);
  const text = (key: Parameters<typeof lessonRescheduleApprovalText>[1]) => lessonRescheduleApprovalText(language, key,
    { tutor: preview?.tutorName || '', student: preview?.studentName || '' });

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setPreview(null);
    setError('');
    void (async () => {
      try {
        const query = new URLSearchParams({ request, recipient, t: token });
        const response = await fetch(`/api/lesson-reschedule-approval?${query}`, { signal: abort.signal });
        const json = await response.json();
        if (!response.ok) throw new Error(json.code || 'reschedule_error');
        if (!abort.signal.aborted) setPreview(json);
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'reschedule_error');
      } finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, [request, recipient, token]);

  const respond = async (decision: 'approved' | 'rejected') => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/lesson-reschedule-approval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, recipient, t: token, decision }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.code || 'reschedule_error');
      setPreview(json);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'reschedule_error'); }
    finally { setSubmitting(false); }
  };
  const format = (value: string) => new Intl.DateTimeFormat(LOCALE_FORMAT_TAGS[language as keyof typeof LOCALE_FORMAT_TAGS] || 'en-GB', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Vilnius',
  }).format(new Date(value));
  const actionable = preview?.status === 'pending' && !preview.recipientApproved;
  const statusKey = preview?.status === 'pending'
    ? preview.recipientApproved ? 'waiting' : 'pending'
    : preview?.status === 'approved' ? 'approved' : preview?.status === 'rejected' ? 'rejected' : 'expired';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {loading ? <div className="flex items-center gap-3 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />{t('common.loading')}</div> : (
          <>
            {preview && <p className="mb-3 font-semibold" style={{ color: preview.brandColor }}>{preview.organizationName}</p>}
            <h1 className="text-2xl font-bold text-slate-900">{text('title')}</h1>
            {preview && <>
              {actionable && <p className="mt-4 text-slate-600">{text('intro')}</p>}
              <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-700" role="status">{text(statusKey)}</p>
              <p className="mt-5 font-semibold">{text(preview.scope === 'future' ? 'future' : 'single')}</p>
              <dl className="mt-4 space-y-4 text-sm">
                <div><dt className="font-medium text-slate-500">{label('em.rescheduleOldInfo')}</dt><dd className="mt-1">{format(preview.oldStart)} - {format(preview.oldEnd)}</dd></div>
                <div><dt className="font-medium text-slate-500">{label('em.rescheduleNewInfo')}</dt><dd className="mt-1">{format(preview.newStart)} - {format(preview.newEnd)}</dd></div>
                <div><dt className="font-medium text-slate-500">{label('common.rescheduleReason')}</dt><dd className="mt-1 whitespace-pre-wrap">{preview.reason}</dd></div>
              </dl>
            </>}
            {error && <p className="mt-4 text-sm text-red-700" role="alert">{text(lessonRescheduleApprovalErrorKey(error))}</p>}
            {actionable && <div className="mt-6 flex flex-wrap gap-3">
              <Button disabled={submitting} onClick={() => void respond('approved')} style={{ backgroundColor: preview.brandColor }}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{text('confirm')}
              </Button>
              <Button variant="outline" disabled={submitting} onClick={() => void respond('rejected')}>{text('reject')}</Button>
            </div>}
          </>
        )}
      </div>
    </main>
  );
}
