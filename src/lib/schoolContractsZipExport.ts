import { zipSync } from 'fflate';
import { isExtraLessonsContractKind } from './extraLessonsContract.js';
import { sanitizeContractNumberForFilename } from './schoolContractPdfPath.js';
import { schoolPayerKey } from './schoolPayerInvoiceGroups.js';

export type SchoolContractZipRow = {
  id: string;
  contractNumber?: string | null;
  kind?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  pdfPath?: string | null;
};

export type SchoolEmployeeZipRow = {
  id: string;
  groupKey: string;
  employeeName?: string | null;
  employeeEmail?: string | null;
  contractNumber?: string | null;
  documentKind: 'teacher' | 'staff_confidentiality' | 'staff_consent';
};

export type SchoolContractPayerZipGroup = {
  payerKey: string;
  payerName: string;
  payerEmail: string;
  contracts: SchoolContractZipRow[];
};

export type SchoolEmployeeZipGroup = {
  groupKey: string;
  employeeName: string;
  employeeEmail: string;
  contracts: SchoolEmployeeZipRow[];
};

export type SchoolContractsZipExportRequest = {
  studentContractIds?: string[];
  teacherContractIds?: string[];
  staffDocumentIds?: string[];
};

function sanitizeZipStem(value: string, maxLen = 72): string {
  const stem = String(value || '')
    .trim()
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return stem.slice(0, maxLen) || 'nežinomas';
}

function uniqueEntryName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : '';
  let index = 2;
  while (used.has(`${stem} (${index})${ext}`)) index += 1;
  const next = `${stem} (${index})${ext}`;
  used.add(next);
  return next;
}

export function schoolContractZipPdfFilename(contract: SchoolContractZipRow): string {
  const student = sanitizeZipStem(contract.studentName || 'mokinys', 48);
  const kind = isExtraLessonsContractKind(contract.kind) ? 'papildomos' : 'metine';
  const number = sanitizeContractNumberForFilename(contract.contractNumber || contract.id, 40);
  return `${student}-${kind}-${number}.pdf`;
}

export function schoolEmployeeZipPdfFilename(contract: SchoolEmployeeZipRow): string {
  const number = sanitizeContractNumberForFilename(contract.contractNumber || contract.id, 40);
  if (contract.documentKind === 'teacher') return `mokytojo-sutartis-${number}.pdf`;
  if (contract.documentKind === 'staff_confidentiality') return `konfidencialumas-${number}.pdf`;
  return `sutikimas-${number}.pdf`;
}

export function schoolContractPayerZipFilename(group: Pick<SchoolContractPayerZipGroup, 'payerName' | 'payerEmail' | 'payerKey'>): string {
  const name = sanitizeZipStem(group.payerName || 'Mokėtojas', 40);
  const email = sanitizeZipStem(group.payerEmail || group.payerKey.replace(/^student:/, ''), 40);
  return `${name}-${email}.zip`;
}

export function schoolEmployeeZipFilename(group: Pick<SchoolEmployeeZipGroup, 'employeeName' | 'employeeEmail' | 'groupKey'>): string {
  const name = sanitizeZipStem(group.employeeName || 'Darbuotojas', 40);
  const email = sanitizeZipStem(group.employeeEmail || group.groupKey.replace(/^group:/, ''), 40);
  return `${name}-${email}.zip`;
}

export function schoolContractsZipExportFilename(
  scope: 'payers' | 'employees' | 'all' = 'payers',
  date = new Date().toISOString().slice(0, 10),
): string {
  if (scope === 'employees') return `darbuotoju-sutartys-${date}.zip`;
  if (scope === 'all') return `sutartys-eksportas-${date}.zip`;
  return `sutartys-pagal-mokejoja-${date}.zip`;
}

/** Group contracts under the payer email; siblings share one inner ZIP. */
export function groupSchoolContractsByPayer(rows: SchoolContractZipRow[]): SchoolContractPayerZipGroup[] {
  const map = new Map<string, SchoolContractPayerZipGroup>();
  for (const row of rows) {
    const payerKey = schoolPayerKey(row.payerEmail, row.studentId);
    const current = map.get(payerKey) || {
      payerKey,
      payerName: String(row.payerName || row.studentName || '').trim(),
      payerEmail: String(row.payerEmail || '').trim(),
      contracts: [],
    };
    if (!current.payerName && row.payerName) current.payerName = String(row.payerName).trim();
    current.contracts.push(row);
    map.set(payerKey, current);
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      contracts: [...group.contracts].sort((a, b) => {
        const studentCmp = String(a.studentName || '').localeCompare(String(b.studentName || ''), 'lt');
        if (studentCmp !== 0) return studentCmp;
        const kindCmp = String(a.kind || '').localeCompare(String(b.kind || ''), 'lt');
        if (kindCmp !== 0) return kindCmp;
        return String(a.contractNumber || a.id).localeCompare(String(b.contractNumber || b.id), 'lt');
      }),
    }))
    .sort((a, b) => a.payerName.localeCompare(b.payerName, 'lt') || a.payerEmail.localeCompare(b.payerEmail, 'lt'));
}

/** Group teacher and staff documents under the same employee email / group. */
export function groupSchoolContractsByEmployee(rows: SchoolEmployeeZipRow[]): SchoolEmployeeZipGroup[] {
  const map = new Map<string, SchoolEmployeeZipGroup>();
  for (const row of rows) {
    const email = String(row.employeeEmail || '').trim().toLowerCase();
    const groupKey = email || row.groupKey;
    const current = map.get(groupKey) || {
      groupKey,
      employeeName: String(row.employeeName || '').trim(),
      employeeEmail: String(row.employeeEmail || '').trim(),
      contracts: [],
    };
    if (!current.employeeName && row.employeeName) current.employeeName = String(row.employeeName).trim();
    current.contracts.push(row);
    map.set(groupKey, current);
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      contracts: [...group.contracts].sort((a, b) => {
        const kindCmp = a.documentKind.localeCompare(b.documentKind, 'lt');
        if (kindCmp !== 0) return kindCmp;
        return String(a.contractNumber || a.id).localeCompare(String(b.contractNumber || b.id), 'lt');
      }),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'lt') || a.employeeEmail.localeCompare(b.employeeEmail, 'lt'));
}

function addGroupedInnerZips(
  mainEntries: Record<string, Uint8Array>,
  usedOuterNames: Set<string>,
  prefix: string,
  groups: Array<{ zipName: string; contracts: Array<{ id: string; filename: string }> }>,
  pdfByContractId: Map<string, Uint8Array>,
  failedIds: string[],
): { innerCount: number; downloaded: number } {
  let innerCount = 0;
  let downloaded = 0;
  for (const group of groups) {
    const payerEntries: Record<string, Uint8Array> = {};
    const usedPdfNames = new Set<string>();
    for (const contract of group.contracts) {
      const bytes = pdfByContractId.get(contract.id);
      if (!bytes?.byteLength) {
        failedIds.push(contract.id);
        continue;
      }
      payerEntries[uniqueEntryName(contract.filename, usedPdfNames)] = bytes;
      downloaded += 1;
    }
    if (!Object.keys(payerEntries).length) continue;
    const outerName = uniqueEntryName(
      `${prefix}${group.zipName.replace(/\.zip$/i, '')}`,
      usedOuterNames,
    );
    mainEntries[`${outerName}.zip`] = zipSync(payerEntries);
    innerCount += 1;
  }
  return { innerCount, downloaded };
}

export function buildSchoolContractsExportZipBytes(
  studentContracts: SchoolContractZipRow[],
  employeeContracts: SchoolEmployeeZipRow[],
  pdfByContractId: Map<string, Uint8Array>,
): { bytes: Uint8Array | null; payerCount: number; employeeCount: number; downloaded: number; failedIds: string[] } {
  const mainEntries: Record<string, Uint8Array> = {};
  const usedOuterNames = new Set<string>();
  const failedIds: string[] = [];
  let downloaded = 0;

  const payerGroups = groupSchoolContractsByPayer(studentContracts.filter((row) => pdfByContractId.has(row.id)));
  const payerBuilt = addGroupedInnerZips(
    mainEntries,
    usedOuterNames,
    'mokejai/',
    payerGroups.map((group) => ({
      zipName: schoolContractPayerZipFilename(group),
      contracts: group.contracts.map((contract) => ({
        id: contract.id,
        filename: schoolContractZipPdfFilename(contract),
      })),
    })),
    pdfByContractId,
    failedIds,
  );
  downloaded += payerBuilt.downloaded;

  const employeeGroups = groupSchoolContractsByEmployee(employeeContracts.filter((row) => pdfByContractId.has(row.id)));
  const employeeBuilt = addGroupedInnerZips(
    mainEntries,
    usedOuterNames,
    'darbuotojai/',
    employeeGroups.map((group) => ({
      zipName: schoolEmployeeZipFilename(group),
      contracts: group.contracts.map((contract) => ({
        id: contract.id,
        filename: schoolEmployeeZipPdfFilename(contract),
      })),
    })),
    pdfByContractId,
    failedIds,
  );
  downloaded += employeeBuilt.downloaded;

  const payerCount = payerBuilt.innerCount;
  const employeeCount = employeeBuilt.innerCount;
  if ((!payerCount && !employeeCount) || downloaded === 0) {
    return { bytes: null, payerCount: 0, employeeCount: 0, downloaded: 0, failedIds };
  }
  return { bytes: zipSync(mainEntries), payerCount, employeeCount, downloaded, failedIds };
}

/** @deprecated Use buildSchoolContractsExportZipBytes */
export function buildSchoolContractsByPayerZipBytes(
  contracts: SchoolContractZipRow[],
  pdfByContractId: Map<string, Uint8Array>,
): { bytes: Uint8Array | null; payerCount: number; downloaded: number; failedIds: string[] } {
  const built = buildSchoolContractsExportZipBytes(contracts, [], pdfByContractId);
  return {
    bytes: built.bytes,
    payerCount: built.payerCount,
    downloaded: built.downloaded,
    failedIds: built.failedIds,
  };
}

async function triggerZipDownload(blob: Blob, zipName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = zipName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadSchoolContractsZip(
  payload: SchoolContractsZipExportRequest,
  options: {
    authHeaders: HeadersInit;
    zipName?: string;
    scope?: 'payers' | 'employees' | 'all';
  },
): Promise<{ payerCount: number; employeeCount: number; downloaded: number; failedIds: string[] }> {
  const studentContractIds = (payload.studentContractIds || []).filter(Boolean);
  const teacherContractIds = (payload.teacherContractIds || []).filter(Boolean);
  const staffDocumentIds = (payload.staffDocumentIds || []).filter(Boolean);
  if (!studentContractIds.length && !teacherContractIds.length && !staffDocumentIds.length) {
    return { payerCount: 0, employeeCount: 0, downloaded: 0, failedIds: [] };
  }

  const response = await fetch('/api/school-contracts-export-zip', {
    method: 'POST',
    headers: { ...options.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentContractIds,
      teacherContractIds,
      staffDocumentIds,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || 'zip_export_failed');
  }

  const downloaded = Number(response.headers.get('X-Contract-Zip-Downloaded') || '0');
  const payerCount = Number(response.headers.get('X-Contract-Zip-Payers') || '0');
  const employeeCount = Number(response.headers.get('X-Contract-Zip-Employees') || '0');
  const failedIds = (response.headers.get('X-Contract-Zip-Failed') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const blob = await response.blob();
  if (!blob.size) {
    return {
      payerCount: 0,
      employeeCount: 0,
      downloaded: 0,
      failedIds: [...studentContractIds, ...teacherContractIds, ...staffDocumentIds],
    };
  }

  const scope = options.scope
    || (studentContractIds.length && (teacherContractIds.length || staffDocumentIds.length) ? 'all' : undefined)
    || (teacherContractIds.length || staffDocumentIds.length ? 'employees' : 'payers');
  await triggerZipDownload(blob, options.zipName || schoolContractsZipExportFilename(scope));
  return { payerCount, employeeCount, downloaded, failedIds };
}

export async function downloadSchoolContractsByPayerZip(
  contracts: SchoolContractZipRow[],
  options: {
    authHeaders: HeadersInit;
    zipName?: string;
  },
): Promise<{ payerCount: number; downloaded: number; failedIds: string[] }> {
  const result = await downloadSchoolContractsZip(
    { studentContractIds: contracts.map((row) => row.id).filter(Boolean) },
    { ...options, scope: 'payers' },
  );
  return {
    payerCount: result.payerCount,
    downloaded: result.downloaded,
    failedIds: result.failedIds,
  };
}
