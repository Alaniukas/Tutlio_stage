/**
 * Shared org white-label branding for emails (logo, colors, Pro Klasė from/signature).
 * Used by /api/send-email and in-process invite senders that cannot call send-email over HTTP.
 */
import { isMoksloVaisiaiOrg, isProKlaseOrg } from './marketMoney.js';
import { t, type Locale } from './i18n.js';
import { headerInlineStyle as outlookHeaderInlineStyle } from './outlookEmail.js';

export type EmailBranding = {
  name: string;
  logo_url: string | null;
  brand_color: string;
  brand_color_secondary?: string;
  /** Hide the "powered by Tutlio" line under the logo (full white-label). */
  hidePoweredBy?: boolean;
  /** Logo art sits on a black square — pad it so headers stay readable. */
  logoOnDark?: boolean;
};

export type OrgRowForEmailBranding = {
  name?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  brand_color_secondary?: string | null;
  features?: unknown;
};

export type EmailOrgBrandingResolved = {
  branding: EmailBranding | null;
  isProKlase: boolean;
  emailTeamSignature?: string;
  emailSenderName?: string;
  publicName?: string;
  emailContactPhone?: string;
  emailContactEmail?: string;
  /** Show “powered by Tutlio” in the email footer (logo header can stay white-label). */
  emailFooterPoweredBy?: boolean;
};

/** Default Tutlio wordmark variants that appear in wrap() / invite HTML. */
export const DEFAULT_TUTLIO_HEADER_MARKERS = [
  `<span style="font-size:26px;font-weight:900;color:#4f46e5;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>`,
  `<span style="font-size:26px;font-weight:900;color:#7c3aed;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>`,
] as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function headerInlineStyle(a: string, b: string): string {
  return `background-color:${a};background:linear-gradient(135deg, ${a} 0%, ${b} 100%);padding:32px 24px;text-align:center;`;
}

const ACCENT_COLORS = [
  '#4f46e5',
  '#6366f1',
  '#7c3aed',
  '#6d28d9',
  '#8b5cf6',
  '#10b981',
  '#059669',
  '#047857',
  '#ef4444',
  '#b91c1c',
  '#f97316',
  '#f59e0b',
  '#d97706',
  '#3b82f6',
  '#2563eb',
  '#0d9488',
  '#14b8a6',
  '#b45309',
  '#92400e',
  '#64748b',
  '#475569',
  '#dc2626',
  '#ea580c',
];

const HEADER_PAIRS: [string, string][] = [
  ['#6366f1', '#8b5cf6'],
  ['#6366f1', '#4f46e5'],
  ['#8b5cf6', '#6366f1'],
  ['#7c3aed', '#6d28d9'],
  ['#ef4444', '#f97316'],
  ['#ef4444', '#b91c1c'],
  ['#f59e0b', '#f97316'],
  ['#f59e0b', '#d97706'],
  ['#10b981', '#059669'],
  ['#059669', '#10b981'],
  ['#059669', '#047857'],
  ['#3b82f6', '#2563eb'],
  ['#0d9488', '#14b8a6'],
  ['#b45309', '#92400e'],
  ['#64748b', '#475569'],
];

/**
 * Resolve email branding for any recipient (student / parent / tutor / admin).
 * Pro Klasė always gets full white-label (logo + from + signature), even if
 * `custom_branding` were toggled off — product requirement for all user roles.
 */
export function resolveEmailOrgBranding(
  orgId: string | null | undefined,
  org: OrgRowForEmailBranding | null | undefined,
): EmailOrgBrandingResolved {
  if (!orgId || !org) {
    return { branding: null, isProKlase: false };
  }
  const features =
    org.features && typeof org.features === 'object' && !Array.isArray(org.features)
      ? (org.features as Record<string, unknown>)
      : {};
  const publicName = String((features.public_name as string) || '').trim() || undefined;
  const proKlase = isProKlaseOrg(orgId);
  const moksloVaisiai = isMoksloVaisiaiOrg(orgId);
  const useBranding = features.custom_branding === true || proKlase || moksloVaisiai;
  const hidePoweredBy = proKlase || moksloVaisiai || features.hide_powered_by === true;
  const customTeamSignature = String((features.email_team_signature as string) || '').trim();
  const customSenderName = String((features.email_sender_name as string) || '').trim();
  const contactPhone = String((features.contact_phone as string) || '').trim();
  const contactEmail = String((features.contact_email as string) || '').trim();

  const out: EmailOrgBrandingResolved = {
    branding: null,
    isProKlase: proKlase,
    publicName,
  };
  if (contactPhone) out.emailContactPhone = contactPhone;
  if (contactEmail) out.emailContactEmail = contactEmail;
  if (!proKlase && !moksloVaisiai && features.email_footer_powered_by === true) {
    out.emailFooterPoweredBy = true;
  }

  if (useBranding) {
    out.branding = {
      name: publicName || String(org.name || '').trim() || 'Tutlio',
      logo_url: typeof org.logo_url === 'string' && org.logo_url.trim() ? org.logo_url.trim() : null,
      brand_color: String(org.brand_color || '').trim() || '#6366f1',
      brand_color_secondary:
        typeof org.brand_color_secondary === 'string' && org.brand_color_secondary.trim()
          ? org.brand_color_secondary.trim()
          : undefined,
      hidePoweredBy,
      logoOnDark: moksloVaisiai,
    };
  }

  if (proKlase) {
    out.emailTeamSignature = 'Pro Klasės komanda';
    out.emailSenderName = 'ProKlasė Sistema';
  } else if (moksloVaisiai) {
    out.emailTeamSignature = customTeamSignature || 'Mokslo vaisių komanda';
    out.emailSenderName = customSenderName || 'Mokslo vaisiai sistema';
  } else {
    if (customTeamSignature) out.emailTeamSignature = customTeamSignature;
    if (customSenderName) out.emailSenderName = customSenderName;
  }

  return out;
}

export type EmailFooterExtras = {
  contactPhone?: string | null;
  contactEmail?: string | null;
  poweredByTutlio?: boolean;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Org contact last; drop Tutlio opt-out so it is not mixed into the org footer. */
export function injectOrgEmailFooter(html: string, extras: EmailFooterExtras): string {
  const phone = String(extras.contactPhone || '').trim();
  const email = String(extras.contactEmail || '').trim();
  const powered = extras.poweredByTutlio === true;
  const brandedFooter = !!(phone || email || powered);
  if (!brandedFooter) return html;

  return html.replace(/<div class="footer">([\s\S]*?)<\/div>/g, (_full, inner: string) => {
    let body = String(inner);
    body = body.replace(/<p\b[^>]*>[\s\S]*?info@tutlio\.lt[\s\S]*?<\/p>/gi, '');
    body = body.replace(/<p\b[^>]*>[\s\S]*?(?:iš Tutlio|from Tutlio)[\s\S]*?<\/p>/gi, '');
    body = body.replace(/<p\b[^>]*>\s*powered by Tutlio\s*<\/p>/gi, '');
    if (phone) {
      body = body.replace(new RegExp(`<p\\b[^>]*>\\s*${escapeRegExp(escapeHtml(phone))}\\s*</p>`, 'gi'), '');
    }
    if (email) {
      const safe = escapeRegExp(escapeHtml(email));
      body = body.replace(new RegExp(`<p\\b[^>]*>[\\s\\S]*?${safe}[\\s\\S]*?</p>`, 'gi'), '');
    }

    const tail: string[] = [];
    if (powered) {
      tail.push(`<p style="margin:10px 0 0;font-size:11px;color:#9ca3af;">powered by Tutlio</p>`);
    }
    if (phone) {
      tail.push(
        `<p style="margin:12px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(phone)}</p>`,
      );
    }
    if (email) {
      const safe = escapeHtml(email);
      tail.push(
        `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;"><a href="mailto:${safe}" style="color:#6b7280;text-decoration:none;">${safe}</a></p>`,
      );
    }
    return `<div class="footer">${body}${tail.join('')}</div>`;
  });
}

/** Patch generated HTML: logo header, gradient accents, team signature. */
export function applyOrgBrandingToHtml(
  html: string,
  opts: {
    branding?: EmailBranding | null;
    emailTeamSignature?: string | null;
    locale?: Locale | string;
    emailContactPhone?: string | null;
    emailContactEmail?: string | null;
    emailFooterPoweredBy?: boolean;
  },
): string {
  let out = html;
  const teamSig = String(opts.emailTeamSignature || '').trim();
  if (teamSig) {
    const locale = (opts.locale as Locale) || 'lt';
    out = out.replaceAll(t(locale, 'em.teamSignature'), teamSig);
  }

  const branding = opts.branding;
  const withFooter = (html: string) =>
    injectOrgEmailFooter(html, {
      contactPhone: opts.emailContactPhone,
      contactEmail: opts.emailContactEmail,
      poweredByTutlio: opts.emailFooterPoweredBy === true,
    });
  if (!branding) return withFooter(out);

  const logoImg = branding.logo_url
    ? `<img src="${branding.logo_url}" alt="${escapeHtml(branding.name)}" style="max-height:64px;max-width:200px;" />`
    : `<span style="font-size:26px;font-weight:900;color:${branding.brand_color};letter-spacing:-0.5px;">${escapeHtml(branding.name)}</span>`;
  const logoHtml =
    branding.logoOnDark && branding.logo_url
      ? `<div style="display:inline-block;background:#000000;border-radius:16px;padding:10px 14px;">${logoImg}</div>`
      : logoImg;
  const poweredBy = branding.hidePoweredBy
    ? ''
    : `<p style="color:#9ca3af;font-size:11px;margin:8px 0 0;">powered by Tutlio</p>`;
  const replacement = `${logoHtml}${poweredBy}`;
  for (const marker of DEFAULT_TUTLIO_HEADER_MARKERS) {
    out = out.replaceAll(marker, replacement);
  }

  const a = branding.brand_color;
  const b = branding.brand_color_secondary || branding.brand_color;
  const orgHeader = headerInlineStyle(a, b);
  const orgOutlookHeader = outlookHeaderInlineStyle(a, b);
  for (const [c1, c2] of HEADER_PAIRS) {
    out = out.replaceAll(headerInlineStyle(c1, c2), orgHeader);
    out = out.replaceAll(outlookHeaderInlineStyle(c1, c2), orgOutlookHeader);
    out = out.replaceAll(`linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`, `linear-gradient(135deg, ${a} 0%, ${b} 100%)`);
    out = out.replaceAll(`linear-gradient(135deg,${c1} 0%,${c2} 100%)`, `linear-gradient(135deg,${a} 0%,${b} 100%)`);
  }
  for (const c of ACCENT_COLORS) {
    out = out.replaceAll(`bgcolor="${c}"`, `bgcolor="${a}"`);
    out = out.replaceAll(`background-color:${c};`, `background-color:${a};`);
    out = out.replaceAll(`background:${c};`, `background:${a};`);
    out = out.replaceAll(`color:${c};`, `color:${a};`);
    out = out.replaceAll(`border-color:${c};`, `border-color:${a};`);
    // Gradients / leftover inline hex (e.g. reminder amber header).
    out = out.replaceAll(c, a);
  }
  // Reminder / payment “warm” surfaces → brand-tinted neutrals.
  out = out.replaceAll('#fffbeb', '#f4f1fb');
  out = out.replaceAll('#fef3c7', '#f4f1fb');
  out = out.replaceAll('#fff7ed', '#f4f1fb');
  out = out.replaceAll('#fde68a', a);
  out = out.replaceAll('#fed7aa', a);
  out = out.replaceAll('#fcd34d', a);
  return withFooter(out);
}
