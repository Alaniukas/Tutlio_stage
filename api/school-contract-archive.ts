import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import {
  ARCHIVED_CONTRACT_SELECT,
  archivedContractStoragePath,
  archivedStudentContractsQuery,
  canViewContractArchive,
  type ArchivedContractRow,
} from './_lib/schoolContractArchive.js';
import type { ArchivedSchoolContract } from '../src/lib/schoolContractArchive.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return json(res, 401, { error: 'Unauthorized' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 500, { error: 'Server misconfigured' });
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const access = await getOrgAdminAccessByUserId(db, auth.userId);
    if (!access || !canViewContractArchive(access)) return json(res, 403, { error: 'Forbidden' });
    const orgId = access.organizationId;

    if (req.method === 'POST') {
      const id = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
      if (!id) return json(res, 400, { error: 'Missing contract id' });
      const { data, error } = await archivedStudentContractsQuery(db, orgId, ARCHIVED_CONTRACT_SELECT)
        .eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return json(res, 404, { error: 'Contract not found' });
      const path = archivedContractStoragePath(data as unknown as ArchivedContractRow, orgId);
      if (!path) return json(res, 404, { error: 'Contract file not available' });
      const { data: signed, error: signError } = await db.storage.from(SCHOOL_CONTRACTS_BUCKET)
        .createSignedUrl(path, 60 * 15, { download: true });
      if (signError || !signed?.signedUrl) return json(res, 404, { error: 'Contract file not available' });
      return json(res, 200, { signedUrl: signed.signedUrl });
    }

    const rows: ArchivedSchoolContract[] = [];
    for (let offset = 0; ; ) {
      const { data, error } = await archivedStudentContractsQuery(db, orgId, ARCHIVED_CONTRACT_SELECT)
        .order('archived_at', { ascending: false }).order('id').range(offset, offset + 499);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data as unknown as ArchivedContractRow[]) {
        rows.push({
          id: row.id,
          contractNumber: row.contract_number || '',
          archivedAt: row.archived_at || '',
          studentName: row.student?.full_name || '',
          payerName: row.student?.payer_name || '',
          payerEmail: row.student?.payer_email || '',
          hasFile: Boolean(archivedContractStoragePath(row, orgId)),
        });
      }
      offset += data.length;
    }
    return json(res, 200, { contracts: rows });
  } catch (error) {
    console.error('[school-contract-archive]', error);
    return json(res, 500, { error: 'Could not load contract archive' });
  }
}
