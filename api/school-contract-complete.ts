import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderDocxTemplateUrlToPdfBuffer } from './_lib/renderSchoolContractDocxToPdf';
import { schoolContractPdfStoragePath } from './_lib/schoolContractPdfPath';

function pageHtml(content: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sutarties duomenų papildymas</title></head><body style="margin:0;font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#f5f3ff 0%,#ecfeff 50%,#f0fdf4 100%);padding:24px;"><div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:24px;box-shadow:0 10px 35px rgba(2,6,23,.08);">${content}</div></body></html>`;
}

function headerFirst(req: VercelRequest, name: string): string {
  const v = req.headers?.[name];
  if (typeof v === 'string') return v.split(',')[0].trim();
  if (Array.isArray(v) && v[0]) return String(v[0]).split(',')[0].trim();
  return '';
}

/** Browser origin for the React form. Use APP_URL server-side env, or infer from request (never VITE_* — often production). */
function publicAppOriginForRedirect(req: VercelRequest): string {
  const explicit = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;

  const fwdHost = headerFirst(req, 'x-forwarded-host');
  let hostRaw = (fwdHost || headerFirst(req, 'host')).trim();

  // scripts/dev-api-local.ts sets this; works even when VERCEL=1 exists in .env from Vercel pull.
  if (!hostRaw && process.env.TUTLIO_DEV_API_LOCAL === '1') {
    hostRaw = 'localhost:3000';
  }

  if (!hostRaw) return '';

  // Local API :3002; browser is on Vite — prefer front port when we detect API host.
  if (/^localhost:3002$/i.test(hostRaw) || /^127\.0\.0\.1:3002$/i.test(hostRaw)) {
    hostRaw = hostRaw.replace(/:3002$/i, ':3000');
  }

  let proto = headerFirst(req, 'x-forwarded-proto').toLowerCase();
  if (proto !== 'http' && proto !== 'https') {
    proto =
      hostRaw.includes('localhost') || hostRaw.startsWith('127.') ? 'http' : 'https';
  }
  return `${proto}://${hostRaw}`.replace(/\/$/, '');
}

const BUCKET = 'school-contracts';
const PUBLIC_MARKER = `/object/public/${BUCKET}/`;

function extractStoragePath(urlOrPath: string): string {
  const idx = urlOrPath.indexOf(PUBLIC_MARKER);
  if (idx !== -1) return decodeURIComponent(urlOrPath.slice(idx + PUBLIC_MARKER.length));
  return urlOrPath;
}

function fillPlaceholders(template: string, data: Record<string, string>) {
  let result = template || '';
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || '');
  }
  result = result
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return result;
}

function templateSafe(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';
  const lower = str.toLowerCase();
  if (lower === 'undefined' || lower === 'null') return '';
  return str;
}

async function createSimpleContractPdf(params: {
  contractNumber: string;
  studentName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentPersonalCode: string;
  childBirthDate: string;
  address: string;
  annualFee: number | string;
  body: string;
}) {
  const safePdfText = (value: string) =>
    String(value || '')
      .replace(/ą/g, 'a').replace(/Ą/g, 'A')
      .replace(/č/g, 'c').replace(/Č/g, 'C')
      .replace(/ę/g, 'e').replace(/Ę/g, 'E')
      .replace(/ė/g, 'e').replace(/Ė/g, 'E')
      .replace(/į/g, 'i').replace(/Į/g, 'I')
      .replace(/š/g, 's').replace(/Š/g, 'S')
      .replace(/ų/g, 'u').replace(/Ų/g, 'U')
      .replace(/ū/g, 'u').replace(/Ū/g, 'U')
      .replace(/ž/g, 'z').replace(/Ž/g, 'Z');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const left = 44;
  let y = 804;

  page.drawText(safePdfText('Metinio mokesčio sutartis'), { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;
  const rows = [
    `Sutarties Nr.: ${params.contractNumber || ''}`,
    `Mokinys: ${params.studentName || ''}`,
    `Tevai: ${params.parentName || ''}`,
    `Tevu el. pastas: ${params.parentEmail || ''}`,
    `Tevu tel.: ${params.parentPhone || ''}`,
    `Tevu asm. kodas: ${params.parentPersonalCode || ''}`,
    `Vaiko gimimo data: ${params.childBirthDate || ''}`,
    `Adresas: ${params.address || ''}`,
    `Metinis mokestis: EUR ${Number(params.annualFee || 0).toFixed(2)}`,
    `Data: ${new Date().toLocaleDateString('lt-LT')}`,
  ];
  for (const row of rows) {
    page.drawText(safePdfText(row), { x: left, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
  }
  y -= 8;
  page.drawText(safePdfText('Sutarties tekstas:'), { x: left, y, size: 12, font: bold, color: rgb(0.12, 0.12, 0.12) });
  y -= 18;
  for (const line of String(params.body || '').split(/\r?\n/)) {
    if (y < 56) break;
    page.drawText(safePdfText(line), { x: left, y, size: 11, font, color: rgb(0.23, 0.23, 0.23) });
    y -= 15;
  }
  return pdfDoc.save();
}

async function createDocxTemplatePdf(params: {
  fetchUrl: string;
  payload: Record<string, string>;
}): Promise<Uint8Array> {
  const pdfBuffer = await renderDocxTemplateUrlToPdfBuffer({ templateUrl: params.fetchUrl, payload: params.payload });
  return new Uint8Array(pdfBuffer);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).send('Server misconfigured');
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const token =
    (typeof req.query?.token === 'string' ? req.query.token : '') ||
    (typeof req.body?.token === 'string' ? req.body.token : '');
  const contractIdDirect =
    (typeof req.query?.contractId === 'string' ? req.query.contractId : '') ||
    (typeof req.body?.contractId === 'string' ? req.body.contractId : '');

  let tokenRow: { id: string; contract_id: string; used_at: string | null; expires_at: string } | null = null;
  let resolvedContractId = '';
  if (token) {
    const { data, error: tokenErr } = await supabase
      .from('school_contract_completion_tokens')
      .select('id, contract_id, used_at, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (tokenErr || !data) return res.status(404).send(pageHtml('<h2>Nuoroda nerasta.</h2>'));
    if (data.used_at) return res.status(410).send(pageHtml('<h2>Nuoroda jau panaudota.</h2>'));
    if (new Date(data.expires_at).getTime() < Date.now()) return res.status(410).send(pageHtml('<h2>Nuoroda nebegalioja.</h2>'));
    tokenRow = data as any;
    resolvedContractId = data.contract_id;
  } else if (contractIdDirect) {
    resolvedContractId = contractIdDirect;
  } else {
    return res.status(400).send(pageHtml('<h2>Nenurodytas token.</h2>'));
  }

  const { data: contract, error: contractErr } = await supabase
    .from('school_contracts')
    .select('id, student_id, organization_id, template_id, contract_number, annual_fee, filled_body, media_publicity_consent, template:school_contract_templates(pdf_url), organizations(name, email, entity_type), student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent)')
    .eq('id', resolvedContractId)
    .maybeSingle();
  if (contractErr || !contract) return res.status(404).send(pageHtml('<h2>Sutartis nerasta.</h2>'));

  const st = (contract as any).student || {};
  const orgEntityType = String((contract as any)?.organizations?.entity_type || '').trim().toLowerCase();
  const isSchoolOrg = orgEntityType === 'school';
  const existingConsent = String((contract as any)?.media_publicity_consent || '').trim();
  const isAddressMissing = !String(st.student_address || '').trim() && !String(st.student_city || '').trim();
  const isBirthDateMissing = !String(st.child_birth_date || '').trim();
  const isParentCodeMissing = !String(st.payer_personal_code || '').trim();
  const isMediaConsentMissing = isSchoolOrg && !existingConsent;

  if (req.method === 'GET') {
    const wantsJson = String(req.query?.format ?? '') === 'json';
    if (wantsJson) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          ok: true,
          token: token || null,
          contractId: resolvedContractId,
          missing: {
            address: isAddressMissing,
            birthDate: isBirthDateMissing,
            parentCode: isParentCodeMissing,
            mediaPublicity: isMediaConsentMissing,
          },
        }),
      );
    }

    const appBase = publicAppOriginForRedirect(req);
    if (appBase) {
      const cid = contractIdDirect || resolvedContractId;
      const dest = token
        ? `${appBase}/school-contract-complete?token=${encodeURIComponent(token)}`
        : `${appBase}/school-contract-complete?contractId=${encodeURIComponent(cid)}`;
      res.statusCode = 302;
      res.setHeader('Location', dest);
      return res.end();
    }
    const fieldSummary = [
      isAddressMissing ? '<li>Gyvenamoji vieta</li>' : '',
      isParentCodeMissing ? '<li>Tėvų asmens kodas</li>' : '',
      isBirthDateMissing ? '<li>Vaiko gimimo data</li>' : '',
      isMediaConsentMissing ? '<li>Vaiko atvaizdo naudojimo sutikimas</li>' : '',
    ].filter(Boolean).join('');

    const fieldsHtml = [
      isParentCodeMissing
        ? '<input id="parent_personal_code" placeholder="Tėvų asmens kodas" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />'
        : '',
      isAddressMissing
        ? '<input id="student_address" placeholder="Adresas" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />'
        : '',
      isAddressMissing
        ? '<input id="student_city" placeholder="Miestas" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />'
        : '',
      isBirthDateMissing
        ? '<label style="font-size:12px;color:#6b7280;margin-top:2px;">Vaiko gimimo data</label><input id="child_birth_date" type="date" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />'
        : '',
      isMediaConsentMissing
        ? `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;background:#f9fafb;">
             <p style="margin:0 0 8px;font-weight:700;color:#111827;">Vaiko atvaizdo naudojimas</p>
             <div style="color:#374151;font-size:13px;line-height:1.55;">
               <p style="margin:0 0 10px;">Sutinku, kad Vaiko atvaizdas (nuotraukos ir vaizdo įrašai) būtų naudojamas VšĮ „Laisvi vaikai“ interneto svetainėje, socialiniuose tinkluose, viešuose pranešimuose ir rinkodaros priemonėse.</p>
               <p style="margin:0 0 10px;">Nesutinku, kad Vaiko atvaizdas būtų naudojamas aukščiau nurodytais tikslais.</p>
             </div>
             <div style="display:grid;gap:8px;margin-top:10px;">
               <label style="display:flex;gap:10px;align-items:flex-start;"><input type="radio" name="media_publicity_consent" value="agree" /> <span>Sutinku</span></label>
               <label style="display:flex;gap:10px;align-items:flex-start;"><input type="radio" name="media_publicity_consent" value="disagree" /> <span>Nesutinku</span></label>
             </div>
           </div>`
        : '',
    ].filter(Boolean).join('');

    return res.status(200).send(pageHtml(`
      <div style="text-align:center;margin-bottom:14px;">
        <div style="display:inline-block;font-size:30px;font-weight:900;color:#4f46e5;letter-spacing:-0.5px;">Tutlio 🎓</div>
      </div>
      <h2 style="margin:0 0 8px;font-size:26px;color:#111827;">Papildykite sutarties duomenis</h2>
      <p style="color:#4b5563;margin:0 0 14px;font-size:14px;">Po pateikimo mokykla gaus atnaujintus duomenis ir persiųs atnaujintą PDF sutartį.</p>
      <div style="color:#7c2d12;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 8px;font-weight:700;">Prašome papildyti trūkstamus duomenis:</p>
        <ul style="margin:0 0 8px 18px;padding:0;line-height:1.5;">${fieldSummary || '<li>Trūkstamų laukų nerasta.</li>'}</ul>
        <p style="margin:0;font-weight:700;">
          Svarbu: sutartį pasirašyti galėsite tik po to, kai užpildysite šiuos trūkstamus duomenis.
        </p>
      </div>
      <p style="color:#7c2d12;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;font-weight:700;display:none;">
        Svarbu: sutartį pasirašyti galėsite tik po to, kai užpildysite šiuos trūkstamus duomenis.
      </p>
      <form id="f" style="display:grid;gap:10px;">
        ${fieldsHtml}
        <div style="margin-top:8px;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;background:#f9fafb;">
          <p style="margin:0 0 8px;font-weight:700;color:#111827;">Antro tėvo / globėjo duomenys (pasirinktinai)</p>
          <p style="margin:0 0 10px;color:#6b7280;font-size:13px;">Jei šie duomenys yra žinomi, galite juos užpildyti. Jei ne - palikite tuščia.</p>
          <div style="display:grid;gap:8px;">
            <input id="parent2_name" placeholder="Antro tėvo vardas ir pavardė" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />
            <input id="parent2_email" type="email" placeholder="Antro tėvo el. paštas" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />
            <input id="parent2_phone" placeholder="Antro tėvo tel. nr." style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />
            <input id="parent2_personal_code" placeholder="Antro tėvo asmens kodas" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />
            <input id="parent2_address" placeholder="Antro tėvo adresas" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />
          </div>
        </div>
        <button id="submitBtn" type="submit" style="padding:12px 16px;border:0;background:#2563eb;color:#fff;border-radius:10px;font-weight:700;cursor:pointer;">Išsaugoti duomenis</button>
      </form>
      <script>
        const form = document.getElementById('f');
        const submitBtn = document.getElementById('submitBtn');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saugoma...'; submitBtn.style.opacity = '0.8'; }
          const get = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
          };
          const payload = {
            token: "${token}",
            contractId: "${resolvedContractId}",
            parent_personal_code: get('parent_personal_code'),
            student_address: get('student_address'),
            student_city: get('student_city'),
            child_birth_date: get('child_birth_date'),
            media_publicity_consent: (() => {
              const el = document.querySelector('input[name="media_publicity_consent"]:checked');
              return el ? el.value : '';
            })(),
            parent2_name: get('parent2_name'),
            parent2_email: get('parent2_email'),
            parent2_phone: get('parent2_phone'),
            parent2_personal_code: get('parent2_personal_code'),
            parent2_address: get('parent2_address'),
          };
          const resp = await fetch('/api/school-contract-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const text = await resp.text();
          document.open(); document.write(text); document.close();
        });
      </script>
    `));
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const body = req.body || {};
  const submittedParentPersonalCode = String(body.parent_personal_code || '').trim();
  const studentAddress = String(body.student_address || '').trim();
  const studentCity = String(body.student_city || '').trim();
  const childBirthDate = String(body.child_birth_date || '').trim();
  const submittedParent2Name = String(body.parent2_name || '').trim();
  const submittedParent2Email = String(body.parent2_email || '').trim();
  const submittedParent2Phone = String(body.parent2_phone || '').trim();
  const submittedParent2PersonalCode = String(body.parent2_personal_code || '').trim();
  const submittedParent2Address = String(body.parent2_address || '').trim();
  const submittedConsent = String(body.media_publicity_consent || '').trim();
  const consentValue = submittedConsent === 'agree' || submittedConsent === 'disagree' ? submittedConsent : '';

  if (isParentCodeMissing && !submittedParentPersonalCode) return res.status(400).send(pageHtml('<h2>Įveskite tėvų asmens kodą.</h2>'));
  if (isAddressMissing && !studentAddress && !studentCity) return res.status(400).send(pageHtml('<h2>Įveskite adresą arba miestą.</h2>'));
  if (isBirthDateMissing && !childBirthDate) return res.status(400).send(pageHtml('<h2>Įveskite vaiko gimimo datą.</h2>'));
  if (isMediaConsentMissing && !consentValue) return res.status(400).send(pageHtml('<h2>Pasirinkite: sutinku arba nesutinku dėl vaiko atvaizdo naudojimo.</h2>'));

  const studentUpdatePayload = {
    payer_personal_code: isParentCodeMissing ? (submittedParentPersonalCode || null) : st.payer_personal_code || null,
    student_address: isAddressMissing ? (studentAddress || null) : st.student_address || null,
    student_city: isAddressMissing ? (studentCity || null) : st.student_city || null,
    child_birth_date: isBirthDateMissing ? (childBirthDate || null) : st.child_birth_date || null,
    parent_secondary_name: submittedParent2Name || st.parent_secondary_name || null,
    parent_secondary_email: submittedParent2Email || st.parent_secondary_email || null,
    parent_secondary_phone: submittedParent2Phone || st.parent_secondary_phone || null,
    parent_secondary_personal_code: submittedParent2PersonalCode || st.parent_secondary_personal_code || null,
    parent_secondary_address: submittedParent2Address || st.parent_secondary_address || null,
    ...(isMediaConsentMissing ? { media_publicity_consent: consentValue } : {}),
  };

  const [studentResult, draftContractResult] = await Promise.all([
    supabase.from('students').update(studentUpdatePayload).eq('id', (contract as any).student_id),
    supabase
      .from('school_contracts')
      .update({
        pdf_url: null,
        signing_status: 'draft',
        sent_at: null,
        ...(isMediaConsentMissing ? { media_publicity_consent: consentValue } : {}),
      })
      .eq('id', (contract as any).id),
  ]);

  const studentErr = studentResult.error;
  if (studentErr) return res.status(500).send(pageHtml(`<h2>Nepavyko išsaugoti: ${studentErr.message}</h2>`));
  if (draftContractResult.error) {
    console.error('[school-contract-complete] nepavyko anuliuoti PDF:', draftContractResult.error.message);
  }

  const fullAddress = [isAddressMissing ? studentAddress : st.student_address || '', isAddressMissing ? studentCity : st.student_city || '']
    .filter(Boolean)
    .join(', ');
  const parentName = String((st.payer_name || '')).trim();
  const parentEmail = String((st.payer_email || '')).trim();
  const parentPhone = String((st.payer_phone || '')).trim();
  const parentPersonalCode = String(isParentCodeMissing ? submittedParentPersonalCode : st.payer_personal_code || '').trim();
  const childBirthDateResolved = String(isBirthDateMissing ? childBirthDate : st.child_birth_date || '').trim();
  const parent2Name = submittedParent2Name || String(st.parent_secondary_name || '').trim();
  const parent2Email = submittedParent2Email || String(st.parent_secondary_email || '').trim();
  const parent2Phone = submittedParent2Phone || String(st.parent_secondary_phone || '').trim();
  const parent2PersonalCode = submittedParent2PersonalCode || String(st.parent_secondary_personal_code || '').trim();
  const parent2Address = submittedParent2Address || String(st.parent_secondary_address || '').trim();
  const hasParent2 = [parent2Name, parent2Email, parent2Phone, parent2PersonalCode, parent2Address].some((v) => Boolean(String(v || '').trim()));
  const parent2Inline = hasParent2
    ? `${parent2Name}; asm. k.: ${parent2PersonalCode}; tel. nr.: ${parent2Phone}; el. paštas: ${parent2Email}; ${parent2Address};`
    : '';
  const parent2Block = hasParent2
    ? `${parent2Name}\nasm. k.: ${parent2PersonalCode}\ntel. nr.: ${parent2Phone}\nel. paštas: ${parent2Email}\n${parent2Address}`
    : '';

  const renderedBody = fillPlaceholders(String((contract as any).filled_body || ''), {
    '{{contract_number}}': String((contract as any).contract_number || ''),
    '{{student_name}}': String(st.full_name || ''),
    '{{student_email}}': String(st.email || ''),
    '{{student_phone}}': String(st.phone || ''),
    '{{parent_name}}': parentName,
    '{{parent_email}}': parentEmail,
    '{{parent_phone}}': parentPhone,
    '{{parent_personal_code}}': parentPersonalCode,
    '{{parent_address}}': fullAddress,
    '{{parent2_name}}': parent2Name,
    '{{parent2_email}}': parent2Email,
    '{{parent2_phone}}': parent2Phone,
    '{{parent2_personal_code}}': parent2PersonalCode,
    '{{parent2_address}}': parent2Address,
    '{{parent2_adress}}': parent2Address,
    '{{parent2_block}}': parent2Block,
    '{{parent2_inline}}': parent2Inline,
    '{{child_birth_date}}': childBirthDateResolved,
    '{{address}}': fullAddress,
    '{{annual_fee}}': String((contract as any).annual_fee || ''),
    '{{date}}': new Date().toLocaleDateString('lt-LT'),
    '{{school_name}}': String((contract as any).organizations?.name || ''),
  });

  const resolvedConsent = (isMediaConsentMissing ? consentValue : existingConsent) || '';
  const consentPending = !resolvedConsent;
  const consentAgreeSelected = resolvedConsent === 'agree';
  const consentDisagreeSelected = resolvedConsent === 'disagree';

  const templatePayload: Record<string, string | boolean | null> = {
    contract_number: templateSafe((contract as any).contract_number),
    student_name: templateSafe(st.full_name),
    student_email: templateSafe(st.email),
    student_phone: templateSafe(st.phone),
    parent_name: templateSafe(parentName),
    parent_email: templateSafe(parentEmail),
    parent_phone: templateSafe(parentPhone),
    parent_personal_code: templateSafe(parentPersonalCode),
    parent_address: templateSafe(fullAddress),
    parent2_name: templateSafe(parent2Name),
    parent2_email: templateSafe(parent2Email),
    parent2_phone: templateSafe(parent2Phone),
    parent2_personal_code: templateSafe(parent2PersonalCode),
    parent2_address: templateSafe(parent2Address),
    parent2_adress: templateSafe(parent2Address),
    parent2_block: templateSafe(parent2Block),
    parent2_inline: templateSafe(parent2Inline),
    child_birth_date: templateSafe(childBirthDateResolved),
    address: templateSafe(fullAddress),
    annual_fee: templateSafe((contract as any).annual_fee),
    date: new Date().toLocaleDateString('lt-LT'),
    school_name: templateSafe((contract as any).organizations?.name),

    // Docxtemplater boolean sections for the DOCX template
    consent_pending: consentPending,
    consent_agree_selected: consentAgreeSelected,
    consent_disagree_selected: consentDisagreeSelected,
  };

  let pdfBytes: Uint8Array;
  const templatePathOrUrl = String((contract as any).template?.pdf_url || '').trim();
  const templatePath = templatePathOrUrl ? extractStoragePath(templatePathOrUrl) : '';
  if (templatePath.toLowerCase().endsWith('.docx')) {
    try {
      const { data: signedData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(templatePath, 300);
      if (!signedData?.signedUrl) throw new Error('Failed to sign template URL');
      pdfBytes = await createDocxTemplatePdf({ fetchUrl: signedData.signedUrl, payload: templatePayload });
    } catch {
      pdfBytes = await createSimpleContractPdf({
        contractNumber: String((contract as any).contract_number || ''),
        studentName: String(st.full_name || ''),
        parentName,
        parentEmail,
        parentPhone,
        parentPersonalCode,
        childBirthDate: childBirthDateResolved,
        address: fullAddress,
        annualFee: (contract as any).annual_fee || 0,
        body: renderedBody,
      });
    }
  } else {
    pdfBytes = await createSimpleContractPdf({
      contractNumber: String((contract as any).contract_number || ''),
      studentName: String(st.full_name || ''),
      parentName,
      parentEmail,
      parentPhone,
      parentPersonalCode,
      childBirthDate: childBirthDateResolved,
      address: fullAddress,
      annualFee: (contract as any).annual_fee || 0,
      body: renderedBody,
    });
  }
  const path = schoolContractPdfStoragePath({
    organizationId: String((contract as any).organization_id),
    contractId: String((contract as any).id),
    contractNumber: (contract as any).contract_number ?? null,
  });
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(
    path,
    new Blob([pdfBytes], { type: 'application/pdf' }),
    { cacheControl: '3600', upsert: true, contentType: 'application/pdf' },
  );
  const uploadedPath = uploadErr ? null : path;
  const publicUrl = uploadedPath
    ? (supabase.storage.from(BUCKET).getPublicUrl(uploadedPath).data.publicUrl || '')
    : '';

  await supabase
    .from('school_contracts')
    .update({
      pdf_url: uploadedPath,
      filled_body: renderedBody,
      signing_status: uploadedPath ? 'sent' : 'draft',
      sent_at: uploadedPath ? new Date().toISOString() : null,
    })
    .eq('id', (contract as any).id);

  if (parentEmail && uploadedPath) {
    const emailPayload = JSON.stringify({
      type: 'school_contract',
      to: parentEmail,
      data: {
        schoolName: String((contract as any).organizations?.name || ''),
        schoolEmail: String((contract as any).organizations?.email || ''),
        studentName: String(st.full_name || ''),
        parentName: parentName || String(st.full_name || ''),
        recipientName: parentName || String(st.full_name || ''),
        parentPhone,
        parentPersonalCode,
        childBirthDate: childBirthDateResolved,
        address: fullAddress,
        missingFields: [],
        contractNumber: String((contract as any).contract_number || ''),
        annualFee: (contract as any).annual_fee || 0,
        contractBody: renderedBody,
        pdfUrl: publicUrl,
        date: new Date().toLocaleDateString('lt-LT'),
        contractId: (contract as any).id,
      },
    });
    const emailUrl = `${(process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '')}/api/send-email`;
    void fetch(emailUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
      body: emailPayload,
    }).catch(() => {});
  }

  if (tokenRow?.id) {
    await supabase
      .from('school_contract_completion_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);
  }

  return res.status(200).send(pageHtml('<h2>Ačiū! Duomenys išsaugoti.</h2><p><strong>Atnaujinta PDF sutartis išsiųsta jūsų el. paštu.</strong></p><p>Sutartį pasirašykite gavę atnaujintą versiją.</p>'));
}

