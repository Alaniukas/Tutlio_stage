import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

function pageHtml(content: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sutarties duomenų papildymas</title></head><body style="margin:0;font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#f5f3ff 0%,#ecfeff 50%,#f0fdf4 100%);padding:24px;"><div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:24px;box-shadow:0 10px 35px rgba(2,6,23,.08);">${content}</div></body></html>`;
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

const execFileAsync = promisify(execFile);

function sofficeCandidates(): string[] {
  const fromEnv = process.env.LIBREOFFICE_PATH ? [process.env.LIBREOFFICE_PATH] : [];
  return [
    ...fromEnv,
    'soffice',
    'soffice.exe',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
}

async function convertDocxBufferToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'school-contract-complete-'));
  const inputPath = path.join(workDir, 'contract.docx');
  const outputPath = path.join(workDir, 'contract.pdf');
  await fs.writeFile(inputPath, docxBuffer);

  let lastError: unknown = null;
  try {
    for (const bin of sofficeCandidates()) {
      try {
        await execFileAsync(bin, ['--headless', '--convert-to', 'pdf', '--outdir', workDir, inputPath], {
          windowsHide: true,
          timeout: 120000,
        });
        const pdf = await fs.readFile(outputPath);
        if (pdf.length > 0) return pdf;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(lastError instanceof Error ? lastError.message : 'DOCX conversion failed');
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
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
  templateUrl: string;
  payload: Record<string, string>;
}): Promise<Uint8Array> {
  const response = await fetch(params.templateUrl);
  if (!response.ok) throw new Error('Nepavyko atsisiųsti DOCX šablono');
  const source = await response.arrayBuffer();
  const zip = new PizZip(source);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(params.payload as any);
  const renderedDocx = Buffer.from(doc.getZip().generate({ type: 'uint8array' }));
  const pdfBuffer = await convertDocxBufferToPdf(renderedDocx);
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
    .select('id, student_id, organization_id, template_id, contract_number, annual_fee, filled_body, template:school_contract_templates(pdf_url), organizations(name, email), student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date)')
    .eq('id', resolvedContractId)
    .maybeSingle();
  if (contractErr || !contract) return res.status(404).send(pageHtml('<h2>Sutartis nerasta.</h2>'));

  const st = (contract as any).student || {};
  const isAddressMissing = !String(st.student_address || '').trim() && !String(st.student_city || '').trim();
  const isBirthDateMissing = !String(st.child_birth_date || '').trim();
  const isParentCodeMissing = !String(st.payer_personal_code || '').trim();

  if (req.method === 'GET') {
    const fieldSummary = [
      isAddressMissing ? '<li>Gyvenamoji vieta</li>' : '',
      isParentCodeMissing ? '<li>Tėvų asmens kodas</li>' : '',
      isBirthDateMissing ? '<li>Vaiko gimimo data</li>' : '',
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

  if (isParentCodeMissing && !submittedParentPersonalCode) return res.status(400).send(pageHtml('<h2>Įveskite tėvų asmens kodą.</h2>'));
  if (isAddressMissing && !studentAddress && !studentCity) return res.status(400).send(pageHtml('<h2>Įveskite adresą arba miestą.</h2>'));
  if (isBirthDateMissing && !childBirthDate) return res.status(400).send(pageHtml('<h2>Įveskite vaiko gimimo datą.</h2>'));

  const { error: studentErr } = await supabase
    .from('students')
    .update({
      payer_personal_code: isParentCodeMissing ? (submittedParentPersonalCode || null) : st.payer_personal_code || null,
      student_address: isAddressMissing ? (studentAddress || null) : st.student_address || null,
      student_city: isAddressMissing ? (studentCity || null) : st.student_city || null,
      child_birth_date: isBirthDateMissing ? (childBirthDate || null) : st.child_birth_date || null,
      parent_secondary_name: submittedParent2Name || st.parent_secondary_name || null,
      parent_secondary_email: submittedParent2Email || st.parent_secondary_email || null,
      parent_secondary_phone: submittedParent2Phone || st.parent_secondary_phone || null,
      parent_secondary_personal_code: submittedParent2PersonalCode || st.parent_secondary_personal_code || null,
      parent_secondary_address: submittedParent2Address || st.parent_secondary_address || null,
    })
    .eq('id', (contract as any).student_id);
  if (studentErr) return res.status(500).send(pageHtml(`<h2>Nepavyko išsaugoti: ${studentErr.message}</h2>`));

  await supabase
    .from('school_contracts')
    .update({ pdf_url: null, signing_status: 'draft', sent_at: null })
    .eq('id', (contract as any).id);

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

  const templatePayload: Record<string, string> = {
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
  };

  let pdfBytes: Uint8Array;
  const templateUrl = String((contract as any).template?.pdf_url || '').trim();
  if (templateUrl.toLowerCase().endsWith('.docx')) {
    try {
      pdfBytes = await createDocxTemplatePdf({ templateUrl, payload: templatePayload });
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
  const safeStudent = String(st.full_name || 'student').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const path = `${(contract as any).organization_id}/contracts/${(contract as any).id}-${safeStudent}-${Date.now()}.pdf`;
  const { error: uploadErr } = await supabase.storage.from('school-contracts').upload(
    path,
    new Blob([pdfBytes], { type: 'application/pdf' }),
    { cacheControl: '3600', upsert: false, contentType: 'application/pdf' },
  );
  const publicUrl = uploadErr
    ? null
    : supabase.storage.from('school-contracts').getPublicUrl(path).data.publicUrl;

  await supabase
    .from('school_contracts')
    .update({
      pdf_url: publicUrl || null,
      filled_body: renderedBody,
      signing_status: publicUrl ? 'sent' : 'draft',
      sent_at: publicUrl ? new Date().toISOString() : null,
    })
    .eq('id', (contract as any).id);

  if (parentEmail && publicUrl) {
    await fetch(`${(process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt')}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
      body: JSON.stringify({
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
      }),
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

