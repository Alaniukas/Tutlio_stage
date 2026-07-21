import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { renderAndStoreSchoolContractPdf } from './_lib/schoolContractPdf.js';
import { isGoSignConfigured } from './_lib/gosignConfig.js';
import { contractSigningSettings } from './_lib/schoolContractSigning.js';
import { SCHOOL_CONTRACTS_BUCKET, extractSchoolContractStoragePath } from './_lib/schoolContractPdfPath.js';

const CONTRACT_SELECT =
  'id, student_id, organization_id, template_id, contract_number, annual_fee, filled_body, signing_status, pdf_url, media_publicity_consent, completion_submitted_at, template:school_contract_templates(pdf_url), organizations(name, email, entity_type, features), student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent)';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).send('Server misconfigured');
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const token =
    (typeof req.query?.token === 'string' ? req.query.token : '') ||
    (typeof req.body?.token === 'string' ? req.body.token : '');

  let tokenRow: { id: string; contract_id: string; expires_at: string } | null = null;
  let resolvedContractId = '';
  if (token) {
    // `select('*')` keeps this working on databases that still have the legacy
    // `used` boolean instead of `used_at` (see 20260605160000 migration).
    const { data, error: tokenErr } = await supabase
      .from('school_contract_completion_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (tokenErr || !data) return res.status(404).send(pageHtml('<h2>Nuoroda nerasta.</h2>'));
    const tokenUsed =
      Boolean((data as { used_at?: string | null }).used_at) ||
      (data as { used?: boolean | null }).used === true;
    if (tokenUsed) return res.status(410).send(pageHtml('<h2>Nuoroda jau panaudota.</h2>'));
    if (new Date(data.expires_at).getTime() < Date.now()) return res.status(410).send(pageHtml('<h2>Nuoroda nebegalioja.</h2>'));
    tokenRow = data as any;
    resolvedContractId = data.contract_id;
  } else {
    return res.status(400).send(pageHtml('<h2>Nenurodytas token.</h2>'));
  }

  const { data: contract, error: contractErr } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SELECT)
    .eq('id', resolvedContractId)
    .maybeSingle();
  if (contractErr || !contract) return res.status(404).send(pageHtml('<h2>Sutartis nerasta.</h2>'));
  if (String((contract as any).signing_status || '') !== 'sent') {
    return res.status(409).send(pageHtml('<h2>Sutartis šiuo metu nebegali būti peržiūrima šia nuoroda.</h2>'));
  }

  const st = (contract as any).student || {};
  const orgEntityType = String((contract as any)?.organizations?.entity_type || '').trim().toLowerCase();
  const isSchoolOrg = orgEntityType === 'school';
  const existingConsent = String((contract as any)?.media_publicity_consent || '').trim();
  const isAddressMissing = !String(st.student_address || '').trim() && !String(st.student_city || '').trim();
  const isBirthDateMissing = !String(st.child_birth_date || '').trim();
  const isParentCodeMissing = !String(st.payer_personal_code || '').trim();
  const isParentPhoneMissing = !String(st.payer_phone || '').trim();
  const isMediaConsentMissing = isSchoolOrg && !existingConsent;

  if (req.method === 'GET') {
    const wantsJson = String(req.query?.format ?? '') === 'json';
    if (wantsJson) {
      let pdfUrl: string | null = null;
      const storedPdf = String((contract as any).pdf_url || '').trim();
      if (storedPdf) {
        const { data: signed } = await supabase.storage
          .from(SCHOOL_CONTRACTS_BUCKET)
          .createSignedUrl(extractSchoolContractStoragePath(storedPdf), 60 * 60);
        pdfUrl = signed?.signedUrl || null;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          ok: true,
          token: token || null,
          contractId: resolvedContractId,
          contractNumber: String((contract as any).contract_number || ''),
          studentName: String(st.full_name || ''),
          schoolName: String((contract as any).organizations?.name || ''),
          pdfUrl,
          missing: {
            address: isAddressMissing,
            birthDate: isBirthDateMissing,
            parentCode: isParentCodeMissing,
            parentPhone: isParentPhoneMissing,
            mediaPublicity: isMediaConsentMissing,
          },
        }),
      );
    }

    const appBase = publicAppOriginForRedirect(req);
    if (appBase) {
      const dest = `${appBase}/school-contract-complete?token=${encodeURIComponent(token)}`;
      res.statusCode = 302;
      res.setHeader('Location', dest);
      return res.end();
    }
    const fieldSummary = [
      isAddressMissing ? '<li>Gyvenamoji vieta</li>' : '',
      isParentCodeMissing ? '<li>Tėvų asmens kodas</li>' : '',
      isParentPhoneMissing ? '<li>Tėvų tel. nr.</li>' : '',
      isBirthDateMissing ? '<li>Vaiko gimimo data</li>' : '',
      isMediaConsentMissing ? '<li>Vaiko atvaizdo naudojimo sutikimas</li>' : '',
    ].filter(Boolean).join('');

    const fieldsHtml = [
      isParentCodeMissing
        ? '<input id="parent_personal_code" placeholder="Tėvų asmens kodas" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />'
        : '',
      isParentPhoneMissing
        ? '<input id="parent_phone" placeholder="Tėvų tel. nr." style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;" />'
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
      <p style="color:#4b5563;margin:0 0 14px;font-size:14px;">Peržiūrėkite sutartį, papildykite trūkstamus duomenis ir patvirtinkite jų teisingumą. Mokykla sutartį pasirašys pirmoji.</p>
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
        <label style="display:flex;gap:10px;align-items:flex-start;border:1px solid #c7d2fe;background:#eef2ff;border-radius:12px;padding:12px 14px;color:#312e81;font-size:14px;">
          <input id="review_confirmed" type="checkbox" required style="margin-top:2px;" />
          <span>Patvirtinu, kad peržiūrėjau sutartį ir pateikti duomenys yra teisingi.</span>
        </label>
        <button id="submitBtn" type="submit" style="padding:12px 16px;border:0;background:#2563eb;color:#fff;border-radius:10px;font-weight:700;cursor:pointer;">Patvirtinti ir perduoti mokyklai</button>
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
            review_confirmed: Boolean(document.getElementById('review_confirmed')?.checked),
            parent_personal_code: get('parent_personal_code'),
            parent_phone: get('parent_phone'),
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
  if (body.review_confirmed !== true && body.review_confirmed !== 'true') {
    return res.status(400).send(pageHtml('<h2>Patvirtinkite, kad sutartį peržiūrėjote ir duomenys yra teisingi.</h2>'));
  }
  const submittedParentPersonalCode = String(body.parent_personal_code || '').trim();
  const submittedParentPhone = String(body.parent_phone || '').trim();
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
  if (isParentPhoneMissing && !submittedParentPhone) return res.status(400).send(pageHtml('<h2>Įveskite tėvų tel. nr.</h2>'));
  if (isAddressMissing && !studentAddress && !studentCity) return res.status(400).send(pageHtml('<h2>Įveskite adresą arba miestą.</h2>'));
  if (isBirthDateMissing && !childBirthDate) return res.status(400).send(pageHtml('<h2>Įveskite vaiko gimimo datą.</h2>'));
  if (isMediaConsentMissing && !consentValue) return res.status(400).send(pageHtml('<h2>Pasirinkite: sutinku arba nesutinku dėl vaiko atvaizdo naudojimo.</h2>'));

  const studentUpdatePayload = {
    payer_personal_code: isParentCodeMissing ? (submittedParentPersonalCode || null) : st.payer_personal_code || null,
    payer_phone: isParentPhoneMissing ? (submittedParentPhone || null) : st.payer_phone || null,
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

  const [studentResult, contractConsentResult] = await Promise.all([
    supabase.from('students').update(studentUpdatePayload).eq('id', (contract as any).student_id),
    isMediaConsentMissing
      ? supabase
          .from('school_contracts')
          .update({ media_publicity_consent: consentValue })
          .eq('id', (contract as any).id)
      : Promise.resolve({ error: null }),
  ]);

  const studentErr = studentResult.error;
  if (studentErr) return res.status(500).send(pageHtml(`<h2>Nepavyko išsaugoti: ${studentErr.message}</h2>`));
  if (contractConsentResult.error) {
    console.error('[school-contract-complete] nepavyko išsaugoti sutikimo:', contractConsentResult.error.message);
  }

  // Re-fetch the contract so the joined student row reflects the just-saved
  // data, then regenerate the PDF for the admin's mandatory review/signature.
  const { data: freshContract } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SELECT)
    .eq('id', (contract as any).id)
    .maybeSingle();

  let uploadedPath = '';
  let renderedBody = '';
  try {
    const result = await renderAndStoreSchoolContractPdf(supabase, freshContract || contract);
    uploadedPath = result.uploadedPath;
    renderedBody = result.renderedBody;
  } catch (e: any) {
    console.error('[school-contract-complete] PDF generation failed:', e?.message || e);
    return res.status(500).send(pageHtml('<h2>Nepavyko paruošti atnaujintos sutarties.</h2><p>Bandykite dar kartą vėliau.</p>'));
  }

  if (!uploadedPath) {
    return res.status(500).send(pageHtml('<h2>Nepavyko paruošti atnaujintos sutarties.</h2>'));
  }

  const emailContract = freshContract || contract;
  const esignEnabled =
    Boolean((emailContract as any)?.organizations?.features?.school_contract_esign) && isGoSignConfigured();
  const completionSubmittedAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('school_contracts')
    .update({
      pdf_url: uploadedPath,
      filled_body: renderedBody,
      completion_submitted_at: completionSubmittedAt,
      signing_status: esignEnabled ? 'awaiting_school_signature' : 'sent',
    })
    .eq('id', (contract as any).id);
  if (updateErr) {
    console.error('[school-contract-complete] nepavyko atnaujinti sutarties:', updateErr.message);
    return res.status(500).send(pageHtml('<h2>Nepavyko išsaugoti sutarties būsenos.</h2>'));
  }

  const emailSt = (emailContract as any).student || st;
  const settings = contractSigningSettings(emailContract);
  const { data: adminPdfData } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .createSignedUrl(extractSchoolContractStoragePath(uploadedPath), 60 * 60 * 24 * 14);
  let adminEmailSent = false;
  if (settings.email) {
    try {
      const emailUrl = `${(process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '')}/api/send-email`;
      const emailRes = await fetch(emailUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
        body: JSON.stringify({
          type: 'school_contract_completion_admin',
          to: settings.email,
          locale: 'lt',
          data: {
            schoolName: String((contract as any).organizations?.name || ''),
            studentName: String(emailSt.full_name || ''),
            parentName: String(emailSt.payer_name || ''),
            contractNumber: String((contract as any).contract_number || ''),
            pdfUrl: adminPdfData?.signedUrl || undefined,
            contractsUrl: `${(process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '')}/school/contracts`,
            contractId: (contract as any).id,
            ...((contract as any).organization_id ? { organizationId: (contract as any).organization_id } : {}),
          },
        }),
      });
      adminEmailSent = emailRes.ok;
      if (!emailRes.ok) {
        console.error('[school-contract-complete] admin email failed: HTTP', emailRes.status);
      }
    } catch (e: any) {
      console.error('[school-contract-complete] admin email failed:', e?.message || e);
    }
  }

  if (tokenRow?.id) {
    const { error: usedAtErr } = await supabase
      .from('school_contract_completion_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);
    if (usedAtErr?.code === '42703') {
      // Legacy schema without `used_at` — fall back to the old `used` boolean.
      await supabase
        .from('school_contract_completion_tokens')
        .update({ used: true })
        .eq('id', tokenRow.id);
    }
  }

  return res.status(200).send(
    pageHtml(
      '<h2>Ačiū! Duomenys patvirtinti.</h2><p>Mokykla peržiūrės sutartį ir ją pasirašys. Pasirašymo nuorodą gausite el. paštu vėliau.</p>' +
        (adminEmailSent ? '' : '<p>Mokyklos administratorius informaciją taip pat matys Tutlio Sutarčių skiltyje.</p>'),
    ),
  );
}
