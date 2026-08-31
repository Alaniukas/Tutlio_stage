/**
 * Enquiry form on a published landing page.
 *
 *   POST /api/public-page-lead  { slug, name, email, phone?, message?, subjectId?, requestedStart? }
 *
 * Deliberately a lead rather than a booking: an anonymous visitor has no student
 * account, no payment method and no session row, so we capture the request,
 * email the owner, and let them convert it in the app.
 */

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getFromEmail, getResendApiKey } from './_lib/resendConfig.js';
import { publicPageTimeZone } from '../src/lib/publicPageTime.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-page throttle so a published URL can't be used as a mail cannon. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_EMAIL_PER_WINDOW = 3;
const MAX_PER_PAGE_PER_WINDOW = 20;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'database-unavailable' });

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ error: 'invalid-json' });
  }

  const slug = String(body.slug ?? '').toLowerCase().trim();
  const name = String(body.name ?? '').trim().slice(0, 120);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const phone = String(body.phone ?? '').trim().slice(0, 40) || null;
  const message = String(body.message ?? '').trim().slice(0, 2000) || null;
  const offeringTitle = String(body.offeringTitle ?? '').trim().slice(0, 140) || null;
  const subjectId = String(body.subjectId ?? '').trim() || null;

  let requestedStart: string | null = null;
  if (body.requestedStart) {
    const parsed = new Date(String(body.requestedStart));
    if (!Number.isNaN(parsed.getTime())) requestedStart = parsed.toISOString();
  }

  if (!slug || !name || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid-input' });

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: page } = await supabase
      .from('public_pages')
      .select('id, slug, display_name, user_id, organization_id, booking_enabled, locale, timezone')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();

    if (!page) return res.status(404).json({ error: 'not-found' });
    if (!page.booking_enabled) return res.status(403).json({ error: 'enquiries-disabled' });

    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const [{ count: fromEmail }, { count: forPage }] = await Promise.all([
      supabase
        .from('public_page_leads')
        .select('id', { count: 'exact', head: true })
        .eq('public_page_id', page.id)
        .eq('email', email)
        .gte('created_at', since),
      supabase
        .from('public_page_leads')
        .select('id', { count: 'exact', head: true })
        .eq('public_page_id', page.id)
        .gte('created_at', since),
    ]);

    if ((fromEmail ?? 0) >= MAX_PER_EMAIL_PER_WINDOW || (forPage ?? 0) >= MAX_PER_PAGE_PER_WINDOW) {
      return res.status(429).json({ error: 'too-many-requests' });
    }

    const { error: insertError } = await supabase.from('public_page_leads').insert({
      public_page_id: page.id,
      subject_id: subjectId,
      offering_title: offeringTitle,
      requested_start: requestedStart,
      name,
      email,
      phone,
      message,
    });
    if (insertError) throw new Error(insertError.message);

    // The lead is saved either way; a mail failure must not lose it.
    const apiKey = getResendApiKey();
    if (apiKey) {
      // A solo tutor's page notifies the tutor; an organization's page notifies
      // the org mailbox, since organization-owned rows have no user_id.
      const { data: owner } = page.user_id
        ? await supabase
            .from('profiles')
            .select('email, preferred_locale')
            .eq('id', page.user_id)
            .maybeSingle()
        : await supabase
            .from('organizations')
            .select('email, preferred_locale')
            .eq('id', page.organization_id)
            .maybeSingle();

      if (owner?.email) {
        const recipientLocale = owner.preferred_locale || page.locale;
        const lt = recipientLocale === 'lt';
        const nl = recipientLocale === 'nl';
        const timeZone = publicPageTimeZone(page.timezone);
        const when = requestedStart
          ? `${new Date(requestedStart).toLocaleString(nl ? 'nl-NL' : lt ? 'lt-LT' : 'en-GB', { timeZone })} (${timeZone})`
          : '—';

        const rows: [string, string][] = [
          [nl ? 'Naam' : lt ? 'Vardas' : 'Name', escapeHtml(name)],
          [nl ? 'E-mailadres' : 'El. paštas', `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`],
          [nl ? 'Telefoonnummer' : lt ? 'Telefonas' : 'Phone', escapeHtml(phone) || '—'],
          [nl ? 'Les' : lt ? 'Pamoka' : 'Lesson', escapeHtml(offeringTitle) || '—'],
          [nl ? 'Gewenst tijdstip' : lt ? 'Pageidaujamas laikas' : 'Preferred time', escapeHtml(when)],
          [nl ? 'Bericht' : lt ? 'Žinutė' : 'Message', escapeHtml(message) || '—'],
        ];

        const html = `
          <div${nl ? ' lang="nl"' : ''} style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#1f2937;margin-bottom:4px;">${nl ? 'Nieuwe aanvraag via je pagina' : lt ? 'Nauja užklausa iš jūsų puslapio' : 'New enquiry from your page'}</h2>
            <p style="color:#6b7280;font-size:13px;margin-top:0;">/${escapeHtml(page.slug)}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
              ${rows.map(([label, value], i) => `
                <tr${i % 2 ? ' style="background:#f9fafb;"' : ''}>
                  <td style="padding:8px 12px;font-weight:600;color:#6b7280;width:170px;">${label}</td>
                  <td style="padding:8px 12px;color:#1f2937;">${value}</td>
                </tr>`).join('')}
            </table>
          </div>`;

        try {
          await new Resend(apiKey).emails.send({
            from: getFromEmail(),
            to: owner.email,
            replyTo: email,
            subject: nl ? `Nieuwe aanvraag: ${name}` : lt ? `Nauja užklausa: ${name}` : `New enquiry: ${name}`,
            html,
          });
        } catch (mailErr) {
          console.error('[public-page-lead] mail failed', mailErr);
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[public-page-lead]', err);
    return res.status(500).json({ error: 'internal-error' });
  }
}
