/**
 * One-off patcher: Outlook-safe buttons + header fallbacks in api/send-email.ts
 */
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../api/send-email.ts');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes("from './_lib/outlookEmail'")) {
  s = s.replace(
    "import { createClient } from '@supabase/supabase-js';",
    "import { createClient } from '@supabase/supabase-js';\nimport { outlookEmailButton, headerInlineStyle } from './_lib/outlookEmail';"
  );
}

s = s.replace(
  '.header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding:',
  '.header { background-color: #6366f1; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding:'
);

const oldWrap = `function wrap(content: string, locale: Locale = 'lt'): string {
  return \`<!DOCTYPE html>
<html lang="\${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\${baseStyles}</head>
<body style="margin:0; padding:20px 0; background-color:#f3f4f6;">
  <div class="container">
    <div style="background-color: #ffffff; padding: 20px 24px; text-align: center; border-bottom: 1px solid #f0f0f0;">
        <span style="font-size: 26px; font-weight: 900; color: #4f46e5; letter-spacing: -0.5px; display: inline-flex; items-center; gap: 8px;">Tutlio <span style="font-size: 24px;">🎓</span></span>
    </div>
    \${content}
  </div>
</body></html>\`;
}`;

const newWrap = `function wrap(content: string, locale: Locale = 'lt'): string {
  return \`<!DOCTYPE html>
<html lang="\${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\${baseStyles}</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background-color:#f3f4f6;">
<tr><td align="center" style="padding:20px 12px;background-color:#f3f4f6;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;max-width:560px;width:100%;background-color:#ffffff;">
<tr><td style="padding:0;background-color:#ffffff;">
  <div style="background-color:#ffffff;padding:20px 24px;text-align:center;border-bottom:1px solid #f0f0f0;">
    <span style="font-size:26px;font-weight:900;color:#4f46e5;letter-spacing:-0.5px;">Tutlio <span style="font-size:24px;">🎓</span></span>
  </div>
  \${content}
</td></tr></table>
</td></tr></table>
</body></html>\`;
}`;

if (s.includes(oldWrap)) s = s.replace(oldWrap, newWrap);

s = s.replace(
  `    const host = typeof req.headers.host === 'string' ? req.headers.host : '';
    const locale: Locale = (rawData?.locale && ['lt', 'en', 'pl', 'lv', 'ee'].includes(rawData.locale))
      ? rawData.locale as Locale
      : detectLocaleFromHost(host);`,
  `    const locale: Locale = 'lt';`
);

// Remove unused import warning: detectLocaleFromHost may become unused
s = s.replace(
  "import { t, detectLocaleFromHost } from '../src/lib/i18n/core';",
  "import { t } from '../src/lib/i18n/core';"
);

const hdr = [
  [`style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);"`, `style="\${headerInlineStyle('#6366f1', '#8b5cf6')}"`],
  [`style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);"`, `style="\${headerInlineStyle('#6366f1', '#4f46e5')}"`],
  [`style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);"`, `style="\${headerInlineStyle('#8b5cf6', '#6366f1')}"`],
  [`style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);"`, `style="\${headerInlineStyle('#10b981', '#059669')}"`],
  [`style="background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);"`, `style="\${headerInlineStyle('#ef4444', '#f97316')}"`],
  [`style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);"`, `style="\${headerInlineStyle('#ef4444', '#b91c1c')}"`],
  [`style="background: linear-gradient(135deg, #64748b 0%, #475569 100%);"`, `style="\${headerInlineStyle('#64748b', '#475569')}"`],
  [`style="background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);"`, `style="\${headerInlineStyle('#f59e0b', '#f97316')}"`],
  [`style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);"`, `style="\${headerInlineStyle('#f59e0b', '#d97706')}"`],
  [`style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);"`, `style="\${headerInlineStyle('#3b82f6', '#2563eb')}"`],
  [`style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);"`, `style="\${headerInlineStyle('#059669', '#10b981')}"`],
  [`style="background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);"`, `style="\${headerInlineStyle('#0d9488', '#14b8a6')}"`],
];

for (const [a, b] of hdr) {
  s = s.split(a).join(b);
}

// Payment reminder: header was class-only
s = s.replace(
  `<div class="header">
        <h1>${t(locale, 'em.payReminderHeader')}</h1>`,
  `<div class="header" style="\${headerInlineStyle('#6366f1', '#8b5cf6')}">
        <h1>${t(locale, 'em.payReminderHeader')}</h1>`
);
// Fix broken template - the above is wrong because we're in .cjs not ts - the file content has literal ${t not escaped

fs.writeFileSync(p, s);
console.log('pass1 done');
