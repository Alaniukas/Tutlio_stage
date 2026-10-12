import { lessonRescheduleApprovalText } from '../../src/lib/i18n/lessonRescheduleApprovalCopy.js';
import { LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales.js';
import { t, type Locale } from './i18n.js';
import { outlookEmailButton } from './outlookEmail.js';

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function dateTime(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_FORMAT_TAGS[locale] || 'en-GB', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Vilnius',
  }).format(new Date(value));
}

/** Returns the content for the existing white-label email wrapper. All values
 * are supplied by the service API; users cannot invoke these email types. */
export function lessonRescheduleApprovalEmail(type: 'proposal' | 'decision', d: any, locale: Locale) {
  const text = (key: Parameters<typeof lessonRescheduleApprovalText>[1]) =>
    escape(lessonRescheduleApprovalText(locale, key, { student: d.studentName || '', tutor: d.tutorName || '' }));
  const body = type === 'proposal' ? text('intro') : text(d.status === 'approved' ? 'tutorApproved' : 'tutorRejected');
  const section = (label: string, start: string, end: string) =>
    `<div style="padding:16px;background:#f8fafc;border-radius:12px;margin:12px 0"><strong>${escape(label)}</strong><p>${escape(dateTime(start, locale))} - ${escape(new Intl.DateTimeFormat(LOCALE_FORMAT_TAGS[locale] || 'en-GB', { timeStyle: 'short', timeZone: 'Europe/Vilnius' }).format(new Date(end)))}</p></div>`;
  return {
    subject: lessonRescheduleApprovalText(locale, 'title'),
    html: `<div style="padding:28px 24px;color:#334155">
      <h2>${text('title')}</h2><p>${body}</p><p><strong>${text(d.scope === 'future' ? 'future' : 'single')}</strong></p>
      ${section(t(locale, 'em.rescheduleOldInfo'), d.oldStart, d.oldEnd)}
      ${section(t(locale, 'em.rescheduleNewInfo'), d.newStart, d.newEnd)}
      <p><strong>${escape(t(locale, 'em.rescheduleReason'))}</strong><br/>${escape(d.reason)}</p>
      ${type === 'proposal' ? `<p>${text('pending')}</p>
        <div style="margin:20px 0">${outlookEmailButton(escape(d.confirmUrl), text('confirm'), '#16a34a')}</div>
        <div style="margin:20px 0">${outlookEmailButton(escape(d.rejectUrl), text('reject'), '#64748b')}</div>` : ''}
    </div>`,
  };
}
