import { supabase } from '@/lib/supabase';

export type BatchStudentSlice = {
  lesson_count: number;
  student_amount: number;
  batch_total_amount: number;
  is_shared_batch: boolean;
};

export type BatchSalesInvoiceLink = {
  sales_invoice_id: string;
  invoice_number: string | null;
  pdf_storage_path: string | null;
};

export type BillingBatchRow = {
  id: string;
  sent_at: string;
  paid?: boolean | null;
  payment_status?: string | null;
  total_amount?: number | null;
  payment_deadline_date: string;
  payer_name?: string | null;
  payer_email?: string | null;
};

const sliceKey = (batchId: string, studentId: string) => `${batchId}:${studentId}`;

/** Sum session prices for one student inside a batch (in-memory, from preloaded rows). */
export function computeSliceFromBatchSessions(
  batchId: string,
  studentId: string,
  batchTotalAmount: number,
  entries: Array<{ session_id: string; session_price: number; student_id: string }>,
  studentsInBatch: Set<string>,
): BatchStudentSlice {
  const mine = entries.filter((e) => e.student_id === studentId);
  const student_amount = mine.reduce((sum, e) => sum + (Number(e.session_price) || 0), 0);
  const lesson_count = mine.length;
  const is_shared_batch =
    studentsInBatch.size > 1 ||
    (batchTotalAmount > 0 && Math.abs(student_amount - batchTotalAmount) > 0.009);

  return {
    lesson_count,
    student_amount,
    batch_total_amount: batchTotalAmount,
    is_shared_batch,
  };
}

/**
 * Load per-student slices for many billing batches (tutor student list / modal).
 */
export async function loadBatchStudentSlices(
  batchIds: string[],
  tutorId: string,
): Promise<{
  slices: Map<string, BatchStudentSlice>;
  salesInvoiceByBatch: Map<string, BatchSalesInvoiceLink>;
}> {
  const slices = new Map<string, BatchStudentSlice>();
  const salesInvoiceByBatch = new Map<string, BatchSalesInvoiceLink>();

  if (!batchIds.length) {
    return { slices, salesInvoiceByBatch };
  }

  const { data: batches } = await supabase
    .from('billing_batches')
    .select('id, total_amount')
    .in('id', batchIds);

  const batchTotalById = new Map(
    (batches ?? []).map((b: { id: string; total_amount?: number | null }) => [
      b.id,
      Number(b.total_amount || 0),
    ]),
  );

  const { data: batchSessions } = await supabase
    .from('billing_batch_sessions')
    .select('billing_batch_id, session_id, session_price')
    .in('billing_batch_id', batchIds);

  const sessionIds = [
    ...new Set(
      (batchSessions ?? [])
        .map((bs: { session_id?: string }) => bs.session_id)
        .filter(Boolean) as string[],
    ),
  ];

  const studentBySessionId = new Map<string, string>();
  const priceBySessionId = new Map<string, number>();

  (batchSessions ?? []).forEach(
    (bs: { session_id?: string; session_price?: number }) => {
      if (bs.session_id) priceBySessionId.set(bs.session_id, Number(bs.session_price) || 0);
    },
  );

  if (sessionIds.length) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, student_id, price, payment_batch_id')
      .eq('tutor_id', tutorId)
      .in('id', sessionIds);

    (sessions ?? []).forEach((s: { id?: string; student_id?: string; price?: number }) => {
      if (s.id && s.student_id) studentBySessionId.set(s.id, s.student_id);
      if (s.id && !priceBySessionId.has(s.id)) {
        priceBySessionId.set(s.id, Number(s.price) || 0);
      }
    });
  }

  const { data: sessionsWithBatch } = await supabase
    .from('sessions')
    .select('id, student_id, price, payment_batch_id')
    .eq('tutor_id', tutorId)
    .in('payment_batch_id', batchIds);

  const entriesByBatch = new Map<string, Array<{ session_id: string; session_price: number; student_id: string }>>();
  const studentsByBatch = new Map<string, Set<string>>();

  const addEntry = (batchId: string, sessionId: string) => {
    const studentId = studentBySessionId.get(sessionId);
    if (!studentId) return;
    if (!entriesByBatch.has(batchId)) entriesByBatch.set(batchId, []);
    if (!studentsByBatch.has(batchId)) studentsByBatch.set(batchId, new Set());
    const list = entriesByBatch.get(batchId)!;
    if (list.some((e) => e.session_id === sessionId)) return;
    list.push({
      session_id: sessionId,
      session_price: priceBySessionId.get(sessionId) ?? 0,
      student_id: studentId,
    });
    studentsByBatch.get(batchId)!.add(studentId);
  };

  (batchSessions ?? []).forEach(
    (bs: { billing_batch_id?: string; session_id?: string }) => {
      if (bs.billing_batch_id && bs.session_id) addEntry(bs.billing_batch_id, bs.session_id);
    },
  );

  (sessionsWithBatch ?? []).forEach(
    (s: { id?: string; payment_batch_id?: string; student_id?: string; price?: number | null }) => {
      if (s.payment_batch_id && s.id && s.student_id) {
        studentBySessionId.set(s.id, s.student_id);
        if (!priceBySessionId.has(s.id)) priceBySessionId.set(s.id, Number(s.price) || 0);
        addEntry(s.payment_batch_id, s.id);
      }
    },
  );

  for (const batchId of batchIds) {
    const batchTotal = batchTotalById.get(batchId) ?? 0;
    const entries = entriesByBatch.get(batchId) ?? [];
    const studentsInBatch = studentsByBatch.get(batchId) ?? new Set<string>();
    for (const studentId of studentsInBatch) {
      slices.set(
        sliceKey(batchId, studentId),
        computeSliceFromBatchSessions(batchId, studentId, batchTotal, entries, studentsInBatch),
      );
    }
  }

  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, invoice_number, pdf_storage_path, billing_batch_id')
    .in('billing_batch_id', batchIds);

  (invoiceRows ?? []).forEach(
    (inv: {
      id: string;
      invoice_number?: string | null;
      pdf_storage_path?: string | null;
      billing_batch_id?: string | null;
    }) => {
      if (!inv.billing_batch_id) return;
      salesInvoiceByBatch.set(inv.billing_batch_id, {
        sales_invoice_id: inv.id,
        invoice_number: inv.invoice_number ?? null,
        pdf_storage_path: inv.pdf_storage_path ?? null,
      });
    },
  );

  return { slices, salesInvoiceByBatch };
}

/** Slice for one batch + student (modal refresh / polling). */
export async function fetchBatchStudentSlice(
  batchId: string,
  studentId: string,
  tutorId: string,
): Promise<{ slice: BatchStudentSlice | null; salesInvoice: BatchSalesInvoiceLink | null }> {
  const { slices, salesInvoiceByBatch } = await loadBatchStudentSlices([batchId], tutorId);
  return {
    slice: slices.get(sliceKey(batchId, studentId)) ?? null,
    salesInvoice: salesInvoiceByBatch.get(batchId) ?? null,
  };
}

export function batchSliceLookup(
  slices: Map<string, BatchStudentSlice>,
  batchId: string,
  studentId: string,
): BatchStudentSlice | undefined {
  return slices.get(sliceKey(batchId, studentId));
}

export type StudentLatestInvoiceFields = {
  id: string;
  sent_at: string;
  paid: boolean;
  payment_status: string;
  total_amount: number;
  payment_deadline_date: string;
  payer_name?: string | null;
  payer_email?: string | null;
  lesson_count: number;
  batch_total_amount: number;
  is_shared_batch: boolean;
  sales_invoice_id?: string | null;
  invoice_number?: string | null;
  pdf_storage_path?: string | null;
};

export function mergeBatchIntoStudentInvoice(
  batch: BillingBatchRow,
  studentId: string,
  slices: Map<string, BatchStudentSlice>,
  salesInvoiceByBatch: Map<string, BatchSalesInvoiceLink>,
): StudentLatestInvoiceFields | null {
  const slice = batchSliceLookup(slices, batch.id, studentId);
  if (!slice || slice.lesson_count === 0) return null;

  const sales = salesInvoiceByBatch.get(batch.id);
  const batchTotal = Number(batch.total_amount || 0);

  return {
    id: batch.id,
    sent_at: batch.sent_at,
    paid: !!(batch.paid || batch.payment_status === 'paid'),
    payment_status: batch.payment_status || 'pending',
    total_amount: slice.student_amount,
    payment_deadline_date: batch.payment_deadline_date,
    payer_name: batch.payer_name ?? null,
    payer_email: batch.payer_email ?? null,
    lesson_count: slice.lesson_count,
    batch_total_amount: slice.batch_total_amount || batchTotal,
    is_shared_batch: slice.is_shared_batch,
    sales_invoice_id: sales?.sales_invoice_id ?? null,
    invoice_number: sales?.invoice_number ?? null,
    pdf_storage_path: sales?.pdf_storage_path ?? null,
  };
}

/** Parent portal: prorate invoice display when filtered to one child. */
export type InvoiceChildDisplay = {
  display_amount: number;
  lesson_count: number;
  is_shared: boolean;
  invoice_total_amount: number;
};

export function computeInvoiceDisplayForChild(
  invoiceTotal: number,
  lineItems: Array<{ total_price?: number | null; quantity?: number | null; session_ids?: string[] | null }>,
  childSessionIdSet: Set<string>,
): InvoiceChildDisplay {
  let display_amount = 0;
  let lesson_count = 0;

  for (const li of lineItems) {
    const ids = (li.session_ids ?? []).filter(Boolean) as string[];
    const overlapping = ids.filter((id) => childSessionIdSet.has(id));
    if (!overlapping.length) continue;
    const lineTotal = Number(li.total_price ?? 0);
    if (ids.length === overlapping.length) {
      display_amount += lineTotal;
      lesson_count += Number(li.quantity ?? overlapping.length) || overlapping.length;
    } else {
      const perSession = lineTotal / ids.length;
      display_amount += perSession * overlapping.length;
      lesson_count += overlapping.length;
    }
  }

  if (lesson_count === 0) {
    return {
      display_amount: invoiceTotal,
      lesson_count: 0,
      is_shared: false,
      invoice_total_amount: invoiceTotal,
    };
  }

  const is_shared = Math.abs(display_amount - invoiceTotal) > 0.009;
  return {
    display_amount,
    lesson_count,
    is_shared,
    invoice_total_amount: invoiceTotal,
  };
}
