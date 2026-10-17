import { outlookEmailButton, headerInlineStyle } from './outlookEmail.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!
  ));
}

function formatChildNames(names: string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length === 0) return 'jūsų vaiku';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} ir ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} ir ${unique[unique.length - 1]}`;
}

export function schoolFamilyTransitionInviteSubject(studentNames: string[]): string {
  const children = formatChildNames(studentNames);
  return `Šeimos paskyra – ${children}`;
}

export type SchoolFamilyUnsignedInviteRow = {
  studentName: string;
  payerName: string | null;
  payerEmail: string | null;
  reason: string;
};

function unsignedReasonLabel(reason: string): string {
  if (reason === 'annual_contract_required') return 'Nėra pasirašytos metinės sutarties';
  if (reason === 'guardian_verification_required') return 'Metinėje sutartyje trūksta tėvų parašo arba asmens kodo';
  return reason;
}

export function schoolFamilyUnsignedAnnualAdminSubject(): string {
  return 'Negalime išsiųsti šeimos kvietimų – nėra metinės sutarties';
}

export function schoolFamilyUnsignedAnnualAdminText(params: {
  orgName: string;
  rows: SchoolFamilyUnsignedInviteRow[];
}): string {
  const org = params.orgName.trim() || 'Mokykla';
  const lines = params.rows.map((row) => {
    const payer = [row.payerName, row.payerEmail].filter(Boolean).join(', ') || 'kontaktas nenurodytas';
    return `- ${row.studentName} (${payer}) – ${unsignedReasonLabel(row.reason)}`;
  });
  return [
    `Sveiki,`,
    ``,
    `Šiems ${org} mokiniams šeimos paskyros kvietimo neišsiuntėme, nes sistema neturi pasirašytos metinės sutarties (arba joje trūksta tėvų parašo). Papildomų užsiėmimų sutartis čia netinka.`,
    ``,
    ...lines,
    ``,
    `Kai metinė sutartis bus pasirašyta, kvietimą galima išsiųsti iš Šeimos paskyros lango.`,
    ``,
    `Tutlio`,
  ].join('\n');
}

export function schoolFamilyUnsignedAnnualAdminHtml(params: {
  orgName: string;
  rows: SchoolFamilyUnsignedInviteRow[];
  color?: string;
}): string {
  const org = escapeHtml(params.orgName.trim() || 'Mokykla');
  const color = params.color || '#6366f1';
  const rows = params.rows.map((row) => {
    const payer = escapeHtml([row.payerName, row.payerEmail].filter(Boolean).join(' · ') || 'kontaktas nenurodytas');
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.studentName)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${payer}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(unsignedReasonLabel(row.reason))}</td>
    </tr>`;
  }).join('');
  return `<!doctype html><html lang="lt"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<div style="max-width:640px;margin:24px auto;background:#ffffff;padding:28px;color:#374151;font-size:15px;line-height:1.55;">
  <p>Sveiki,</p>
  <p>Šiems <strong>${org}</strong> mokiniams šeimos paskyros kvietimo <strong>neišsiuntėme</strong>, nes sistema neturi pasirašytos metinės sutarties (arba joje trūksta tėvų parašo). Papildomų užsiėmimų sutartis čia netinka.</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:${escapeHtml(color)};color:#ffffff;">
      <th align="left" style="padding:8px 10px;">Vaikas</th>
      <th align="left" style="padding:8px 10px;">Mokėtojas</th>
      <th align="left" style="padding:8px 10px;">Priežastis</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:18px;">Kai metinė sutartis bus pasirašyta, kvietimą galima išsiųsti iš Šeimos paskyros lango.</p>
</div></body></html>`;
}

export function schoolFamilyTransitionInviteText(params: {
  orgName: string;
  studentNames: string[];
  login: string;
  invitationUrl: string;
  isReady: boolean;
  contactEmail?: string;
}): string {
  const org = params.orgName.trim() || 'Mokykla';
  const children = formatChildNames(params.studentNames);
  const action = params.isReady ? 'Prisijungti' : 'Aktyvuoti paskyrą';
  const contact = params.contactEmail || 'info@laisvivaikai.lt';
  return [
    `Sveiki,`,
    ``,
    `Iki šiol priminimus apie užsiėmimus ir prisijungimo nuorodas siuntėme tiesiai į šį el. paštą, be atskiros paskyros.`,
    ``,
    `Nuo 2026 m. lapkričio 1 d. to daryti nebegalėsime. Priminimai, namų darbai ir prisijungimas prie užsiėmimo veiks tik tada, kai būsite prisijungę prie tėvų paskyros.`,
    ``,
    `Kad spėtumėte ramiai pasiruošti, ${org} jau sukūrė jums tėvų paskyrą, susietą su ${children}. Iki spalio 31 d. laiškus dar gausite kaip įprastai.`,
    ``,
    `Prisijungimo el. paštas: ${params.login}`,
    `${action}: ${params.invitationUrl}`,
    ``,
    `Jei mokykloje mokosi keli jūsų vaikai, visus juos matysite vienoje paskyroje.`,
    ``,
    `Jei kils klausimų, atsakykite į šį laišką arba rašykite ${contact}.`,
    ``,
    `Iki pasimatymo užsiėmimuose,`,
    org,
  ].join('\n');
}

export function schoolFamilyTransitionInviteHtml(params: {
  orgName: string;
  studentNames: string[];
  login: string;
  invitationUrl: string;
  isReady: boolean;
  color?: string;
  colorSecondary?: string;
  logoUrl?: string | null;
  signature?: string;
  contactEmail?: string;
  previewNote?: string | null;
}): string {
  const org = escapeHtml(params.orgName.trim() || 'Mokykla');
  const children = escapeHtml(formatChildNames(params.studentNames));
  const login = escapeHtml(params.login);
  const contact = escapeHtml(params.contactEmail || 'info@laisvivaikai.lt');
  const color = params.color || '#6366f1';
  const secondary = params.colorSecondary || '#4f46e5';
  const signature = escapeHtml(params.signature || params.orgName);
  const buttonLabel = params.isReady ? 'Eiti prisijungti' : 'Aktyvuoti paskyrą';
  const header = params.logoUrl
    ? `<img src="${escapeHtml(params.logoUrl)}" alt="${org}" style="display:block;max-height:56px;max-width:220px;margin:0 auto;" />`
    : `<h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">${org}</h1>`;
  const preview = params.previewNote
    ? `<p style="margin:0 0 18px;padding:10px 12px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;color:#9a3412;font-size:13px;line-height:1.5;">${escapeHtml(params.previewNote)}</p>`
    : '';

  return `<!doctype html><html lang="lt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-collapse:collapse;">
<tr><td style="${headerInlineStyle(color, secondary)};padding:28px 24px;text-align:center;">${header}</td></tr>
<tr><td style="padding:28px 24px 8px;color:#374151;font-size:15px;line-height:1.65;">
  ${preview}
  <p style="margin:0 0 14px;">Sveiki,</p>
  <p style="margin:0 0 14px;">Iki šiol priminimus apie užsiėmimus ir prisijungimo nuorodas siuntėme tiesiai į šį el. paštą, be atskiros paskyros.</p>
  <p style="margin:0 0 16px;">Nuo <strong>2026 m. lapkričio 1 d.</strong> to daryti nebegalėsime. Priminimai, namų darbai ir prisijungimas prie užsiėmimo veiks tik tada, kai būsite prisijungę prie tėvų paskyros.</p>
  <div style="margin:0 0 16px;padding:14px 16px;background:#eef2ff;border-radius:12px;color:#312e81;font-size:14px;line-height:1.55;">
    Kad spėtumėte ramiai pasiruošti, <strong>${org}</strong> jau sukūrė jums tėvų paskyrą, susietą su <strong>${children}</strong>. Iki <strong>spalio 31 d.</strong> laiškus dar gausite kaip įprastai.
  </div>
  <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;">Prisijungimo el. paštas</p>
  <p style="margin:0 0 22px;font-size:16px;font-weight:700;color:#111827;">${login}</p>
  ${outlookEmailButton(params.invitationUrl, buttonLabel, color)}
  <p style="margin:22px 0 14px;">Jei mokykloje mokosi keli jūsų vaikai, visus juos matysite vienoje paskyroje.</p>
  <p style="margin:0 0 18px;">Jei kils klausimų, atsakykite į šį laišką arba rašykite <a href="mailto:${contact}" style="color:${escapeHtml(color)};">${contact}</a>.</p>
  <p style="margin:0 0 4px;">Iki pasimatymo užsiėmimuose,</p>
  <p style="margin:0;font-weight:600;">${signature}</p>
</td></tr>
<tr><td style="padding:16px 24px 24px;color:#9ca3af;font-size:12px;">Šis laiškas siunčiamas, nes jūsų vaikas mokosi šioje mokykloje.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
