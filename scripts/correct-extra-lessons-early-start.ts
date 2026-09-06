/**
 * Correct signed extra-lessons contracts where start_within_14 was wrongly recorded as NO
 * (UI default bug). Regenerates PDF, updates DB, resends accepted email + first-lesson invite.
 *
 *   npx tsx scripts/correct-extra-lessons-early-start.ts
 *   npx tsx scripts/correct-extra-lessons-early-start.ts --dry-run
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getResendApiKey, getFromEmail } from '../api/_lib/resendConfig.js';
import {
  START_WITHIN_14_CHECKBOX_TEXT,
  freezeDocumentSource,
  sha256Hex,
  startWithin14Label,
  recordingConsentLabel,
} from '../src/lib/extraLessonsContract.js';
import { renderAndStoreExtraLessonsPdf } from '../api/_lib/extraLessonsPdf.js';
import { sendFirstLessonInvite } from '../api/_lib/extraLessonsFirstLessonInvite.js';
import {
  extraLessonsPayloadForContract,
  fillExtraLessonsBody,
  extraLessonsTemplateSource,
  snapshotFromRow,
  vilniusDateTimeLabel,
} from '../api/_lib/extraLessonsContractShared.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAISVI_ORG = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const INVITE_ONLY_NUMBERS = ['PP-18114207', 'PP-09295121', 'PP-09034123', 'PP-12005517'];
const dryRun = process.argv.includes('--dry-run');
const invitesOnly = process.argv.includes('--invites-only');

function loadEnv() {
  for (const rel of ['.env.local', '.env']) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

function correctionEmailHtml(params: {
  parentName: string;
  schoolName: string;
  contractNumber: string;
  acceptedAt: string;
  sha256: string;
}) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Tahoma,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="padding:20px 24px;text-align:center;border-bottom:1px solid #f0f0f0;"><span style="font-size:26px;font-weight:900;color:#4f46e5;">Tutlio 🎓</span></td></tr>
<tr><td style="background:linear-gradient(135deg,#059669,#047857);padding:32px 24px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Atnaujinta sutarties kopija</h1>
<p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0;">${esc(params.schoolName)}</p></td></tr>
<tr><td style="padding:32px 24px;">
<p style="font-size:16px;color:#1f2937;margin:0 0 16px;">Sveiki, ${esc(params.parentName)},</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:0 0 20px;">
<p style="margin:0;color:#991b1b;font-size:14px;line-height:1.6;"><strong>Atsiprašome dėl sistemos klaidos.</strong> Patvirtinant papildomų užsiėmimų sutartį neteisingai buvo užfiksuota, kad neprašėte pradėti paslaugų iš karto. Jūsų pasirinkimas ir toliau lieka <strong>pradėti užsiėmimus iš karto</strong> (TAIP). Pridedame pataisytą sutarties PDF — visi kiti duomenys lieka tie patys.</p>
</div>
<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 16px;">Žemiau — atnaujinta sutarties santrauka. Pilnas PDF pridėtas prie šio laiško.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border:1px solid #e5e3ff;border-radius:12px;padding:4px 16px;">
<tr><td style="padding:10px 0;border-bottom:1px solid #f0eeff;color:#6b7280;font-size:14px;">Sutarties Nr.</td><td style="padding:10px 0;border-bottom:1px solid #f0eeff;color:#1f2937;font-size:14px;font-weight:600;text-align:right;">${esc(params.contractNumber)}</td></tr>
<tr><td style="padding:10px 0;border-bottom:1px solid #f0eeff;color:#6b7280;font-size:14px;">Sudarymo data</td><td style="padding:10px 0;border-bottom:1px solid #f0eeff;color:#1f2937;font-size:14px;font-weight:600;text-align:right;">${esc(params.acceptedAt)}</td></tr>
<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">Prašymas pradėti per 14 d.</td><td style="padding:10px 0;color:#1f2937;font-size:14px;font-weight:600;text-align:right;">TAIP</td></tr>
<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">Dokumento SHA-256</td><td style="padding:10px 0;color:#1f2937;font-size:13px;font-weight:600;text-align:right;word-break:break-all;">${esc(params.sha256)}</td></tr>
</table>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px 24px;text-align:center;border-top:1px solid #f0f0f0;">
<p style="color:#9ca3af;font-size:12px;margin:4px 0;">Tutlio komanda</p>
<p style="margin:4px 0 0;font-size:12px;color:#6b7280;"><a href="mailto:tutlio@laisvivaikai.lt" style="color:#6b7280;">tutlio@laisvivaikai.lt</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

async function sendCorrectionEmail(params: {
  to: string;
  parentName: string;
  schoolName: string;
  contractNumber: string;
  acceptedAt: string;
  sha256: string;
  pdfBase64: string;
  organizationId: string;
}) {
  const apiKey = getResendApiKey();
  if (!apiKey) throw new Error('Resend not configured');
  const resend = new Resend(apiKey);
  const from = getFromEmail();
  const html = correctionEmailHtml(params);
  const text = `Atsiprašome dėl sistemos klaidos. Pridedame pataisytą sutartį ${params.contractNumber} — prašymas pradėti paslaugas per 14 dienų: TAIP. Sudarymo data: ${params.acceptedAt}. SHA-256: ${params.sha256}.`;
  const { data, error } = await resend.emails.send({
    from,
    to: [params.to],
    replyTo: 'tutlio@laisvivaikai.lt',
    subject: `Pataisyta sutartis Nr. ${params.contractNumber} — ${params.parentName || 'Mokėtojas'}`,
    html,
    text,
    attachments: [{
      filename: `sutartis-${params.contractNumber}.pdf`,
      content: Buffer.from(params.pdfBase64, 'base64'),
    }],
  });
  if (error) throw new Error(error.message);
  return data?.id;
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiBase = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from('school_contracts')
    .select(`
      id, contract_number, accepted_at, accepted_by_user_id, recording_consent, class_group_id,
      filled_body, order_snapshot, organization_id, student_id,
      students(full_name, payer_name, payer_email, payer_phone, grade, linked_user_id),
      organizations(name)
    `)
    .eq('organization_id', LAISVI_ORG)
    .eq('kind', 'extra_lessons')
    .eq('signing_status', 'signed');

  if (invitesOnly) {
    query = query.in('contract_number', INVITE_ONLY_NUMBERS);
  } else {
    query = query.eq('start_within_14_status', 'no');
  }

  const { data: rows, error } = await query;

  if (error) throw new Error(error.message);
  if (!rows?.length) {
    console.log('No contracts with start_within_14_status=no');
    return;
  }

  console.log(`Found ${rows.length} contract(s) to correct${dryRun ? ' (dry-run)' : ''}`);

  for (const row of rows) {
    const st = (row as any).students || {};
    const org = (row as any).organizations || {};
    const contractNumber = String(row.contract_number || '');
    const payerEmail = String(st.payer_email || '').trim();
    console.log('\n---', contractNumber, payerEmail, '---');

    const acceptedAt = new Date(String(row.accepted_at));
    const acceptedAtLabel = vilniusDateTimeLabel(acceptedAt);
    const order = snapshotFromRow(row);
    if (!order) throw new Error(`Missing order snapshot for ${contractNumber}`);

    const templateBody = extraLessonsTemplateSource({
      organizationId: row.organization_id,
      storedBody: row.filled_body,
    });

    const payload = extraLessonsPayloadForContract({
      contractNumber,
      order,
      parentName: String(st.payer_name || ''),
      parentEmail: String(st.payer_email || ''),
      parentPhone: String(st.payer_phone || ''),
      studentName: String(st.full_name || ''),
      studentGrade: String(st.grade || ''),
      userId: String(row.accepted_by_user_id || st.linked_user_id || st.payer_email || ''),
      schoolName: String(org.name || ''),
    });
    payload.data_laikas_Europe_Vilnius = acceptedAtLabel;
    payload.naudotojo_ID = String(row.accepted_by_user_id || st.payer_email || '');

    const start14Label = startWithin14Label('yes');
    const recLabel = recordingConsentLabel(row.recording_consent ?? null);
    payload.sutikimo_su_salygomis_busena = 'TAIP';
    payload.start_within_14_label = start14Label;
    payload.recording_consent_label = recLabel;

    const filled = fillExtraLessonsBody({
      templateBody,
      organizationId: row.organization_id,
      payload,
      startWithin14Label: start14Label,
      recordingConsentLabel: recLabel,
      acceptedAtLabel,
      termsAcceptedLabel: 'TAIP',
    });

    const freezeSource = freezeDocumentSource({
      payload,
      filled_body: filled,
      acceptance: {
        accepted_terms: true,
        start_within_14_days: true,
        start_within_14_status: 'yes',
        start_within_14_shown_text: START_WITHIN_14_CHECKBOX_TEXT,
        recording_consent: row.recording_consent ?? null,
      },
    });
    const documentSha256 = await sha256Hex(freezeSource);
    payload.dokumento_sha256 = documentSha256;
    payload['SHA-256_ar_kitas_integralumo_ID'] = documentSha256;
    payload.el_pastas_ir_issiuntimo_data_laikas = [payerEmail, acceptedAtLabel].filter(Boolean).join(' · ');

    const frozenBody = fillExtraLessonsBody({
      templateBody,
      organizationId: row.organization_id,
      payload,
      sha256: documentSha256,
      startWithin14Label: start14Label,
      recordingConsentLabel: recLabel,
      acceptedAtLabel,
      termsAcceptedLabel: 'TAIP',
      confirmationSentLabel: payload.el_pastas_ir_issiuntimo_data_laikas,
    });

    if (dryRun) {
      console.log('Would set start_within_14_status=yes, new sha256:', documentSha256.slice(0, 16) + '…');
      console.log('Body contains TAIP for 14d:', frozenBody.includes('Prašymas pradėti paslaugas per 14 dienų\n\nTAIP'));
      continue;
    }

    if (invitesOnly) {
      const fakeReq = { headers: { host: 'localhost:3002', 'x-forwarded-proto': 'http' } } as any;
      const invite = await sendFirstLessonInvite(supabase, fakeReq, {
        contractId: row.id,
        contractNumber,
        organizationId: LAISVI_ORG,
        schoolName: org.name || null,
        studentId: String(row.student_id || st.id),
        studentName: st.full_name || null,
        parentName: st.payer_name || null,
        payerEmail,
        order,
        acceptedAtIso: acceptedAt.toISOString(),
        startWithin14Status: 'yes',
        classGroupId: row.class_group_id || null,
      });
      console.log('First-lesson invite:', invite.sent ? 'sent' : invite.reason || 'skipped', invite.serviceStartYmd);
      continue;
    }

    const rendered = await renderAndStoreExtraLessonsPdf(supabase, {
      contract: row,
      student: st,
      filledBody: frozenBody,
      indicativeMonthlyEur: order.indicative_monthly_eur,
      extraLessonsPayload: payload,
    });
    if (!rendered.uploadedPath || !rendered.pdfBase64) {
      throw new Error(`PDF generation failed for ${contractNumber}`);
    }

    const { error: updErr } = await supabase.from('school_contracts').update({
      start_within_14_days: true,
      start_within_14_status: 'yes',
      start_within_14_shown_text: START_WITHIN_14_CHECKBOX_TEXT,
      document_sha256: documentSha256,
      filled_body: frozenBody,
      pdf_url: rendered.uploadedPath,
      signed_contract_url: rendered.uploadedPath,
    }).eq('id', row.id);
    if (updErr) throw new Error(updErr.message);

    console.log('DB updated, PDF:', rendered.uploadedPath);

    try {
      const emailId = await sendCorrectionEmail({
        to: payerEmail,
        parentName: String(st.payer_name || st.full_name || ''),
        schoolName: String(org.name || 'VšĮ „Laisvi vaikai"'),
        contractNumber,
        acceptedAt: acceptedAtLabel,
        sha256: documentSha256,
        pdfBase64: rendered.pdfBase64,
        organizationId: LAISVI_ORG,
      });
      console.log('Correction email sent to', payerEmail, emailId);
    } catch (emailErr) {
      console.error('Email failed — trying Resend fallback path skipped:', (emailErr as Error).message);
      throw emailErr;
    }

    const fakeReq = { headers: { host: 'localhost:3002', 'x-forwarded-proto': 'http' } } as any;
    const invite = await sendFirstLessonInvite(supabase, fakeReq, {
      contractId: row.id,
      contractNumber,
      organizationId: LAISVI_ORG,
      schoolName: org.name || null,
      studentId: String(row.student_id || st.id),
      studentName: st.full_name || null,
      parentName: st.payer_name || null,
      payerEmail,
      order,
      acceptedAtIso: acceptedAt.toISOString(),
      startWithin14Status: 'yes',
      classGroupId: row.class_group_id || null,
    });
    console.log('First-lesson invite:', invite.sent ? 'sent' : invite.reason || 'skipped');
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
