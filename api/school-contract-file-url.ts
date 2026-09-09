import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import {
  extractSchoolContractStoragePath,
  SCHOOL_CONTRACTS_BUCKET,
} from './_lib/schoolContractPdfPath.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import {
  buildExtraLessonsOrderSnapshot,
  EXTRA_LESSONS_CONTRACT_KIND,
  EXTRA_LESSONS_DEFAULT_BODY,
} from '../src/lib/extraLessonsContract.js';
import { renderAndStoreExtraLessonsPdf } from './_lib/extraLessonsPdf.js';
import {
  extraLessonsPayloadForContract,
  fillExtraLessonsBody,
  snapshotFromRow,
} from './_lib/extraLessonsContractShared.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function ensureExtraLessonsPdfPath(
  supabase: SupabaseClient,
  contractId: string,
  orgId: string,
): Promise<string | null> {
  const { data: contract } = await supabase
    .from('school_contracts')
    .select('id, organization_id, student_id, contract_number, kind, pdf_url, filled_body, template_id, order_snapshot, unit_price_eur, annual_fee')
    .eq('id', contractId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!contract || contract.kind !== EXTRA_LESSONS_CONTRACT_KIND) return null;

  const existingPath = contract.pdf_url ? extractSchoolContractStoragePath(String(contract.pdf_url)) : '';
  if (existingPath) return existingPath;

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, grade, payer_name, payer_email, payer_phone')
    .eq('id', contract.student_id)
    .maybeSingle();
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();

  const order = snapshotFromRow(contract) || buildExtraLessonsOrderSnapshot({
    unit_price_eur: Number(contract.unit_price_eur || 0),
    service_name: 'Papildomi užsiėmimai',
    duration_minutes: 0,
    start_date: '',
    end_date: '',
    base_lessons_per_month: 0,
  });
  const filledBody = String(contract.filled_body || EXTRA_LESSONS_DEFAULT_BODY);
  const payload = extraLessonsPayloadForContract({
    contractNumber: String(contract.contract_number || ''),
    order,
    parentName: String(student?.payer_name || ''),
    parentEmail: String(student?.payer_email || ''),
    parentPhone: String(student?.payer_phone || ''),
    studentName: String(student?.full_name || ''),
    studentGrade: String(student?.grade || ''),
    userId: String(student?.id || contract.student_id),
    schoolName: String(org?.name || ''),
  });

  try {
    const rendered = await renderAndStoreExtraLessonsPdf(supabase, {
      contract: {
        id: contract.id,
        organization_id: orgId,
        contract_number: contract.contract_number,
        template_id: contract.template_id,
      },
      student: student || {},
      filledBody: fillExtraLessonsBody({
        templateBody: filledBody,
        organizationId: orgId,
        payload,
      }),
      indicativeMonthlyEur: order.indicative_monthly_eur || Number(contract.annual_fee || 0),
      extraLessonsPayload: payload,
    });
    if (rendered.uploadedPath) {
      await supabase.from('school_contracts').update({ pdf_url: rendered.uploadedPath }).eq('id', contract.id);
      return extractSchoolContractStoragePath(rendered.uploadedPath);
    }
  } catch (e) {
    console.error('[school-contract-file-url] ensure extra pdf', (e as Error).message);
  }
  return null;
}

/** Org-admin signed download URL for a school-contracts storage object. */
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

  const rawPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
  if (!rawPath && !contractId) return json(res, 400, { error: 'Missing path' });

  const adminAccess = await getOrgAdminAccessByUserId(supabase, auth.userId);
  if (!hasOrgAdminPermission(adminAccess?.role, adminAccess?.permissions, 'contracts.view')) {
    return json(res, 403, { error: 'Forbidden' });
  }

  let path = rawPath ? extractSchoolContractStoragePath(rawPath) : '';
  let orgPrefix = path.split('/')[0] || '';

  if (!path && contractId) {
    if (adminAccess?.organizationId) {
      const ensured = await ensureExtraLessonsPdfPath(supabase, contractId, adminAccess.organizationId);
      if (ensured) path = ensured;
      orgPrefix = adminAccess.organizationId;
    }
    if (!path) return json(res, 404, { error: 'Sutarties failas dar neįkeltas.', code: 'file_not_found' });
  }

  if (!orgPrefix) return json(res, 400, { error: 'Invalid path' });
  if (adminAccess?.organizationId !== orgPrefix) return json(res, 403, { error: 'Forbidden' });

  const folderPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const fileName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  const { data: listed, error: listErr } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .list(folderPath, { search: fileName, limit: 5 });
  if (listErr) return json(res, 500, { error: listErr.message });

  let exists = (listed || []).some((f) => f.name === fileName);
  if (!exists && contractId) {
    const ensured = await ensureExtraLessonsPdfPath(supabase, contractId, orgPrefix);
    if (ensured) {
      path = ensured;
      exists = true;
    }
  }
  if (!exists) {
    return json(res, 404, { error: 'Sutarties failas dar neįkeltas.', code: 'file_not_found' });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 15);
  if (signErr || !signed?.signedUrl) {
    return json(res, 500, { error: signErr?.message || 'Nepavyko sugeneruoti nuorodos.' });
  }

  return json(res, 200, { success: true, signedUrl: signed.signedUrl });
}
