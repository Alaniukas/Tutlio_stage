import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types';
import { requireCronAuth } from './_lib/cronAuth.js';
import { SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { staffPdfPathsForRetention, STAFF_DOCUMENT_RETENTION_DAYS } from './_lib/schoolStaffDocuments.js';

async function listFiles(supabase: SupabaseClient, folder: string, depth = 0): Promise<string[]> {
  if (depth > 4) throw new Error('Unexpected staff document folder depth');
  const { data, error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).list(folder, { limit: 1000 });
  if (error) throw error;
  const paths: string[] = [];
  for (const item of data || []) {
    const path = `${folder}/${item.name}`;
    if (!item.id) paths.push(...await listFiles(supabase, path, depth + 1));
    else paths.push(path);
  }
  return paths;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronAuth(req, res)) return;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server misconfigured' });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const cutoff = new Date(Date.now() - STAFF_DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const fields = 'id, organization_id, signed_at, staff_revoked_at';
  const [signed, revoked] = await Promise.all([
    supabase.from('school_contracts').select(fields).not('staff_document_type', 'is', null)
      .is('staff_files_deleted_at', null).lte('signed_at', cutoff).limit(100),
    supabase.from('school_contracts').select(fields).not('staff_document_type', 'is', null)
      .is('staff_files_deleted_at', null).lte('staff_revoked_at', cutoff).limit(100),
  ]);
  if (signed.error || revoked.error) return res.status(500).json({ error: signed.error?.message || revoked.error?.message });
  const due = new Map<string, { id: string; organization_id: string }>();
  for (const row of [...(signed.data || []), ...(revoked.data || [])]) due.set(row.id, row);
  let deleted = 0;
  const errors: string[] = [];
  for (const row of due.values()) {
    if (!/^[0-9a-f-]{36}$/i.test(row.id) || !/^[0-9a-f-]{36}$/i.test(row.organization_id)) {
      errors.push(`Invalid row id: ${row.id}`);
      continue;
    }
    const folder = `${row.organization_id}/contracts/${row.id}`;
    try {
      const paths = staffPdfPathsForRetention(await listFiles(supabase, folder), folder);
      for (let index = 0; index < paths.length; index += 100) {
        const chunk = paths.slice(index, index + 100);
        if (!chunk.every((path) => path.startsWith(`${folder}/`))) throw new Error('Invalid storage path');
        const { error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).remove(chunk);
        if (error) throw error;
      }
      // Keep the signer identity, role, status and signing dates. Clear links to
      // deleted PDFs and short-lived signing credentials.
      const { error: signaturesError } = await supabase.from('school_contract_signatures').update({
        signed_pdf_path: null, signer_certificate: null, signer_personal_code: null,
        token: null, signing_url: null, gosign_transaction_id: null,
      }).eq('contract_id', row.id);
      if (signaturesError) throw signaturesError;
      const at = new Date().toISOString();
      const { error: contractError } = await supabase.from('school_contracts').update({
        pdf_url: null, signed_contract_url: null, staff_consent_answers: null, staff_files_deleted_at: at,
      }).eq('id', row.id).is('staff_files_deleted_at', null);
      if (contractError) throw contractError;
      deleted += 1;
    } catch (error: any) {
      errors.push(`${row.id}: ${error?.message || 'failed'}`);
    }
  }
  return res.status(errors.length ? 500 : 200).json({ success: errors.length === 0, due: due.size, deleted, errors });
}
