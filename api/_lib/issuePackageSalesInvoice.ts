import type { SupabaseClient } from '@supabase/supabase-js';
import { allocateInvoiceNumber } from './invoiceNumber.js';
import { proKlaseVatExemptionNote } from './proKlaseInvoice.js';

export type PackageRowForSf = {
  id: string;
  tutor_id: string;
  total_price: number | string;
  total_lessons: number;
  paid_at?: string | null;
  payment_method?: string | null;
  manual_sales_invoice_id?: string | null;
  students?: {
    full_name?: string;
    email?: string | null;
    payer_email?: string | null;
    payer_name?: string | null;
  } | null;
  subject?: { name?: string } | null;
  subjects?: { name?: string } | null;
};

/**
 * After Stripe checkout for a prepaid package: issue Lithuanian S.F. if a profile exists.
 * Uses lesson_packages.manual_sales_invoice_id as "linked sales invoice" (Stripe or manual UI).
 */
export async function tryIssueSalesInvoiceForStripePackage(
  supabase: SupabaseClient,
  packageRow: PackageRowForSf
): Promise<void> {
  if (packageRow.manual_sales_invoice_id) return;
  if (packageRow.payment_method !== 'stripe') return;

  const { data: tutor } = await supabase
    .from('profiles')
    .select('id, full_name, organization_id, email, phone')
    .eq('id', packageRow.tutor_id)
    .single();

  if (!tutor) return;

  let invoiceProfile: Record<string, unknown> | null = null;
  let usesOrganizationInvoiceProfile = false;
  if (tutor.organization_id) {
    const { data: orgProf } = await supabase
      .from('invoice_profiles')
      .select('*')
      .eq('organization_id', tutor.organization_id)
      .maybeSingle();
    invoiceProfile = orgProf;
    usesOrganizationInvoiceProfile = Boolean(orgProf);
  }
  if (!invoiceProfile) {
    const { data: userProf } = await supabase.from('invoice_profiles').select('*').eq('user_id', tutor.id).maybeSingle();
    invoiceProfile = userProf;
  }

  if (!invoiceProfile) {
    console.log('[issuePackageSalesInvoice] No invoice profile; skip auto S.F. for package', packageRow.id);
    return;
  }

  const student = packageRow.students;
  const payerName = student?.payer_name || student?.full_name || 'Mokinys';
  const payerEmail = student?.payer_email || student?.email || undefined;
  const buyerSnapshot = { name: payerName, email: payerEmail };

  const entityType = String(invoiceProfile.entity_type || '');
  const isCompany = ['mb', 'uab', 'ii'].includes(entityType);
  const businessName = (invoiceProfile.business_name as string) || undefined;
  const fullName = typeof tutor.full_name === 'string' ? tutor.full_name.trim() : '';
  const sellerName = isCompany
    ? (businessName || '').trim() || fullName || 'Įmonė'
    : fullName || (businessName || '').trim() || 'Korepetitorius';
  const sellerTaxExemptionNote = proKlaseVatExemptionNote(
    tutor.organization_id,
    usesOrganizationInvoiceProfile,
  );

  const sellerSnapshot = {
    name: sellerName || 'Korepetitorius',
    entityType,
    companyCode: (invoiceProfile.company_code as string) || undefined,
    vatCode: (invoiceProfile.vat_code as string) || undefined,
    address: (invoiceProfile.address as string) || undefined,
    activityNumber: (invoiceProfile.activity_number as string) || undefined,
    personalCode: (invoiceProfile.personal_code as string) || undefined,
    contactEmail: (invoiceProfile.contact_email as string) || undefined,
    contactPhone: (invoiceProfile.contact_phone as string) || undefined,
    ...(sellerTaxExemptionNote ? { taxExemptionNote: sellerTaxExemptionNote } : {}),
  };

  // Look up per-subject items so we can emit one invoice line per subject.
  const { data: itemsRaw } = await supabase
    .from('lesson_package_items')
    .select('subject_id, total_lessons, total_price, position, subjects!inner(name)')
    .eq('package_id', packageRow.id)
    .order('position', { ascending: true });
  type InvoiceItem = { subjectName: string; totalLessons: number; totalPrice: number };
  let invoiceItems: InvoiceItem[] = (itemsRaw || []).map((row: any) => ({
    subjectName: (row.subjects?.name as string) || 'Pamoka',
    totalLessons: Number(row.total_lessons) || 0,
    totalPrice: Number(row.total_price) || 0,
  }));

  // Legacy fallback: package row without items still gets one line from the
  // denormalized fields. After backfill this branch should never run.
  if (invoiceItems.length === 0) {
    const fallback = packageRow.subject || packageRow.subjects || null;
    const subjectName = fallback?.name || 'Pamoka';
    invoiceItems = [{
      subjectName,
      totalLessons: Number(packageRow.total_lessons) || 0,
      totalPrice: Number(packageRow.total_price) || 0,
    }];
  }

  const totalAmount = Number(packageRow.total_price) || 0;
  if (totalAmount <= 0) return;

  const issueDate = new Date().toISOString().slice(0, 10);
  const paidDay = packageRow.paid_at ? packageRow.paid_at.slice(0, 10) : issueDate;

  const invoiceNumber = await allocateInvoiceNumber(supabase, invoiceProfile.id as string);

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      issued_by_user_id: tutor.id,
      organization_id: tutor.organization_id ?? null,
      seller_snapshot: sellerSnapshot,
      buyer_snapshot: buyerSnapshot,
      issue_date: issueDate,
      period_start: paidDay,
      period_end: paidDay,
      grouping_type: 'single',
      subtotal: totalAmount,
      total_amount: totalAmount,
      status: 'issued',
      billing_batch_id: null,
    })
    .select('id')
    .single();

  if (invErr || !invoice) {
    console.error('[issuePackageSalesInvoice] Failed to insert invoice:', invErr);
    return;
  }

  const lineRows = invoiceItems.map((it) => ({
    invoice_id: invoice.id,
    description: `${it.subjectName} — pamokų paketas (${it.totalLessons} pam.)`,
    quantity: 1,
    unit_price: it.totalPrice,
    total_price: it.totalPrice,
    session_ids: [],
  }));
  await supabase.from('invoice_line_items').insert(lineRows);

  const { error: linkErr } = await supabase
    .from('lesson_packages')
    .update({ manual_sales_invoice_id: invoice.id })
    .eq('id', packageRow.id)
    .is('manual_sales_invoice_id', null);

  if (linkErr) {
    console.error('[issuePackageSalesInvoice] Invoice created but failed to link package:', linkErr);
  } else {
    console.log(`[issuePackageSalesInvoice] Auto S.F. ${invoiceNumber} for Stripe package ${packageRow.id}`);
  }
}
