import { AUTH_EMAIL_COPY } from '../../src/lib/i18n/authEmailCopy.js';
import { htmlLanguageCode, localeDirection, SUPPORTED_LOCALES } from '../../src/lib/i18n/locales.js';
import type { AuthEmailLocale } from '../../src/lib/auth-locale.js';

export type AuthEmailKind = 'confirmation' | 'recovery';
export const AUTH_EMAIL_LOCALES: readonly AuthEmailLocale[] = SUPPORTED_LOCALES;
// Limits enforced by the hosted Supabase dashboard, including Go source.
export const AUTH_EMAIL_TEMPLATE_LIMITS = { subject: 255, body: 50_000 } as const;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Internal layout inputs are escaped static copy or trusted Go-template source. */
function renderFrame({ title, body, ignore, lang, dir, align, url }: {
  title: string; body: string; ignore: string; lang: string;
  dir: string; align: string; url: string;
}): string {
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" dir="${dir}" style="width:100%;max-width:560px;background:#fff;border-radius:16px;">
<tr><td style="padding:28px 24px;background:#4f46e5;color:#fff;text-align:center;border-radius:16px 16px 0 0;"><h1 style="font-size:22px;margin:0;">${title}</h1></td></tr>
<tr><td style="padding:28px 24px;text-align:${align};">
<p style="color:#374151;font-size:16px;line-height:1.6;">${body}</p>
<p style="text-align:center;margin:28px 0;"><a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:bold;padding:14px 24px;border-radius:10px;text-decoration:none;">${title}</a></p>
<p style="color:#6b7280;font-size:13px;line-height:1.6;">${ignore}</p>
</td></tr><tr><td style="padding:16px;text-align:center;color:#6b7280;font-size:13px;">Tutlio</td></tr>
</table></td></tr></table>
</body></html>`;
}

export function renderAuthEmail(locale: AuthEmailLocale, kind: AuthEmailKind, confirmationUrl: string): string {
  const copy = AUTH_EMAIL_COPY[locale];
  const dir = localeDirection(locale);
  return renderFrame({
    title: escapeHtml(kind === 'confirmation' ? copy.confirmTitle : copy.resetTitle),
    body: escapeHtml(kind === 'confirmation' ? copy.confirmBody : copy.resetBody),
    ignore: escapeHtml(copy.ignore), lang: htmlLanguageCode(locale), dir,
    align: dir === 'rtl' ? 'right' : 'left', url: escapeHtml(confirmationUrl),
  });
}

/** Go templates: retain Lithuanian for legacy accounts without locale metadata;
 * unknown values safely fall back to English.
 * Only Supabase's ConfirmationURL is interpolated; no user HTML is included. */
function branches(render: (locale: AuthEmailLocale) => string): string {
  const cases = AUTH_EMAIL_LOCALES.filter((l) => l !== 'en');
  return cases.map((locale, i) => `{{ ${i ? 'else if' : 'if'} eq $locale "${locale}" }}${render(locale)}`).join('')
    + `{{ else }}${render('en')}{{ end }}`;
}

export function generateAuthEmailTemplates(): Record<string, string> {
  const templates = Object.fromEntries((['confirmation', 'recovery'] as const).flatMap((kind) => {
    const name = kind === 'confirmation' ? 'confirm-signup' : 'reset-password';
    const title = (locale: AuthEmailLocale) => kind === 'confirmation'
      ? AUTH_EMAIL_COPY[locale].confirmTitle : AUTH_EMAIL_COPY[locale].resetTitle;
    // Sharing the HTML frame avoids the dashboard's 50,000-character limit.
    const body = '{{ $locale := "lt" }}{{ with .Data.locale }}{{ $locale = printf "%v" . }}{{ end }}'
      + renderFrame({
        title: branches((locale) => escapeHtml(title(locale))),
        body: branches((locale) => escapeHtml(kind === 'confirmation'
          ? AUTH_EMAIL_COPY[locale].confirmBody : AUTH_EMAIL_COPY[locale].resetBody)),
        ignore: branches((locale) => escapeHtml(AUTH_EMAIL_COPY[locale].ignore)),
        lang: branches(htmlLanguageCode),
        dir: '{{ if or (eq $locale "ar") (eq $locale "he") }}rtl{{ else }}ltr{{ end }}',
        align: '{{ if or (eq $locale "ar") (eq $locale "he") }}right{{ else }}left{{ end }}',
        url: '{{ .ConfirmationURL }}',
      }) + '\n';
    // 36 native titles cannot fit the 255-character subject-source limit.
    // Keep the legacy LT/PL subjects; other locales use English. Never insert
    // an arbitrary subject supplied through user-editable metadata.
    const subject = `{{ if or (not .Data.locale) (eq .Data.locale "lt") }}Tutlio — ${title('lt')}`
      + `{{ else if eq .Data.locale "pl" }}Tutlio — ${title('pl')}{{ else }}Tutlio — ${title('en')}{{ end }}\n`;
    return [
      [`${name}.multilocale.html`, body],
      [`${name}.multilocale.subject.txt`, subject],
    ];
  }));
  for (const [name, content] of Object.entries(templates)) {
    const limit = name.endsWith('.html') ? AUTH_EMAIL_TEMPLATE_LIMITS.body : AUTH_EMAIL_TEMPLATE_LIMITS.subject;
    // Also stay below the same byte budget for downstream UTF-8 consumers.
    if (new TextEncoder().encode(content).length > limit) {
      throw new Error(`${name} exceeds the hosted Supabase template limit (${limit}).`);
    }
  }
  return templates;
}
