import type { VercelRequest, VercelResponse } from './types';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY_STAGE || process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'Tutlio <onboarding@tutlio.lt>';
const NOTIFY_EMAILS = ['simas0423@gmail.com', 'alaniukasa@gmail.com'];

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: Record<string, unknown>;
  try {
    const raw = req.body;
    body = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const companyName = String(body.company_name || '').trim();
  const licenseCount = Number(body.license_count) || 0;
  const contactName = String(body.contact_name || '').trim();
  const contactSurname = String(body.contact_surname || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim() || null;
  const message = String(body.message || '').trim() || null;

  if (!companyName || !contactName || !contactSurname || !email || licenseCount < 1) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const supabase = getSupabase();

    const { error: dbError } = await supabase.from('enterprise_contacts').insert({
      company_name: companyName,
      license_count: licenseCount,
      contact_name: contactName,
      contact_surname: contactSurname,
      email,
      phone,
      message,
    });

    if (dbError) {
      console.error('enterprise_contacts insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save contact request' });
    }

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1f2937; margin-bottom: 16px;">New Enterprise Contact Request</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 12px; font-weight: 600; color: #6b7280; width: 140px;">Company</td><td style="padding: 8px 12px; color: #1f2937;">${companyName}</td></tr>
          <tr style="background: #f9fafb;"><td style="padding: 8px 12px; font-weight: 600; color: #6b7280;">Licenses needed</td><td style="padding: 8px 12px; color: #1f2937;">${licenseCount}</td></tr>
          <tr><td style="padding: 8px 12px; font-weight: 600; color: #6b7280;">Contact person</td><td style="padding: 8px 12px; color: #1f2937;">${contactName} ${contactSurname}</td></tr>
          <tr style="background: #f9fafb;"><td style="padding: 8px 12px; font-weight: 600; color: #6b7280;">Email</td><td style="padding: 8px 12px; color: #1f2937;"><a href="mailto:${email}" style="color: #4f46e5;">${email}</a></td></tr>
          <tr><td style="padding: 8px 12px; font-weight: 600; color: #6b7280;">Phone</td><td style="padding: 8px 12px; color: #1f2937;">${phone || '—'}</td></tr>
          <tr style="background: #f9fafb;"><td style="padding: 8px 12px; font-weight: 600; color: #6b7280;">Message</td><td style="padding: 8px 12px; color: #1f2937;">${message || '—'}</td></tr>
        </table>
      </div>
    `;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_EMAILS,
      subject: `[Tutlio] Enterprise request from ${companyName}`,
      html: emailHtml,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('enterprise-contact error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
