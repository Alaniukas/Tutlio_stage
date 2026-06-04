import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { renderAndStoreSchoolContractPdf } from './_lib/schoolContractPdf';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

const CONTRACT_SELECT =
  'id, student_id, organization_id, template_id, contract_number, annual_fee, filled_body, media_publicity_consent, completion_submitted_at, template:school_contract_templates(pdf_url), organizations(name, email, entity_type), student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent)';

/**
 * Admin confirms parent-supplemented contract data: regenerate the final PDF from
 * the student's current data, email it to the parent, mark it sent, and clear the
 * pending-completion flag. Org-admin only.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) return json(res, 401, { error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
  if (!contractId) return json(res, 400, { error: 'Missing contractId' });

  const { data: contract, error: contractErr } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SELECT)
    .eq('id', contractId)
    .maybeSingle();
  if (contractErr || !contract) return json(res, 404, { error: 'Contract not found' });

  const orgId = String((contract as any).organization_id || '').trim();
  if (!orgId) return json(res, 500, { error: 'Contract missing organization_id' });

  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!adminRow) return json(res, 403, { error: 'Forbidden' });

  let uploadedPath: string | null = null;
  let renderedBody = '';
  try {
    const result = await renderAndStoreSchoolContractPdf(supabase, contract);
    uploadedPath = result.uploadedPath;
    renderedBody = result.renderedBody;
  } catch (e: any) {
    console.error('[school-contract-confirm-completion] PDF generation failed:', e?.message || e);
    return json(res, 500, { error: 'Nepavyko sugeneruoti sutarties PDF.' });
  }

  if (!uploadedPath) return json(res, 500, { error: 'Nepavyko įkelti sutarties PDF.' });

  const { error: updateErr } = await supabase
    .from('school_contracts')
    .update({
      pdf_url: uploadedPath,
      filled_body: renderedBody,
      signing_status: 'sent',
      sent_at: new Date().toISOString(),
      completion_submitted_at: null,
    })
    .eq('id', contractId);
  if (updateErr) return json(res, 500, { error: updateErr.message });

  const st = (contract as any).student || {};
  const parentName = String(st.payer_name || '').trim();
  const parentEmail = String(st.payer_email || '').trim();
  let emailSent = false;
  if (parentEmail) {
    try {
      await fetch(`${APP_URL.replace(/\/$/, '')}/api/send-email`, {
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
            missingFields: [],
            contractNumber: String((contract as any).contract_number || ''),
            annualFee: (contract as any).annual_fee || 0,
            contractBody: renderedBody,
            pdfUrl: uploadedPath,
            date: new Date().toLocaleDateString('lt-LT'),
            contractId: (contract as any).id,
            ...(orgId ? { organizationId: orgId } : {}),
          },
        }),
      });
      emailSent = true;
    } catch (e: any) {
      console.error('[school-contract-confirm-completion] email failed:', e?.message || e);
    }
  }

  return json(res, 200, { success: true, contractId, pdfUrl: uploadedPath, emailSent });
}
