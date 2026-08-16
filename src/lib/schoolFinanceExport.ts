
export type SchoolFinancePaymentStatus = 'pending' | 'paid' | 'overdue' | 'failed' | 'no_schedule';

export type SchoolFinanceExportRow = {
  contractId: string;
  studentName: string;
  parentName: string;
  parentEmail: string;
  contractNumber: string;
  contractSigningStatus: string;
  annualFee: number;
  installmentNumber: number | null;
  installmentAmount: number | null;
  dueDate: string | null;
  paymentStatus: SchoolFinancePaymentStatus;
  paidAt: string | null;
  paymentMethod: 'stripe' | 'manual' | 'none';
  stripeCheckoutSessionId: string | null;
};

export type SchoolFinanceFilters = {
  paymentStatus: 'all' | 'unpaid' | 'paid' | 'overdue';
  search: string;
  paidFrom: string;
  paidTo: string;
};

/** Calendar day (YYYY-MM-DD) in Europe/Vilnius — school orgs are LT-based. */
export function schoolFinanceDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export type SchoolFinanceSummary = {
  totalInstallmentCount: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  paidCount: number;
  unpaidCount: number;
  overdueCount: number;
  contractsWithoutSchedule: number;
};

export const MANUAL_SIGNED_FILE_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

export function mimeForManualSignedFile(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

export function isManualSignedFile(file: File): boolean {
  const mime = mimeForManualSignedFile(file);
  if (mime.startsWith('image/') || mime === 'application/pdf') return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp';
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function signingStatusLabel(status: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    draft: t('school.draft'),
    sent: t('school.sentStatus'),
    awaiting_school_signature: t('school.statusAwaitingSchool'),
    signed_by_school: t('school.statusSignedBySchool'),
    signed: t('school.signedStatus'),
  };
  return map[status] || status;
}

export function paymentStatusLabel(status: SchoolFinancePaymentStatus, t: (key: string) => string): string {
  const map: Record<SchoolFinancePaymentStatus, string> = {
    pending: t('school.payStatusPending'),
    paid: t('school.payStatusPaid'),
    overdue: t('school.payStatusOverdue'),
    failed: t('school.payStatusFailed'),
    no_schedule: t('school.financeNoSchedule'),
  };
  return map[status] || status;
}

export function paymentMethodLabel(method: SchoolFinanceExportRow['paymentMethod'], t: (key: string) => string): string {
  if (method === 'stripe') return t('school.financeMethodStripe');
  if (method === 'manual') return t('school.financeMethodManual');
  return t('school.financeMethodNone');
}

export function paymentStatusTone(
  status: SchoolFinancePaymentStatus,
): 'success' | 'warning' | 'danger' | 'neutral' | 'muted' {
  if (status === 'paid') return 'success';
  if (status === 'overdue' || status === 'failed') return 'danger';
  if (status === 'no_schedule') return 'warning';
  if (status === 'pending') return 'neutral';
  return 'muted';
}

export const PAYMENT_STATUS_BADGE_CLASS: Record<ReturnType<typeof paymentStatusTone>, string> = {
  success: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
  neutral: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200',
  muted: 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200',
};

export function inferPaymentMethod(
  paymentStatus: string,
  stripeCheckoutSessionId: string | null | undefined,
): SchoolFinanceExportRow['paymentMethod'] {
  if (paymentStatus !== 'paid') return 'none';
  return stripeCheckoutSessionId ? 'stripe' : 'manual';
}

type ContractLike = {
  id: string;
  contract_number?: string | null;
  annual_fee?: number | null;
  signing_status?: string | null;
  student?: {
    full_name?: string | null;
    payer_name?: string | null;
    payer_email?: string | null;
    email?: string | null;
  } | null;
};

type InstallmentLike = {
  contract_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  payment_status: 'pending' | 'paid' | 'overdue' | 'failed';
  stripe_checkout_session_id?: string | null;
  paid_at?: string | null;
  contract?: ContractLike | null;
};

export function buildSchoolFinanceRows(
  contracts: ContractLike[],
  installments: InstallmentLike[],
): SchoolFinanceExportRow[] {
  const rows: SchoolFinanceExportRow[] = installments.map((inst) => {
    const contract = inst.contract;
    const student = contract?.student;
    return {
      contractId: inst.contract_id,
      studentName: student?.full_name || '',
      parentName: student?.payer_name || student?.full_name || '',
      parentEmail: student?.payer_email || student?.email || '',
      contractNumber: contract?.contract_number || '',
      contractSigningStatus: contract?.signing_status || '',
      annualFee: Number(contract?.annual_fee || 0),
      installmentNumber: inst.installment_number,
      installmentAmount: Number(inst.amount),
      dueDate: inst.due_date,
      paymentStatus: inst.payment_status,
      paidAt: inst.paid_at || null,
      paymentMethod: inferPaymentMethod(inst.payment_status, inst.stripe_checkout_session_id),
      stripeCheckoutSessionId: inst.stripe_checkout_session_id || null,
    };
  });

  const contractIdsWithInstallments = new Set(installments.map((i) => i.contract_id));
  for (const contract of contracts) {
    if (contractIdsWithInstallments.has(contract.id)) continue;
    if (contract.signing_status !== 'signed') continue;
    const student = contract.student;
    rows.push({
      contractId: contract.id,
      studentName: student?.full_name || '',
      parentName: student?.payer_name || student?.full_name || '',
      parentEmail: student?.payer_email || student?.email || '',
      contractNumber: contract.contract_number || '',
      contractSigningStatus: contract.signing_status || '',
      annualFee: Number(contract.annual_fee || 0),
      installmentNumber: null,
      installmentAmount: null,
      dueDate: null,
      paymentStatus: 'no_schedule',
      paidAt: null,
      paymentMethod: 'none',
      stripeCheckoutSessionId: null,
    });
  }

  return rows.sort((a, b) => {
    const studentCmp = a.studentName.localeCompare(b.studentName, 'lt');
    if (studentCmp !== 0) return studentCmp;
    const aNum = a.installmentNumber ?? 999;
    const bNum = b.installmentNumber ?? 999;
    return aNum - bNum;
  });
}

export function filterSchoolFinanceRows(rows: SchoolFinanceExportRow[], filters: SchoolFinanceFilters): SchoolFinanceExportRow[] {
  const q = normalizeSearch(filters.search);
  return rows.filter((row) => {
    if (filters.paymentStatus === 'paid' && row.paymentStatus !== 'paid') return false;
    if (filters.paymentStatus === 'unpaid' && (row.paymentStatus === 'paid' || row.paymentStatus === 'no_schedule')) return false;
    if (filters.paymentStatus === 'overdue' && row.paymentStatus !== 'overdue') return false;

    if (filters.paidFrom || filters.paidTo) {
      const paidKey = schoolFinanceDateKey(row.paidAt);
      if (!paidKey) return false;
      if (filters.paidFrom && paidKey < filters.paidFrom) return false;
      if (filters.paidTo && paidKey > filters.paidTo) return false;
    }

    if (!q) return true;
    const haystack = normalizeSearch(
      [row.studentName, row.parentName, row.parentEmail, row.contractNumber].join(' '),
    );
    return haystack.includes(q);
  });
}

export function summarizeSchoolFinanceRows(rows: SchoolFinanceExportRow[]): SchoolFinanceSummary {
  let totalInstallmentCount = 0;
  let totalDue = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  let overdueCount = 0;
  let contractsWithoutSchedule = 0;

  for (const row of rows) {
    if (row.paymentStatus === 'no_schedule') {
      contractsWithoutSchedule += 1;
      totalDue += row.annualFee;
      unpaidCount += 1;
      continue;
    }
    totalInstallmentCount += 1;
    const amount = Number(row.installmentAmount || 0);
    totalDue += amount;
    if (row.paymentStatus === 'paid') {
      totalPaid += amount;
      paidCount += 1;
    } else {
      unpaidCount += 1;
      if (row.paymentStatus === 'overdue') overdueCount += 1;
    }
  }

  return {
    totalInstallmentCount,
    totalDue,
    totalPaid,
    totalOutstanding: Math.max(0, totalDue - totalPaid),
    paidCount,
    unpaidCount,
    overdueCount,
    contractsWithoutSchedule,
  };
}

export function schoolFinanceTableData(
  rows: SchoolFinanceExportRow[],
  t: (key: string) => string,
): { headers: string[]; body: (string | number)[][] } {
  const headers = [
    t('school.financeColStudent'),
    t('school.financeColParent'),
    t('school.financeColParentEmail'),
    t('school.financeColContract'),
    t('school.financeColSigningStatus'),
    t('school.financeColAnnualFee'),
    t('school.financeColInstallment'),
    t('school.financeColAmount'),
    t('school.financeColDueDate'),
    t('school.financeColStatus'),
    t('school.financeColPaidAt'),
    t('school.financeColMethod'),
  ];

  const body = rows.map((row) => [
    row.studentName,
    row.parentName,
    row.parentEmail,
    row.contractNumber,
    signingStatusLabel(row.contractSigningStatus, t),
    Number(row.annualFee.toFixed(2)),
    row.installmentNumber ?? '',
    row.installmentAmount == null ? '' : Number(row.installmentAmount.toFixed(2)),
    row.dueDate || '',
    paymentStatusLabel(row.paymentStatus, t),
    schoolFinanceDateKey(row.paidAt) || '',
    paymentMethodLabel(row.paymentMethod, t),
  ]);

  return { headers, body };
}

export function schoolFinanceCsv(rows: SchoolFinanceExportRow[], t: (key: string) => string): string {
  const { headers, body } = schoolFinanceTableData(rows, t);
  const lines = body.map((row) => row.map(csvCell).join(','));
  return `\uFEFF${[headers.map(csvCell).join(','), ...lines].join('\r\n')}`;
}

export function downloadSchoolFinanceCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
