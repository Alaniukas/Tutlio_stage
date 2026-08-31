import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from './types.js';
import { getFromEmail, getResendApiKey, INTERNAL_NOTIFY_EMAILS } from './_lib/resendConfig.js';
import { escapeSupportHtml, parseSupportContact } from './_lib/supportContact.js';
import { allowSupportRequest } from './_lib/supportRequest.js';
import {
  persistSupportContactRequest,
  updateSupportContactDelivery,
  verifySupportAttachment,
} from './_lib/supportPersistence.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowSupportRequest(req, res, 'contact', 5)) return;

  let rawBody: unknown;
  try {
    rawBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const payload = parseSupportContact(rawBody);
  if (!payload) {
    return res.status(400).json({ error: 'Name, valid email, and a message are required.' });
  }

  // Honeypot: accept silently so automated form fillers do not retry.
  if (payload.isBot) return res.status(200).json({ success: true });

  const sessionId = payload.sessionId || randomUUID();
  const requestId = payload.requestId || randomUUID();
  let attachment: Awaited<ReturnType<typeof verifySupportAttachment>> = null;
  let contactRequestId: number;

  try {
    attachment = await verifySupportAttachment(sessionId, payload.attachment);
    contactRequestId = await persistSupportContactRequest({
      sessionId,
      requestId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      message: payload.message,
      page: payload.page,
      locale: payload.locale,
      attachment,
    });
  } catch (error) {
    console.error('[support-contact] Persistence failed:', error);
    return res.status(500).json({ error: 'Could not securely save the support request.' });
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    await updateSupportContactDelivery(contactRequestId, 'failed').catch((error) => {
      console.error('[support-contact] Could not mark failed delivery:', error);
    });
    return res.status(503).json({ error: 'Email support is not configured.' });
  }

  const transcript = payload.conversation.length > 0
    ? payload.conversation
      .map((item) => `<p style="margin:0 0 10px"><strong>${item.role === 'user' ? 'User' : 'Tutlio AI'}:</strong><br>${escapeSupportHtml(item.content).replace(/\n/g, '<br>')}</p>`)
      .join('')
    : '<p style="color:#6b7280">No chat transcript supplied.</p>';
  const attachmentHtml = attachment
    ? `<p style="margin:8px 0 0"><a href="${escapeSupportHtml(attachment.signedUrl)}" style="color:#4338ca;font-weight:600">Open attached image (${escapeSupportHtml(attachment.name)})</a><br><span style="color:#6b7280;font-size:12px">Private link expires in 7 days · ${Math.max(1, Math.round(attachment.size / 1024))} KB</span></p>`
    : '<p style="color:#6b7280">No image attached.</p>';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#111827">
      <div style="display:inline-block;padding:5px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:700">TUTLIO SUPPORT</div>
      <h2 style="margin:14px 0 18px">New support request</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 12px;font-weight:600;color:#6b7280;width:120px">Name</td><td style="padding:8px 12px">${escapeSupportHtml(payload.name)}</td></tr>
        <tr style="background:#f9fafb"><td style="padding:8px 12px;font-weight:600;color:#6b7280">Email</td><td style="padding:8px 12px"><a href="mailto:${escapeSupportHtml(payload.email)}">${escapeSupportHtml(payload.email)}</a></td></tr>
        <tr><td style="padding:8px 12px;font-weight:600;color:#6b7280">Phone</td><td style="padding:8px 12px">${escapeSupportHtml(payload.phone || '—')}</td></tr>
        <tr style="background:#f9fafb"><td style="padding:8px 12px;font-weight:600;color:#6b7280">Page</td><td style="padding:8px 12px">${escapeSupportHtml(payload.page)}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:600;color:#6b7280">Locale</td><td style="padding:8px 12px">${escapeSupportHtml(payload.locale)}</td></tr>
      </table>
      <h3 style="margin:22px 0 8px">Message</h3>
      <div style="padding:14px;border:1px solid #e5e7eb;border-radius:12px;line-height:1.55">${escapeSupportHtml(payload.message).replace(/\n/g, '<br>')}</div>
      <h3 style="margin:22px 0 8px">Attachment</h3>
      <div style="padding:14px;background:#f9fafb;border-radius:12px;line-height:1.5">${attachmentHtml}</div>
      <h3 style="margin:22px 0 8px">Recent AI support chat</h3>
      <div style="padding:14px;background:#f9fafb;border-radius:12px;line-height:1.5">${transcript}</div>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    const shortMessage = payload.message.replace(/[\r\n]+/g, ' ').slice(0, 70);
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: INTERNAL_NOTIFY_EMAILS,
      replyTo: payload.email,
      subject: `[Tutlio support] ${payload.name}: ${shortMessage}`,
      html,
    });

    if (error) {
      console.error('[support-contact] Resend error:', error);
      await updateSupportContactDelivery(contactRequestId, 'failed').catch((updateError) => {
        console.error('[support-contact] Could not mark failed delivery:', updateError);
      });
      return res.status(502).json({ error: 'Could not send the support request.' });
    }

    await updateSupportContactDelivery(contactRequestId, 'sent', data?.id).catch((updateError) => {
      console.error('[support-contact] Could not mark sent delivery:', updateError);
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[support-contact] Failed:', error);
    await updateSupportContactDelivery(contactRequestId, 'failed').catch((updateError) => {
      console.error('[support-contact] Could not mark failed delivery:', updateError);
    });
    return res.status(500).json({ error: 'Could not send the support request.' });
  }
}
