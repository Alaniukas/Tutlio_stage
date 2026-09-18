import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';
import { localizedFromEmail } from './i18n.js';
import { isProKlaseOrg } from './marketMoney.js';
import { getResendApiKey, resendNotConfiguredMessage } from './resendConfig.js';

const PARENT_GUIDE_FILE = 'tevu-atmintine.png';
const PAYMENT_GUIDE_FILE = 'atsiskaitymo-tvarka.png';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assetCandidates(fileName: string): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, 'assets', 'proklase', fileName),
    join(process.cwd(), 'api', '_lib', 'assets', 'proklase', fileName),
    join(process.cwd(), '_lib', 'assets', 'proklase', fileName),
  ];
}

export function resolveProKlaseRegistrationAsset(fileName: string): string {
  const candidates = assetCandidates(fileName);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error(`ProKlasė registration asset not found: ${fileName}. Tried: ${candidates.join(' | ')}`);
}

export function buildProKlaseRegistrationWelcomeEmail(parentName?: string | null) {
  const safeName = escapeHtml(String(parentName || '').trim());
  const greeting = safeName ? `<p style="margin:0 0 18px;">Sveiki, ${safeName}!</p>` : '';

  return {
    subject: 'Sėkmingai užsiregistravote ProKlasės sistemoje! 🎉',
    html: `<!doctype html>
<html lang="lt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7ff;font-family:'Segoe UI',Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7ff;border-collapse:collapse;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-collapse:collapse;border-radius:18px;overflow:hidden;">
        <tr><td style="padding:30px 28px;text-align:center;background:#3047ee;background:linear-gradient(135deg,#3047ee 0%,#0066ff 100%);">
          <p style="margin:0 0 8px;color:#7fffd4;font-size:24px;font-weight:900;letter-spacing:-0.5px;">PRO KLASĖ</p>
          <h1 style="margin:0;color:#ffffff;font-size:25px;line-height:1.3;">Sėkmingai užsiregistravote ProKlasės sistemoje! 🎉</h1>
        </td></tr>
        <tr><td style="padding:30px 28px;font-size:16px;line-height:1.65;color:#374151;">
          ${greeting}
          <p style="margin:0 0 18px;">Savo paskyroje galėsite matyti suplanuotas pamokas, mokėjimus, naudotis žinučių funkcija bei kitomis sistemos galimybėmis.</p>
          <p style="margin:0 0 18px;">Jeigu naudojantis sistema kiltų klausimų ar susidurtumėte su problemomis, drąsiai kreipkitės!</p>
          <p style="margin:0 0 6px;"><strong>El. paštu:</strong> <a href="mailto:info@proklase.lt" style="color:#3047ee;">info@proklase.lt</a></p>
          <p style="margin:0 0 24px;"><strong>Tel. nr.:</strong> <a href="tel:+37065687287" style="color:#3047ee;">+370 656 87 287</a></p>
          <p style="margin:0 0 24px;">Apačioje taip pat rasite Tėvų atmintinę, kurioje pateikėme svarbiausią informaciją apie pamokas, jų organizavimą, apmokėjimą bei atsakymus į dažniausiai užduodamus klausimus.</p>

          <h2 style="margin:30px 0 12px;color:#111827;font-size:20px;">Tėvų atmintinė</h2>
          <img src="cid:proklase-tevu-atmintine" alt="ProKlasė Tėvų atmintinė" width="584" style="display:block;width:100%;max-width:584px;height:auto;border:0;border-radius:12px;" />

          <h2 style="margin:30px 0 12px;color:#111827;font-size:20px;">Atsiskaitymo tvarka</h2>
          <img src="cid:proklase-atsiskaitymo-tvarka" alt="ProKlasė atsiskaitymo tvarka" width="584" style="display:block;width:100%;max-width:584px;height:auto;border:0;border-radius:12px;" />
        </td></tr>
        <tr><td style="padding:22px 28px;text-align:center;background:#f8fafc;border-top:1px solid #e5e7eb;color:#64748b;font-size:13px;">
          Pro Klasės komanda
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    attachments: [
      {
        filename: 'ProKlase - Tevu atmintine.png',
        content: readFileSync(resolveProKlaseRegistrationAsset(PARENT_GUIDE_FILE)),
        contentType: 'image/png',
        contentId: 'proklase-tevu-atmintine',
      },
      {
        filename: 'ProKlase - Atsiskaitymo tvarka.png',
        content: readFileSync(resolveProKlaseRegistrationAsset(PAYMENT_GUIDE_FILE)),
        contentType: 'image/png',
        contentId: 'proklase-atsiskaitymo-tvarka',
      },
    ],
  };
}

export async function sendProKlaseRegistrationWelcomeEmail(input: {
  organizationId?: string | null;
  to: string;
  parentName?: string | null;
}): Promise<{ ok: true; skipped?: true } | { ok: false; error: string }> {
  if (!isProKlaseOrg(input.organizationId)) return { ok: true, skipped: true };

  const apiKey = getResendApiKey();
  if (!apiKey) return { ok: false, error: resendNotConfiguredMessage() };

  try {
    const email = buildProKlaseRegistrationWelcomeEmail(input.parentName);
    const { error } = await new Resend(apiKey).emails.send({
      from: localizedFromEmail('lt', { senderName: 'ProKlasė Sistema' }),
      to: [input.to.trim().toLowerCase()],
      subject: email.subject,
      html: email.html,
      attachments: email.attachments,
    });

    if (error) {
      console.error('[sendProKlaseRegistrationWelcomeEmail]', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sendProKlaseRegistrationWelcomeEmail]', message);
    return { ok: false, error: message };
  }
}
