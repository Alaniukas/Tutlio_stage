import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { SCHOOL_CONTRACTS_BUCKET, extractSchoolContractStoragePath } from './_lib/schoolContractPdfPath.js';
import { resolveSchoolContractPdfStoragePath } from './_lib/ensureSchoolContractPdfPath.js';
import { mapWithConcurrency } from './_lib/mapWithConcurrency.js';
import { currentContractPdfPath } from '../src/lib/schoolContractFilters.js';
import {
  buildSchoolContractsExportZipBytes,
  schoolContractsZipExportFilename,
  type SchoolContractZipRow,
  type SchoolEmployeeZipRow,
} from '../src/lib/schoolContractsZipExport.js';

const STUDENT_EXPORT_SELECT =
  'id, contract_number, kind, student_id, pdf_url, signed_contract_url, student:students(full_name, payer_name, payer_email), signatures:school_contract_signatures(role, status, signed_pdf_path)';

const EMPLOYEE_EXPORT_SELECT =
  'id, contract_number, party_kind, counterparty_name, counterparty_email, pdf_url, signed_contract_url, staff_document_type, staff_document_group_id, staff_files_deleted_at, signatures:school_contract_signatures(role, status, signed_pdf_path)';

const DOWNLOAD_CONCURRENCY = 20;

type ExportContractRow = {
  id: string;
  contract_number?: string | null;
  kind?: string | null;
  student_id?: string | null;
  party_kind?: string | null;
  counterparty_name?: string | null;
  counterparty_email?: string | null;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  staff_document_type?: 'confidentiality' | 'consent' | null;
  staff_document_group_id?: string | null;
  staff_files_deleted_at?: string | null;
  student?: { full_name?: string | null; payer_name?: string | null; payer_email?: string | null } | null;
  signatures?: Array<{ role?: string | null; status?: string | null; signed_pdf_path?: string | null }> | null;
};

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function uniqueIds(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function fetchContractsByIds(
  supabase: SupabaseClient,
  orgId: string,
  ids: string[],
  select: string,
  variant: 'student' | 'teacher' | 'staff',
): Promise<ExportContractRow[]> {
  const rows: ExportContractRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const chunk = ids.slice(offset, offset + 50);
    let query = supabase
      .from('school_contracts')
      .select(select)
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .in('id', chunk);
    if (variant === 'student') {
      query = query.is('staff_document_type', null).neq('party_kind', 'teacher');
    } else if (variant === 'teacher') {
      query = query.eq('party_kind', 'teacher').is('staff_document_type', null);
    } else {
      query = query.not('staff_document_type', 'is', null);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as unknown as ExportContractRow[]));
  }
  return rows;
}

function resolveStaffDocumentStoragePath(contract: ExportContractRow): string | null {
  if (contract.staff_files_deleted_at) return null;
  const current = currentContractPdfPath(contract as Parameters<typeof currentContractPdfPath>[0]);
  if (current) return extractSchoolContractStoragePath(current);
  const fallback = contract.signed_contract_url || contract.pdf_url;
  return fallback ? extractSchoolContractStoragePath(String(fallback)) : null;
}

async function downloadStoragePdf(
  supabase: SupabaseClient,
  path: string | null,
): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return bytes.byteLength > 0 ? bytes : null;
}

async function downloadStudentContractPdf(
  supabase: SupabaseClient,
  orgId: string,
  contract: ExportContractRow,
): Promise<{ id: string; bytes: Uint8Array | null }> {
  const path = await resolveSchoolContractPdfStoragePath(supabase, orgId, contract);
  const bytes = await downloadStoragePdf(supabase, path);
  return { id: contract.id, bytes };
}

async function downloadEmployeeContractPdf(
  supabase: SupabaseClient,
  orgId: string,
  contract: ExportContractRow,
): Promise<{ id: string; bytes: Uint8Array | null }> {
  const path = contract.staff_document_type
    ? resolveStaffDocumentStoragePath(contract)
    : await resolveSchoolContractPdfStoragePath(supabase, orgId, contract);
  const bytes = await downloadStoragePdf(supabase, path);
  return { id: contract.id, bytes };
}

function toStudentZipRow(contract: ExportContractRow): SchoolContractZipRow {
  return {
    id: contract.id,
    contractNumber: contract.contract_number,
    kind: contract.kind,
    studentId: contract.student_id,
    studentName: contract.student?.full_name,
    payerName: contract.student?.payer_name,
    payerEmail: contract.student?.payer_email,
    pdfPath: 'ready',
  };
}

function toEmployeeZipRow(contract: ExportContractRow): SchoolEmployeeZipRow {
  const documentKind = contract.staff_document_type === 'confidentiality'
    ? 'staff_confidentiality'
    : contract.staff_document_type === 'consent'
      ? 'staff_consent'
      : 'teacher';
  const email = String(contract.counterparty_email || '').trim().toLowerCase();
  const groupKey = email
    || `group:${contract.staff_document_group_id || contract.id}`;
  return {
    id: contract.id,
    groupKey,
    employeeName: contract.counterparty_name,
    employeeEmail: contract.counterparty_email,
    contractNumber: contract.contract_number,
    documentKind,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) return json(res, 401, { error: 'Unauthorized' });

  const studentContractIds = uniqueIds([
    ...(Array.isArray(req.body?.studentContractIds) ? req.body.studentContractIds : []),
    ...(Array.isArray(req.body?.contractIds) ? req.body.contractIds : []),
  ]);
  const teacherContractIds = uniqueIds(Array.isArray(req.body?.teacherContractIds) ? req.body.teacherContractIds : []);
  const staffDocumentIds = uniqueIds(Array.isArray(req.body?.staffDocumentIds) ? req.body.staffDocumentIds : []);
  if (!studentContractIds.length && !teacherContractIds.length && !staffDocumentIds.length) {
    return json(res, 400, { error: 'Missing contract ids' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminAccess = await getOrgAdminAccessByUserId(supabase, auth.userId);
  const orgId = adminAccess?.organizationId;
  if (!orgId || !hasOrgAdminPermission(adminAccess?.role, adminAccess?.permissions, 'contracts.view')) {
    return json(res, 403, { error: 'Forbidden' });
  }

  try {
    const [studentRows, teacherRows, staffRows] = await Promise.all([
      studentContractIds.length
        ? fetchContractsByIds(supabase, orgId, studentContractIds, STUDENT_EXPORT_SELECT, 'student')
        : Promise.resolve([]),
      teacherContractIds.length
        ? fetchContractsByIds(supabase, orgId, teacherContractIds, EMPLOYEE_EXPORT_SELECT, 'teacher')
        : Promise.resolve([]),
      staffDocumentIds.length
        ? fetchContractsByIds(supabase, orgId, staffDocumentIds, EMPLOYEE_EXPORT_SELECT, 'staff')
        : Promise.resolve([]),
    ]);

    const orderedStudentRows = studentContractIds
      .map((id) => studentRows.find((row) => row.id === id))
      .filter(Boolean) as ExportContractRow[];
    const orderedEmployeeRows = [...teacherContractIds, ...staffDocumentIds]
      .map((id) => [...teacherRows, ...staffRows].find((row) => row.id === id))
      .filter(Boolean) as ExportContractRow[];

    const downloads = await mapWithConcurrency(
      [
        ...orderedStudentRows.map((contract) => ({ contract, kind: 'student' as const })),
        ...orderedEmployeeRows.map((contract) => ({ contract, kind: 'employee' as const })),
      ],
      DOWNLOAD_CONCURRENCY,
      async ({ contract, kind }) => (
        kind === 'student'
          ? downloadStudentContractPdf(supabase, orgId, contract)
          : downloadEmployeeContractPdf(supabase, orgId, contract)
      ),
    );

    const pdfByContractId = new Map<string, Uint8Array>();
    const failedIds: string[] = [];
    for (const item of downloads) {
      if (item.bytes) pdfByContractId.set(item.id, item.bytes);
      else failedIds.push(item.id);
    }

    const built = buildSchoolContractsExportZipBytes(
      orderedStudentRows.filter((row) => pdfByContractId.has(row.id)).map(toStudentZipRow),
      orderedEmployeeRows.filter((row) => pdfByContractId.has(row.id)).map(toEmployeeZipRow),
      pdfByContractId,
    );
    if (!built.bytes || built.downloaded === 0) {
      return json(res, 404, { error: 'Nėra sutarčių su PDF failais eksportui.', code: 'zip_empty' });
    }

    const scope = studentContractIds.length && (teacherContractIds.length || staffDocumentIds.length)
      ? 'all'
      : (teacherContractIds.length || staffDocumentIds.length ? 'employees' : 'payers');
    const filename = schoolContractsZipExportFilename(scope);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Contract-Zip-Downloaded', String(built.downloaded));
    res.setHeader('X-Contract-Zip-Payers', String(built.payerCount));
    res.setHeader('X-Contract-Zip-Employees', String(built.employeeCount));
    if (failedIds.length) res.setHeader('X-Contract-Zip-Failed', failedIds.join(','));
    res.end(Buffer.from(built.bytes));
    return undefined;
  } catch (e) {
    console.error('[school-contracts-export-zip]', (e as Error).message);
    return json(res, 500, { error: (e as Error).message || 'ZIP export failed' });
  }
}
