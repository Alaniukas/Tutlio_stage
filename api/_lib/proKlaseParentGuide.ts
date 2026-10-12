import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProKlaseOrg } from './marketMoney.js';

export function resolveProKlaseRegistrationAsset(fileName: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'assets', 'proklase', fileName),
    join(process.cwd(), 'api', '_lib', 'assets', 'proklase', fileName),
    join(process.cwd(), '_lib', 'assets', 'proklase', fileName),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error(`ProKlasė registration asset not found: ${fileName}`);
}

/** The approved guides belong only to Pro Klasė, including its QA organization. */
export function buildProKlaseParentGuide(organizationId?: string | null) {
  if (!isProKlaseOrg(organizationId)) return null;
  return {
    html: `<div style="padding:24px 0;font-size:14px;line-height:1.6;color:#374151;">
      <p style="margin:0 0 18px;">Pridedame Tėvų atmintinę ir atsiskaitymo tvarką, kuriose rasite svarbiausią informaciją apie pamokas, jų organizavimą ir apmokėjimą.</p>
      <h2 style="margin:24px 0 12px;color:#111827;font-size:20px;">Tėvų atmintinė</h2>
      <img src="cid:proklase-tevu-atmintine" alt="ProKlasė Tėvų atmintinė" width="584" style="display:block;width:100%;max-width:584px;height:auto;border:0;border-radius:12px;" />
      <h2 style="margin:30px 0 12px;color:#111827;font-size:20px;">Atsiskaitymo tvarka</h2>
      <img src="cid:proklase-atsiskaitymo-tvarka" alt="ProKlasė atsiskaitymo tvarka" width="584" style="display:block;width:100%;max-width:584px;height:auto;border:0;border-radius:12px;" />
    </div>`,
    attachments: [
      {
        filename: 'ProKlase - Tevu atmintine.png',
        content: readFileSync(resolveProKlaseRegistrationAsset('tevu-atmintine.png')).toString('base64'),
        contentType: 'image/png',
        contentId: 'proklase-tevu-atmintine',
      },
      {
        filename: 'ProKlase - Atsiskaitymo tvarka.png',
        content: readFileSync(resolveProKlaseRegistrationAsset('atsiskaitymo-tvarka.png')).toString('base64'),
        contentType: 'image/png',
        contentId: 'proklase-atsiskaitymo-tvarka',
      },
    ],
  };
}

export function appendProKlaseParentGuide(html: string, guideHtml: string): string {
  // All invitation templates have this footer, including after white-label rendering.
  return html.replace(/(<div\b[^>]*class="footer"[^>]*>)/i,
    `<div style="padding:0 24px;">${guideHtml}</div>$1`);
}
