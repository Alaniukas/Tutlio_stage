import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { t, type Locale } from './i18n.js';
import { isMoksloVaisiaiOrg } from './marketMoney.js';
import { supabaseServiceRoleClientOptions } from './supabaseServiceRoleClientOptions.js';

export const MV_PAYER_FEE_NOTICE_FEATURE_KEY = 'mv_payer_fee_notice_emails';

export function normalizeMvPayerEmail(email: unknown): string {
  return String(email || '').trim().toLowerCase();
}

export function mvPayerFeeNoticeSentSet(features: unknown): Set<string> {
  const obj = features && typeof features === 'object' && !Array.isArray(features)
    ? (features as Record<string, unknown>)
    : {};
  const raw = obj[MV_PAYER_FEE_NOTICE_FEATURE_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.map((v) => normalizeMvPayerEmail(v)).filter(Boolean));
}

function mvPayerPaymentInfoBenefits(locale: Locale): string[] {
  return [
    t(locale, 'em.mvPayerPaymentInfoBenefit1'),
    t(locale, 'em.mvPayerPaymentInfoBenefit2'),
    t(locale, 'em.mvPayerPaymentInfoBenefit3'),
    t(locale, 'em.mvPayerPaymentInfoBenefit4'),
  ];
}

export function mvPayerFeeNoticeFooterHtml(locale: Locale): string {
  const benefits = mvPayerPaymentInfoBenefits(locale)
    .map(
      (line) => `<tr>
  <td style="padding:5px 0;vertical-align:top;width:22px;font-size:14px;line-height:1.5;color:#124410;">&#10003;</td>
  <td style="padding:5px 0 5px 8px;font-size:13px;line-height:1.55;color:#4b5563;">${line}</td>
</tr>`,
    )
    .join('');

  return `<div style="padding:8px 24px 20px;margin:0;">
  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;">
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1f2937;">${t(locale, 'em.mvPayerPaymentInfoTitle')}</p>
    <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#4b5563;">${t(locale, 'em.mvPayerPaymentInfoLead')}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">${benefits}</table>
    <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.55;color:#9ca3af;">${t(locale, 'em.mvPayerPaymentInfoFeeNote')}</p>
  </div>
</div>`;
}

export function appendMvPayerFeeNoticeBeforeFooter(html: string, footerHtml: string): string {
  if (!footerHtml) return html;
  const marker = '<div class="footer">';
  const idx = html.indexOf(marker);
  if (idx >= 0) return `${html.slice(0, idx)}${footerHtml}${html.slice(idx)}`;
  return html.replace(/<\/body>/i, `${footerHtml}</body>`);
}

function serviceSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions());
}

export async function isMvOrgPayerEmail(
  supabase: SupabaseClient,
  organizationId: string | null | undefined,
  recipientEmail: string,
): Promise<boolean> {
  const orgId = String(organizationId || '').trim();
  const email = normalizeMvPayerEmail(recipientEmail);
  if (!orgId || !email || !isMoksloVaisiaiOrg(orgId)) return false;

  const { count, error } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .ilike('payer_email', email);

  return !error && (count ?? 0) > 0;
}

export async function shouldAppendMvPayerFirstFeeNotice(
  supabase: SupabaseClient,
  organizationId: string | null | undefined,
  recipientEmail: string,
): Promise<boolean> {
  const orgId = String(organizationId || '').trim();
  const email = normalizeMvPayerEmail(recipientEmail);
  if (!orgId || !email || !isMoksloVaisiaiOrg(orgId)) return false;
  if (!(await isMvOrgPayerEmail(supabase, orgId, email))) return false;

  const { data } = await supabase
    .from('organizations')
    .select('features')
    .eq('id', orgId)
    .maybeSingle();

  const sent = mvPayerFeeNoticeSentSet(data?.features);
  return !sent.has(email);
}

export async function markMvPayerFeeNoticeSent(
  supabase: SupabaseClient,
  organizationId: string | null | undefined,
  recipientEmail: string,
): Promise<void> {
  const orgId = String(organizationId || '').trim();
  const email = normalizeMvPayerEmail(recipientEmail);
  if (!orgId || !email || !isMoksloVaisiaiOrg(orgId)) return;

  const { data } = await supabase
    .from('organizations')
    .select('features')
    .eq('id', orgId)
    .maybeSingle();

  const features = (data?.features as Record<string, unknown> | null) ?? {};
  const sent = mvPayerFeeNoticeSentSet(features);
  if (sent.has(email)) return;
  sent.add(email);

  await supabase
    .from('organizations')
    .update({
      features: {
        ...features,
        [MV_PAYER_FEE_NOTICE_FEATURE_KEY]: [...sent],
      },
    })
    .eq('id', orgId);
}

export async function maybeMvPayerFirstFeeNoticeFooter(
  organizationId: string | null | undefined,
  recipientEmail: string,
  locale: Locale,
  supabase?: SupabaseClient | null,
): Promise<string> {
  const sb = supabase ?? serviceSupabase();
  if (!sb) return '';
  const include = await shouldAppendMvPayerFirstFeeNotice(sb, organizationId, recipientEmail);
  return include ? mvPayerFeeNoticeFooterHtml(locale) : '';
}

export async function finalizeMvPayerFirstFeeNoticeAfterSend(
  organizationId: string | null | undefined,
  recipientEmail: string,
  included: boolean,
  supabase?: SupabaseClient | null,
): Promise<void> {
  if (!included) return;
  const sb = supabase ?? serviceSupabase();
  if (!sb) return;
  await markMvPayerFeeNoticeSent(sb, organizationId, recipientEmail);
}
