/**
 * Send MV account activation email preview (with payment-fees note) to QA inbox.
 * Usage: npx tsx scripts/send-mv-activation-preview.ts
 */
import { readFileSync, existsSync } from 'fs';
import { sendMvAccountActivationEmail } from '../api/_lib/sendMvFamilyAccountsEmail.js';
import { buildMvAccountActivationToken, buildMvAccountActivationUrl } from '../api/_lib/mvAccountActivationToken.js';
import { MOKSLO_VAISIAI_ORG_ID } from '../api/_lib/marketMoney.js';

function loadEnvFile(file: string) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        let v = l.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return [l.slice(0, i), v];
      }),
  );
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...loadEnvFile('.env.vercel.stage') };
for (const [k, v] of Object.entries(env)) {
  if (v && process.env[k] == null) process.env[k] = v;
}

const TO = 'alaniukasa@gmail.com';
const appOrigin = (process.env.VITE_APP_URL || process.env.APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
const studentId = '00000000-0000-4000-8000-000000000099';
const activationUrl = buildMvAccountActivationUrl(
  appOrigin,
  buildMvAccountActivationToken({ studentId, role: 'parent', email: TO }),
);

async function buildPreviewPayload() {
  return {
    role: 'parent' as const,
    recipientName: 'Peržiūra',
    studentName: 'Demo Mokinė Gabija',
    accountEmail: TO,
    tempPassword: 'TutlioQaDemo2026!',
    activationUrl,
    organizationId: MOKSLO_VAISIAI_ORG_ID,
    orgName: 'Mokslo vaisiai',
    locale: 'lt',
    previewForceFeeNotice: true,
  };
}

async function main() {
  const data = await buildPreviewPayload();
  if (process.argv.includes('--dry-run')) {
    const { sendMvAccountActivationEmail: _send, ...mod } = await import('../api/_lib/sendMvFamilyAccountsEmail.js');
    void _send;
    const { t } = await import('../api/_lib/i18n.js');
    const { resolveEmailOrgBranding, applyOrgBrandingToHtml } = await import('../api/_lib/emailOrgBranding.js');
    const { headerInlineStyle, outlookEmailButton } = await import('../api/_lib/outlookEmail.js');
    const { MOKSLO_VAISIAI_BRAND_COLOR, MOKSLO_VAISIAI_BRAND_COLOR_SECONDARY } = await import('../api/_lib/marketMoney.js');
    const { appendMvPayerFeeNoticeBeforeFooter, mvPayerFeeNoticeFooterHtml } = await import('../api/_lib/mvPayerFeeNotice.js');
    const locale = 'lt' as const;
    const resolved = resolveEmailOrgBranding(data.organizationId, { name: data.orgName });
    const orgLabel = resolved.publicName || data.orgName || '';
    const headerColor = resolved.branding?.brand_color || MOKSLO_VAISIAI_BRAND_COLOR;
    const headerSecondary = resolved.branding?.brand_color_secondary || MOKSLO_VAISIAI_BRAND_COLOR_SECONDARY;
    const subject = t(locale, 'em.mvActivationParentSub', { student: data.studentName });
    let html = `<!DOCTYPE html><html lang="lt"><body>
      <div class="header" style="${headerInlineStyle(headerColor, headerSecondary)}">
        <h1 style="color:#ffffff;">${t(locale, 'em.mvActivationHeader')}</h1>
      </div>
      <div class="body">
        <p>${t(locale, 'em.hiNameNoEmoji', { name: data.recipientName })}</p>
        <p>${t(locale, 'em.mvActivationParentBody', { org: orgLabel, student: data.studentName })}</p>
        <p><strong>${t(locale, 'em.mvFamilyAccountsParentBlock')}</strong></p>
        <p>${data.accountEmail} / ${data.tempPassword}</p>
        <div>${outlookEmailButton(data.activationUrl, t(locale, 'em.mvActivationBtn'), headerColor)}</div>
        <p>${t(locale, 'em.mvActivationAfterBtn')}</p>
        <p>${t(locale, 'em.mvFamilyAccountsChangePassword')}</p>
      </div>
      <div class="footer"><p>${t(locale, 'em.teamSignature')}</p></div>
    </body></html>`;
    html = appendMvPayerFeeNoticeBeforeFooter(html, mvPayerFeeNoticeFooterHtml(locale));
    html = applyOrgBrandingToHtml(html, {
      branding: resolved.branding,
      emailTeamSignature: resolved.emailTeamSignature,
      locale,
      emailContactPhone: resolved.emailContactPhone,
      emailContactEmail: resolved.emailContactEmail,
      emailFooterPoweredBy: resolved.emailFooterPoweredBy === true,
    });
    const payload = { subject, html, text: t(locale, 'em.mvPayerPaymentInfoLead') };
    const { writeFileSync } = await import('fs');
    writeFileSync('_tmp_mv_preview.json', JSON.stringify(payload), 'utf8');
    console.log('Wrote _tmp_mv_preview.json');
    return;
  }

  const result = await sendMvAccountActivationEmail(TO, data);

  if (!result.ok) {
    console.error('Failed:', result.error);
    process.exit(1);
  }
  console.log(`MV activation preview sent to ${TO}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
