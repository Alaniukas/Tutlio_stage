/** Local, synthetic previews only. No environment files, delivery or DB writes. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SUPPORTED_LOCALES, LOCALE_NAMES } from '../src/lib/i18n/locales.js';

process.env.RESEND_API_KEY = 're_local_preview_only';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-preview-only';
process.env.APP_URL = 'https://example.com';
// Fail closed if the endpoint ever attempts delivery or a database lookup.
globalThis.fetch = async () => { throw new Error('Network access is disabled for locale previews'); };
const { default: handler } = await import('../api/send-email.js');
const directory = resolve(process.argv[2] || '/tmp/tutlio-locale-email-previews');
await mkdir(directory, { recursive: true });

const examples = {
  tutor_student_assigned: { tutorName: 'Alex', studentName: 'Sam', studentEmail: 'sam@example.com', studentPhone: '+421 900 123 456' },
  lesson_status_confirmation_reminder: { tutorName: 'Alex', count: 3, lessons: [{ student: 'Sam', date: '2026-08-31', time: '14:30' }] },
  payment_reminder: { tutorName: 'Alex', studentName: 'Sam', recipientName: 'Parent', date: '2026-08-31', time: '14:30', price: 25,
    manualPaymentInstructions: true, payerIsParent: true, bankDetails: 'Example bank\nExample account: DEMO-123', deadlineHours: 48, paymentTiming: 'before_lesson' },
  payment_after_lesson_reminder: { tutorName: 'Alex', studentName: 'Sam', recipientName: 'Parent', date: '2026-09-02', time: '16:30',
    amount: 25, payByTime: '2026-09-04 16:30', paymentUrl: 'https://example.com/pay' },
  prepaid_package_request: { tutorName: 'Alex', studentName: 'Sam', recipientName: 'Parent', totalLessons: 5,
    subjectName: 'Algebra', pricePerLesson: 25, totalPrice: 125, paymentLink: 'https://example.com/pay' },
  monthly_invoice: { tutorName: 'Alex', studentName: 'Sam', recipientName: 'Parent', periodText: '2026-08', totalAmount: 25,
    dueDate: '2026-09-04', paymentUrl: 'https://example.com/pay', sessions: [{ date: '2026-08-31', time: '16:30', subject: 'Algebra', price: 25 }] },
  payment_deadline_warning_org_admin: { recipientName: 'Admin', studentName: 'Sam', assignedTutorName: 'Alex',
    sessionDate: '2026-09-02', sessionTime: '16:30', price: 25, deadlineTime: '2026-09-01 16:30' },
  manual_package_request: { recipientName: 'Parent', studentName: 'Sam', orgName: 'Example Academy', totalLessons: 5,
    pricePerLesson: 25, totalPrice: 125, subjectName: 'Algebra', bankDetails: 'Example account: DEMO-123', paymentUrl: '' },
};
const links: string[] = [];
for (const locale of SUPPORTED_LOCALES) {
  for (const [type, data] of Object.entries(examples)) {
    let status = 0;
    let result: { dryRun?: boolean; html?: string; subject?: string } = {};
    const response = {
      status(code: number) { status = code; return this; },
      json(body: typeof result) { result = body; return this; },
      setHeader() { return this; },
    };
    await handler({
      method: 'POST', headers: { 'x-internal-key': 'local-preview-only' }, query: {},
      body: { type, locale, to: 'qa@example.com', dryRun: true, data },
    } as never, response as never);
    if (status !== 200 || result.dryRun !== true || !result.html) throw new Error(`${locale}/${type}: preview failed (${status})`);
    const name = `${locale}-${type}.html`;
    await writeFile(resolve(directory, name), result.html);
    links.push(`<li><a href="${name}" target="preview">${LOCALE_NAMES[locale]} — ${type}</a></li>`);
  }
}
await writeFile(resolve(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Locale email previews</title>
<style>body{font-family:system-ui;margin:24px} main{display:flex;gap:24px}nav{max-height:85vh;overflow:auto}iframe{width:390px;height:844px;border:1px solid #ddd;flex-shrink:0}li{margin:8px}</style>
<h1>Locale email previews</h1><p>Synthetic examples only. Nothing was sent. This browser preview does not replace email-client or native-language review.</p>
<main><nav><ul>${links.join('')}</ul></nav><iframe name="preview" title="390px email preview" src="he-tutor_student_assigned.html"></iframe></main></html>`);
console.log(`Created ${SUPPORTED_LOCALES.length * Object.keys(examples).length} offline email previews in ${directory}`);
