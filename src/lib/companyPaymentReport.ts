import { orgStudentIdentityGroupKey, type OrgStudentIdentityRow } from './orgStudentIdentity.js';
import { isSessionActuallyPaid } from './sessionPaymentDisplay.js';

export type PaymentReportType = 'trial' | 'package' | 'lesson' | 'mixed' | 'other';
export type PaymentReportStatus = 'issued' | 'pending' | 'paid' | 'cancelled' | 'refunded';
export type PaymentReportFilters = {
  start: string;
  end: string;
  dateBasis: 'issued' | 'paid';
  type?: PaymentReportType | 'all';
  status?: PaymentReportStatus | 'all';
  tutorId?: string;
  search?: string;
};

export type ReportStudentSource = OrgStudentIdentityRow & {
  payer_name?: string | null;
  payer_phone?: string | null;
  phone?: string | null;
  payment_payer?: string | null;
};
type SubjectRelation = { is_trial?: boolean | null } | { is_trial?: boolean | null }[] | null;
export type ReportSessionSource = {
  id: string; student_id: string; tutor_id: string;
  start_time: string; end_time: string; status: string;
  created_at?: string;
  paid?: boolean | null; payment_status?: string | null;
  price: number | null; is_complimentary?: boolean | null;
  lesson_package_id?: string | null; payment_batch_id?: string | null;
  subjects?: SubjectRelation;
};
export type ReportPackageSource = {
  id: string; student_id: string; tutor_id: string;
  total_lessons: number; total_price: number;
  paid?: boolean | null; payment_status?: string | null;
  paid_at?: string | null; created_at: string;
  manual_sales_invoice_id?: string | null;
  subjects?: SubjectRelation;
  lesson_package_items?: { subjects?: SubjectRelation }[] | null;
};
export type ReportInvoiceSource = {
  id: string; invoice_number: string; issue_date: string; created_at: string;
  total_amount: number; status: string; seller_user_id?: string | null;
  buyer_snapshot?: Record<string, unknown> | null;
  pdf_meta?: Record<string, unknown> | null;
  source_session_id?: string | null; billing_batch_id?: string | null;
  invoice_line_items?: { session_ids?: string[] | null }[] | null;
};
export type ReportBatchSource = {
  id: string; total_amount: number; paid?: boolean | null;
  payment_status?: string | null; paid_at?: string | null;
  created_at: string; payer_name?: string | null; payer_email?: string | null;
};
export type ReportLedgerSource = {
  source_type: string; source_id: string; paid_at: string; currency: string;
  base_amount: number; gross_amount: number;
};
export type PaymentReportStudent = {
  id: string; name: string;
  firstLessonAt: string | null;
  completedLessons: number; cancelledLessons: number; noShowLessons: number;
  trialPaid: boolean; trialPaidAt: string | null;
  firstPackagePurchased: boolean; firstPackagePaidAt: string | null;
};
export type PaymentReportRow = {
  id: string; invoiceId: string | null; invoiceNumber: string | null;
  students: PaymentReportStudent[];
  payerName: string; payerEmail: string; payerPhone: string;
  tutors: { id: string; name: string }[];
  type: PaymentReportType; packageLessons: number | null;
  amount: number; currency: string;
  issueDate: string | null; createdAt: string; paidAt: string | null;
  status: PaymentReportStatus;
};
export type PaymentReportData = { rows: PaymentReportRow[]; generatedAt: string };
const DAY_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Calendar dates use the same business timezone as invoice generation. */
export function paymentReportDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return DAY_FORMATTER.format(date);
}

export function validPaymentReportPeriod(start: string, end: string): boolean {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return (!start || valid(start)) && (!end || valid(end)) && (!start || !end || start <= end);
}

export function filterPaymentReport(rows: PaymentReportRow[], filters: PaymentReportFilters): PaymentReportRow[] {
  if (!validPaymentReportPeriod(filters.start, filters.end)) return [];
  const search = filters.search?.trim().toLocaleLowerCase() || '';
  return rows.filter(row => {
    const day = paymentReportDay(filters.dateBasis === 'paid' ? row.paidAt : row.issueDate || row.createdAt);
    // Unknown payment dates cannot be placed in a payment-date range.
    if (filters.dateBasis === 'paid' && (!day || row.status !== 'paid')) return false;
    if ((filters.start && (!day || day < filters.start)) || (filters.end && (!day || day > filters.end))) return false;
    if (filters.type && filters.type !== 'all' && row.type !== filters.type) return false;
    if (filters.status && filters.status !== 'all' && row.status !== filters.status) return false;
    if (filters.tutorId && !row.tutors.some(tutor => tutor.id === filters.tutorId)) return false;
    if (search && ![row.invoiceNumber, row.payerName, row.payerEmail, row.payerPhone,
      ...row.students.map(student => student.name), ...row.tutors.map(tutor => tutor.name)]
      .join(' ').toLocaleLowerCase().includes(search)) return false;
    return true;
  }).sort((a, b) => String(filters.dateBasis === 'paid' ? b.paidAt : b.issueDate || b.createdAt)
    .localeCompare(String(filters.dateBasis === 'paid' ? a.paidAt : a.issueDate || a.createdAt)) || a.id.localeCompare(b.id));
}

function trial(subjects?: SubjectRelation): boolean {
  return (Array.isArray(subjects) ? subjects[0] : subjects)?.is_trial === true;
}
function packageType(pkg: ReportPackageSource): 'trial' | 'package' {
  const items = pkg.lesson_package_items || [];
  return items.length ? (items.every(item => trial(item.subjects)) ? 'trial' : 'package')
    : trial(pkg.subjects) ? 'trial' : 'package';
}
function paymentStatus(source: { paid?: boolean | null; payment_status?: string | null }): PaymentReportStatus {
  if (source.payment_status === 'cancelled') return 'cancelled';
  if (source.payment_status === 'refunded') return 'refunded';
  return isSessionActuallyPaid(source) ? 'paid' : 'pending';
}
function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function money(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}
function earliest(current: string | null, candidate: string | null | undefined): string | null {
  if (!candidate || !paymentReportDay(candidate)) return current;
  return !current || candidate < current ? candidate : current;
}
function indexMany<T>(rows: T[], key: (row: T) => string | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    if (id) {
      const group = map.get(id);
      if (group) group.push(row);
      else map.set(id, [row]);
    }
  }
  return map;
}

/** One row per invoice or uninvoiced charge; package lessons are never new payments. */
export function buildCompanyPaymentReport(input: {
  students: ReportStudentSource[]; sessions: ReportSessionSource[]; packages: ReportPackageSource[];
  invoices: ReportInvoiceSource[]; batches: ReportBatchSource[]; ledger: ReportLedgerSource[];
  tutors: { id: string; full_name?: string | null }[];
  now?: string;
}): PaymentReportRow[] {
  const studentById = new Map(input.students.map(student => [student.id, student]));
  const tutorById = new Map(input.tutors.map(tutor => [tutor.id, tutor.full_name || '']));
  const sessionById = new Map(input.sessions.map(session => [session.id, session]));
  const packageById = new Map(input.packages.map(pkg => [pkg.id, pkg]));
  const batchById = new Map(input.batches.map(batch => [batch.id, batch]));
  const ledgerBySource = new Map(input.ledger.map(entry => [`${entry.source_type}:${entry.source_id}`, entry]));
  const sessionsByPackage = indexMany(input.sessions, session => session.lesson_package_id);
  const sessionsByBatch = indexMany(input.sessions, session => session.payment_batch_id);
  const packagesByInvoice = indexMany(input.packages, pkg => pkg.manual_sales_invoice_id);
  const customerInvoices = input.invoices.filter(invoice => !invoice.seller_user_id && invoice.pdf_meta?.invoiceKind !== 'tutor_pay');
  const invoiceById = new Map(customerInvoices.map(invoice => [invoice.id, invoice]));
  const stats = new Map<string, PaymentReportStudent>();
  const statsByStudentId = new Map<string, PaymentReportStudent>();
  const now = input.now || new Date().toISOString();
  for (const student of input.students) {
    const key = orgStudentIdentityGroupKey(student);
    let summary = stats.get(key);
    if (!summary) {
      summary = { id: student.id, name: student.full_name || '', firstLessonAt: null,
        completedLessons: 0, cancelledLessons: 0, noShowLessons: 0,
        trialPaid: false, trialPaidAt: null, firstPackagePurchased: false, firstPackagePaidAt: null };
      stats.set(key, summary);
    }
    statsByStudentId.set(student.id, summary);
  }
  const sourcePaidAt = (type: string, id: string, ownDate?: string | null): string | null => {
    const invoice = type === 'package' ? invoiceById.get(packageById.get(id)?.manual_sales_invoice_id || '') : undefined;
    return textValue(invoice?.pdf_meta?.paidAt) || ownDate || ledgerBySource.get(`${type}:${id}`)?.paid_at || null;
  };
  const recordPurchase = (type: 'trial' | 'package', studentIds: string[], paidAt: string | null) => {
    for (const id of new Set(studentIds)) {
      const summary = statsByStudentId.get(id);
      if (!summary) continue;
      if (type === 'trial') {
        summary.trialPaid = true;
        summary.trialPaidAt = earliest(summary.trialPaidAt, paidAt);
      } else {
        summary.firstPackagePurchased = true;
        summary.firstPackagePaidAt = earliest(summary.firstPackagePaidAt, paidAt);
      }
    }
  };
  for (const pkg of input.packages) {
    if (paymentStatus(pkg) !== 'paid' || !(Number(pkg.total_price) > 0)) continue;
    recordPurchase(packageType(pkg), [pkg.student_id, ...(sessionsByPackage.get(pkg.id) || []).map(session => session.student_id)],
      sourcePaidAt('package', pkg.id, pkg.paid_at));
  }
  for (const session of input.sessions) {
    const summary = statsByStudentId.get(session.student_id);
    if (!summary) continue;
    if (session.status !== 'cancelled') summary.firstLessonAt = earliest(summary.firstLessonAt, session.start_time);
    if (session.status === 'completed' && Date.parse(session.end_time) <= Date.parse(now)) summary.completedLessons++;
    if (session.status === 'cancelled') summary.cancelledLessons++;
    if (session.status === 'no_show' && Date.parse(session.end_time) <= Date.parse(now)) summary.noShowLessons++;
    if (!session.lesson_package_id && !session.is_complimentary && trial(session.subjects)
      && paymentStatus(session) === 'paid' && Number(session.price) > 0) {
      recordPurchase('trial', [session.student_id], sourcePaidAt('session', session.id));
    }
  }
  const rows: PaymentReportRow[] = [];
  const claimedSessions = new Set<string>();
  const claimedPackages = new Set<string>();
  const claimedBatches = new Set<string>();
  const makeRow = (args: {
    id: string; invoice?: ReportInvoiceSource; sessions: ReportSessionSource[];
    packages: ReportPackageSource[]; batch?: ReportBatchSource;
    amount: number; currency?: string; paidAt: string | null; status: PaymentReportStatus; createdAt: string;
  }): PaymentReportRow => {
    const { invoice, sessions, packages, batch } = args;
    const studentIds = [...new Set([...sessions.map(session => session.student_id), ...packages.map(pkg => pkg.student_id)])];
    const students = [...new Set(studentIds.map(id => statsByStudentId.get(id)).filter((student): student is PaymentReportStudent => !!student))];
    const sourceStudent = studentById.get(studentIds[0]);
    const isStudentPayer = sourceStudent?.payment_payer === 'student';
    const buyer = invoice?.buyer_snapshot;
    const tutorIds = [...new Set([...sessions.map(session => session.tutor_id), ...packages.map(pkg => pkg.tutor_id)])];
    const kinds = new Set<PaymentReportType>(packages.map(packageType));
    for (const session of sessions) {
      if (!session.lesson_package_id || !packages.some(pkg => pkg.id === session.lesson_package_id)) {
        kinds.add(trial(session.subjects) ? 'trial' : 'lesson');
      }
    }
    return {
      id: args.id, invoiceId: invoice?.id || null, invoiceNumber: invoice?.invoice_number || null,
      students, payerName: textValue(buyer?.name) || batch?.payer_name
        || (isStudentPayer ? sourceStudent?.full_name : sourceStudent?.payer_name) || sourceStudent?.full_name || '',
      payerEmail: textValue(buyer?.email) || batch?.payer_email
        || (isStudentPayer ? sourceStudent?.email : sourceStudent?.payer_email) || sourceStudent?.email || '',
      payerPhone: textValue(buyer?.phone) || textValue(buyer?.contactPhone)
        || (isStudentPayer ? sourceStudent?.phone : sourceStudent?.payer_phone) || '',
      tutors: tutorIds.map(id => ({ id, name: tutorById.get(id) || '' })),
      type: kinds.size > 1 ? 'mixed' : kinds.values().next().value || 'other',
      packageLessons: packages.some(pkg => packageType(pkg) === 'package')
        ? packages.filter(pkg => packageType(pkg) === 'package').reduce((sum, pkg) => sum + Number(pkg.total_lessons), 0) : null,
      amount: money(args.amount), currency: (args.currency || 'EUR').toUpperCase(),
      issueDate: invoice?.issue_date || null, createdAt: args.createdAt, paidAt: args.paidAt, status: args.status,
    };
  };
  for (const invoice of customerInvoices) {
    const ids = new Set((invoice.invoice_line_items || []).flatMap(line => line.session_ids || []));
    if (invoice.source_session_id) ids.add(invoice.source_session_id);
    const meta = invoice.pdf_meta;
    if (typeof meta?.paymentSourceId === 'string') ids.add(meta.paymentSourceId);
    const packages = new Map((packagesByInvoice.get(invoice.id) || []).map(pkg => [pkg.id, pkg]));
    const sessions = new Map<string, ReportSessionSource>();
    const batchId = invoice.billing_batch_id || (meta?.paymentSourceType === 'billing_batch' ? textValue(meta.paymentSourceId) : null);
    const relatedBatches = new Map<string, ReportBatchSource>();
    const explicitBatch = batchById.get(batchId || '');
    if (explicitBatch) relatedBatches.set(explicitBatch.id, explicitBatch);
    for (const id of ids) {
      const pkg = packageById.get(id);
      if (pkg) packages.set(id, pkg);
      const session = sessionById.get(id);
      if (session) {
        sessions.set(id, session);
        const relatedPackage = packageById.get(session.lesson_package_id || '');
        if (relatedPackage) packages.set(relatedPackage.id, relatedPackage);
      }
    }
    for (const pkg of packages.values()) {
      claimedPackages.add(pkg.id);
      for (const session of sessionsByPackage.get(pkg.id) || []) sessions.set(session.id, session);
    }
    if (batchId) {
      claimedBatches.add(batchId);
      for (const session of sessionsByBatch.get(batchId) || []) sessions.set(session.id, session);
    }
    for (const session of sessions.values()) {
      const relatedBatch = batchById.get(session.payment_batch_id || '');
      if (relatedBatch) relatedBatches.set(relatedBatch.id, relatedBatch);
    }
    for (const batch of relatedBatches.values()) {
      claimedBatches.add(batch.id);
      for (const session of sessionsByBatch.get(batch.id) || []) sessions.set(session.id, session);
    }
    for (const id of sessions.keys()) claimedSessions.add(id);
    const sources = [
      ...[...packages.values()].map(pkg => ({ status: paymentStatus(pkg), date: sourcePaidAt('package', pkg.id, pkg.paid_at) })),
      ...[...relatedBatches.values()].map(batch => ({ status: paymentStatus(batch), date: sourcePaidAt('billing_batch', batch.id, batch.paid_at) })),
      ...[...sessions.values()].filter(session => !session.lesson_package_id && !session.payment_batch_id)
        .map(session => ({ status: paymentStatus(session), date: sourcePaidAt('session', session.id) })),
    ];
    const allPaid = sources.length > 0 && sources.every(source => source.status === 'paid');
    const allRefunded = sources.length > 0 && sources.every(source => source.status === 'refunded');
    const allCancelled = sources.length > 0 && sources.every(source => source.status === 'cancelled');
    const status = invoice.status === 'cancelled' || allCancelled ? 'cancelled' : allRefunded ? 'refunded'
      : invoice.status === 'paid' || allPaid ? 'paid' : 'issued';
    const dates = sources.map(source => source.date);
    const paidAt = status !== 'paid' ? null : textValue(meta?.paidAt)
      || (dates.length && dates.every(Boolean) ? (dates as string[]).sort().at(-1)! : null);
    if (status === 'paid' && Number(invoice.total_amount) > 0) {
      for (const pkg of packages.values()) {
        if (!['refunded', 'cancelled'].includes(paymentStatus(pkg))) {
          recordPurchase(packageType(pkg), [pkg.student_id], sourcePaidAt('package', pkg.id, pkg.paid_at) || paidAt);
        }
      }
      for (const session of sessions.values()) {
        if (trial(session.subjects) && !session.is_complimentary && Number(session.price) > 0
          && !['refunded', 'cancelled'].includes(paymentStatus(session))) {
          recordPurchase('trial', [session.student_id], sourcePaidAt('session', session.id) || paidAt);
        }
      }
    }
    rows.push(makeRow({ id: `invoice:${invoice.id}`, invoice, sessions: [...sessions.values()],
      packages: [...packages.values()], batch: relatedBatches.values().next().value, amount: invoice.total_amount,
      currency: textValue(meta?.currency), paidAt, status, createdAt: invoice.created_at }));
  }
  for (const pkg of input.packages) {
    if (claimedPackages.has(pkg.id)) continue;
    const ledger = ledgerBySource.get(`package:${pkg.id}`);
    const status = paymentStatus(pkg);
    rows.push(makeRow({ id: `package:${pkg.id}`, sessions: sessionsByPackage.get(pkg.id) || [], packages: [pkg],
      amount: ledger?.base_amount ?? pkg.total_price, currency: ledger?.currency,
      paidAt: status === 'paid' ? sourcePaidAt('package', pkg.id, pkg.paid_at) : null, status, createdAt: pkg.created_at }));
  }
  for (const batch of input.batches) {
    if (claimedBatches.has(batch.id)) continue;
    const ledger = ledgerBySource.get(`billing_batch:${batch.id}`);
    const status = paymentStatus(batch);
    rows.push(makeRow({ id: `batch:${batch.id}`, sessions: sessionsByBatch.get(batch.id) || [], packages: [], batch,
      amount: ledger?.base_amount ?? batch.total_amount, currency: ledger?.currency,
      paidAt: status === 'paid' ? sourcePaidAt('billing_batch', batch.id, batch.paid_at) : null, status, createdAt: batch.created_at }));
  }
  for (const session of input.sessions) {
    if (claimedSessions.has(session.id) || session.lesson_package_id || session.payment_batch_id
      || session.is_complimentary || !isSessionActuallyPaid(session) || !(Number(session.price) > 0)) continue;
    const ledger = ledgerBySource.get(`session:${session.id}`);
    const status = paymentStatus(session);
    rows.push(makeRow({ id: `session:${session.id}`, sessions: [session], packages: [],
      amount: ledger?.base_amount ?? session.price!, currency: ledger?.currency,
      paidAt: status === 'paid' ? sourcePaidAt('session', session.id) : null, status,
      createdAt: session.created_at || ledger?.paid_at || session.start_time }));
  }
  return rows;
}
