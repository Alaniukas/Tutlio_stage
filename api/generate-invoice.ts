import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { resolveInvoiceBranding } from './_lib/invoiceBranding.js';
import { generateInvoicePdf, type InvoicePdfData } from './_lib/invoicePdf.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import {
  buildClassicLtTutorPdfMeta,
  CLASSIC_LT_TUTOR_LAYOUT,
  isManoKorepetitoriusTutorInvoice,
} from './_lib/manoKorepetitoriusInvoice.js';
import { proKlaseSessionPayEur } from './_lib/proKlaseTutorPay.js';
import {
  orgTutorLessonPayEur,
  orgTutorSessionPayEur,
} from '../src/lib/orgTutorLessonPay.js';
import { proKlaseVatExemptionNote } from './_lib/proKlaseInvoice.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { allocateInvoiceNumber, formatInvoiceSeriesHeading } from './_lib/invoiceNumber.js';
import {
  buildPvmPdfMeta,
  groupSessionsByStudent,
  orgHasPvmEducationInvoice,
} from './_lib/pvmEducationInvoice.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type GroupingType = 'per_payment' | 'per_week' | 'single';

interface GenerateInvoiceBody {
  periodStart: string;
  periodEnd: string;
  groupingType: GroupingType;
  studentId?: string;
  tutorId?: string;
  isOrgTutor?: boolean;
  onlyPaid?: boolean;
  sessionIds?: string[];
  /** Manual org payment: prepaid packages invoiced as one line (paid_at), not per session */
  packageIds?: string[];
  /** Validate only, do not create invoice */
  precheckOnly?: boolean;
  /**
   * Server-to-server only: unpaid Stripe checkout packages (e.g. attach S.F. to payment email).
   * Ignored unless verifyRequestAuth is internal (x-internal-key).
   */
  allowPendingStripePackages?: boolean;
  /** Who issues the invoice on internal calls (org admin or tutor JWT subject). Required with internal auth unless tutorId alone is enough for your flow. */
  issuedByUserId?: string;
  /** Link invoice to a monthly billing batch (payer invoice email). */
  billingBatchId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body as GenerateInvoiceBody;
  const { periodStart, periodEnd, groupingType, studentId, isOrgTutor, onlyPaid, precheckOnly } = body;

  let issuingUserId: string;
  if (auth.isInternal) {
    issuingUserId = (body.issuedByUserId || body.tutorId || '').trim();
    if (!issuingUserId) {
      return res.status(400).json({ error: 'issuedByUserId or tutorId required for internal invoice calls' });
    }
  } else {
    if (!auth.userId) return res.status(400).json({ error: 'User context required' });
    issuingUserId = auth.userId;
  }

  const allowPendingStripePackages = !!(auth.isInternal && body.allowPendingStripePackages);

  if (!periodStart || !periodEnd || !groupingType) {
    return res.status(400).json({ error: 'Missing required fields: periodStart, periodEnd, groupingType' });
  }

  if (!['per_payment', 'per_week', 'single'].includes(groupingType)) {
    return res.status(400).json({ error: 'Invalid groupingType' });
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) return res.status(400).json({ error: 'End date must be after start date' });
  if (daysDiff > 90) return res.status(400).json({ error: 'Period cannot exceed 90 days' });

  try {
    const tutorId = body.tutorId || issuingUserId;
    const resolvedPackageIds: string[] = body.packageIds?.length ? [...new Set(body.packageIds)] : [];

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, organization_id, company_commission_percent, company_commission_by_subject')
      .eq('id', tutorId)
      .single();

    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    if (!auth.isInternal) {
      const access = await getOrgAdminAccessByUserId(supabase, issuingUserId);
      if (access) {
        if (
          !hasOrgAdminPermission(access.role, access.permissions, 'finance.edit')
          || access.organizationId !== profile.organization_id
        ) {
          return res.status(403).json({ error: 'Insufficient organization permission' });
        }
      } else {
        const { data: inactiveSeat } = await supabase
          .from('organization_admins')
          .select('id')
          .eq('user_id', issuingUserId)
          .maybeSingle();
        if (inactiveSeat) return res.status(403).json({ error: 'Organization access is inactive' });
        if (tutorId !== issuingUserId) {
          return res.status(403).json({ error: 'Tutors can only generate their own invoices' });
        }
      }
    }

    // Org feature invoice_detailed_line_items: line items carry the child's
    // name, per-subject quantity and the lesson dates. Org→payer invoices only
    // (the tutor→company product keeps its own format).
    let detailedLineItems = false;
    let pvmEducationInvoice = false;
    if (!isOrgTutor && profile.organization_id) {
      const { data: orgFeatRow } = await supabase
        .from('organizations')
        .select('features')
        .eq('id', profile.organization_id)
        .maybeSingle();
      const feat = (orgFeatRow as { features?: Record<string, unknown> | null } | null)?.features;
      detailedLineItems =
        !!feat && typeof feat === 'object' && !Array.isArray(feat) && feat.invoice_detailed_line_items === true;
      pvmEducationInvoice = orgHasPvmEducationInvoice(feat);
    }

    // Fetch seller invoice profile
    // When isOrgTutor, the tutor is the seller (billing the org), so use tutorId
    const sellerUserId = isOrgTutor ? tutorId : issuingUserId;
    let sellerProfile = await getSellerProfile(sellerUserId, profile.organization_id, isOrgTutor);

    // Fallback: build a minimal seller profile from tutor's profile when no invoice_profiles entry exists
    if (!sellerProfile) {
      sellerProfile = {
        id: `fallback-${sellerUserId}`,
        user_id: sellerUserId,
        entity_type: 'individual',
        business_name: profile.full_name || 'Korepetitorius',
        company_code: null,
        vat_code: null,
        address: null,
        activity_number: null,
        personal_code: null,
        contact_email: profile.email || null,
        contact_phone: profile.phone || null,
        invoice_series: 'SF',
        next_invoice_number: null,
      };
      console.log('[generate-invoice] No invoice_profiles entry found, using fallback seller from profile:', profile.full_name);
    }

    const sessionSelect = `
        id, tutor_id, price, start_time, subject_id, student_id, status, is_complimentary,
        students!inner(id, full_name, email, payer_email, payer_name, payer_phone, grade),
        subjects(name, is_trial)
      `;

    let sessions: any[] = [];
    let sessErr: any = null;

    const hasSessionIds = !!(body.sessionIds && body.sessionIds.length > 0);
    const hasPackageIds = resolvedPackageIds.length > 0;

    if (hasSessionIds) {
      let sessionQuery = supabase
        .from('sessions')
        .select(sessionSelect)
        .in('id', body.sessionIds!)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });
      if (!(pvmEducationInvoice && !isOrgTutor)) {
        sessionQuery = sessionQuery.eq('tutor_id', tutorId);
      }
      const result = await sessionQuery;
      sessions = result.data || [];
      sessErr = result.error;
      if (pvmEducationInvoice && !isOrgTutor && profile.organization_id && sessions.length) {
        const { data: orgTutors } = await supabase
          .from('profiles')
          .select('id')
          .eq('organization_id', profile.organization_id);
        const allowed = new Set((orgTutors || []).map((r: { id: string }) => r.id));
        sessions = sessions.filter((s: any) => allowed.has(s.tutor_id));
      }
    } else if (!hasPackageIds) {
      let query = supabase
        .from('sessions')
        .select(sessionSelect)
        .eq('tutor_id', tutorId)
        .neq('status', 'cancelled')
        .gte('start_time', periodStart + 'T00:00:00')
        .lte('start_time', periodEnd + 'T23:59:59')
        .lte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      if (studentId) {
        query = query.eq('student_id', studentId);
      }

      if (onlyPaid) {
        query = query.eq('paid', true);
      }

      if (isOrgTutor && isProKlaseOrg(profile.organization_id)) {
        query = query.in('status', ['completed', 'no_show']);
      }

      const result = await query;
      sessions = result.data || [];
      sessErr = result.error;
    }

    if (hasPackageIds) {
      // Fetch the package shells (and items) so multi-subject packages can emit
      // one invoice line per subject. Each pseudo-session below represents a
      // single (package, item) pair.
      const baseSelect = `
          id, tutor_id, student_id, subject_id, total_price, total_lessons, paid_at, created_at,
          paid, payment_method, manual_sales_invoice_id,
          students!inner(id, full_name, email, payer_email, payer_name, payer_phone, grade),
          subjects(name),
          lesson_package_items(subject_id, total_lessons, total_price, position, subjects!inner(name))
        `;

      let paidPkgQuery = allowPendingStripePackages
        ? null
        : supabase
            .from('lesson_packages')
            .select(baseSelect)
            .in('id', resolvedPackageIds)
            .eq('tutor_id', tutorId)
            .eq('paid', true)
            .in('payment_method', ['manual', 'stripe'])
            .is('manual_sales_invoice_id', null);
      if (paidPkgQuery && studentId) paidPkgQuery = paidPkgQuery.eq('student_id', studentId);

      const { data: paidPkgs, error: paidPkgErr } = paidPkgQuery
        ? await paidPkgQuery
        : { data: [] as any[], error: null };

      if (paidPkgErr) {
        return res.status(500).json({ error: paidPkgErr.message });
      }

      let pendingPkgs: any[] = [];
      if (allowPendingStripePackages) {
        let pendQ = supabase
          .from('lesson_packages')
          .select(baseSelect)
          .in('id', resolvedPackageIds)
          .eq('tutor_id', tutorId)
          .eq('paid', false)
          .in('payment_method', ['stripe', 'manual'])
          .is('manual_sales_invoice_id', null);
        if (studentId) pendQ = pendQ.eq('student_id', studentId);
        const { data: pend, error: pendErr } = await pendQ;

        if (pendErr) {
          return res.status(500).json({ error: pendErr.message });
        }
        pendingPkgs = pend || [];
      }

      const pkgs = [...(paidPkgs || []), ...pendingPkgs];

      const requested = new Set(resolvedPackageIds);
      const matchedPackageIds = new Set<string>();
      const pseudoSessions: any[] = [];
      for (const pkg of pkgs) {
        if (!requested.has(pkg.id)) continue;
        matchedPackageIds.add(pkg.id);
        const when = pkg.paid_at || pkg.created_at || new Date().toISOString();
        const isPaid = !!pkg.paid;
        const itemsRaw = Array.isArray(pkg.lesson_package_items) ? pkg.lesson_package_items : [];
        const items = itemsRaw.length > 0
          ? itemsRaw
              .slice()
              .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
              .map((it: any) => ({
                subjectId: (it.subject_id as string | null) ?? null,
                subjectName: (it.subjects?.name as string) || (pkg.subjects?.name as string) || 'Pamoka',
                totalLessons: Number(it.total_lessons) || 0,
                totalPrice: Number(it.total_price) || 0,
              }))
          : [{
              subjectId: (pkg.subject_id as string | null) ?? null,
              subjectName: (pkg.subjects?.name as string) || 'Pamoka',
              totalLessons: Number(pkg.total_lessons) || 0,
              totalPrice: Number(pkg.total_price) || 0,
            }];
        items.forEach((it: { subjectId: string | null; subjectName: string; totalLessons: number; totalPrice: number }, idx: number) => {
          pseudoSessions.push({
            id: `${pkg.id}::${idx}`,
            tutor_id: pkg.tutor_id,
            student_id: pkg.student_id,
            subject_id: it.subjectId ?? pkg.subject_id,
            start_time: when,
            price: it.totalPrice,
            students: pkg.students,
            subjects: { name: it.subjectName },
            payment_status: isPaid ? 'paid' : 'pending',
            total_lessons: it.totalLessons,
            __fromPackage: true,
            __packageId: pkg.id,
          });
        });
      }

      // Detailed invoices enumerate the package's lesson dates: sessions linked
      // to the package (booked/materialized against its credits), per subject.
      if (detailedLineItems && matchedPackageIds.size > 0) {
        const { data: linkedRows } = await supabase
          .from('sessions')
          .select('lesson_package_id, subject_id, start_time, status')
          .in('lesson_package_id', [...matchedPackageIds])
          .neq('status', 'cancelled');
        const fmtMd = (iso: string) => {
          const d = new Date(iso);
          return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const datesByPkgSubject = new Map<string, string[]>();
        for (const row of linkedRows || []) {
          const key = `${row.lesson_package_id}|${row.subject_id ?? ''}`;
          const arr = datesByPkgSubject.get(key) ?? [];
          arr.push(fmtMd(row.start_time));
          datesByPkgSubject.set(key, arr);
        }
        for (const ps of pseudoSessions) {
          const dates =
            datesByPkgSubject.get(`${ps.__packageId}|${ps.subject_id ?? ''}`) ??
            datesByPkgSubject.get(`${ps.__packageId}|`) ??
            [];
          ps.__lessonDates = dates.slice().sort();
        }
      }

      if (matchedPackageIds.size < requested.size) {
        return res.status(400).json({
          error: allowPendingStripePackages
            ? 'One or more packages are not eligible (must be unpaid Stripe/manual package, not already on a sales invoice).'
            : 'One or more packages are not eligible (must be manual or Stripe, paid, not already on a sales invoice).',
        });
      }

      sessions = [...sessions, ...pseudoSessions];
    }

    if (sessErr) return res.status(500).json({ error: sessErr.message });
    if (!isOrgTutor) {
      sessions = sessions.filter((s: any) => s.__fromPackage || s.is_complimentary !== true);
    }
    if (!sessions.length) {
      if (precheckOnly) {
        return res.status(200).json({ canGenerate: false, reason: 'no_sessions' });
      }
      return res.status(400).json({ error: 'No sessions found in the selected period' });
    }

    // Server-side duplicate protection for org-tutor/company invoices:
    // if any session in this candidate set is already included in a non-cancelled
    // invoice for the same period/org, do not allow issuing again.
    if (profile.organization_id && (isOrgTutor || pvmEducationInvoice)) {
      const candidateSessionIds = new Set(
        sessions
          .filter((s: any) => !s.__fromPackage)
          .map((s: any) => s.id)
          .filter(Boolean),
      );
      if (candidateSessionIds.size > 0) {
        const { data: existingInvoices } = await supabase
          .from('invoices')
          .select('id, invoice_number, total_amount')
          .eq('organization_id', profile.organization_id)
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .neq('status', 'cancelled');

        const existingInvoiceIds = (existingInvoices || []).map((inv: any) => inv.id);
        if (existingInvoiceIds.length > 0) {
          const { data: lineItems } = await supabase
            .from('invoice_line_items')
            .select('invoice_id, session_ids')
            .in('invoice_id', existingInvoiceIds);

          const duplicateInvoiceIds = new Set<string>();
          for (const li of lineItems || []) {
            const sessionIds = Array.isArray((li as any).session_ids) ? (li as any).session_ids : [];
            if (sessionIds.some((sid: string) => candidateSessionIds.has(sid))) {
              duplicateInvoiceIds.add((li as any).invoice_id);
            }
          }

          if (duplicateInvoiceIds.size > 0) {
            const dupInvoices = (existingInvoices || []).filter((inv: any) => duplicateInvoiceIds.has(inv.id));
            const nums = dupInvoices.map((inv: any) => inv.invoice_number).filter(Boolean).join(', ');
            const total = dupInvoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0);
            if (precheckOnly) {
              return res.status(200).json({
                canGenerate: false,
                reason: 'duplicate',
                invoiceNumbers: dupInvoices.map((inv: any) => inv.invoice_number).filter(Boolean),
                totalAmount: total,
                error: `Invoice already issued for this tutor/period (${nums || 'existing invoice'}), total €${total.toFixed(2)}`,
              });
            }
            return res.status(409).json({
              error: `Invoice already issued for this tutor/period (${nums || 'existing invoice'}), total €${total.toFixed(2)}`,
            });
          }
        }
      }
    }

    if (precheckOnly) {
      return res.status(200).json({ canGenerate: true, reason: 'ok', candidateCount: sessions.length });
    }

    // Two org flows (see getSellerProfile):
    // 1) Org admin → student/payer invoices: seller = org invoice profile, buyer = payer (Stripe etc.) — isOrgTutor false.
    // 2) Org tutor → company (hourly/commission): seller = tutor invoice profile, buyer = org — isOrgTutor true.
    let organizationAsBuyer: InvoicePdfData['buyer'] | null = null;
    if (isOrgTutor && profile.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name, email')
        .eq('id', profile.organization_id)
        .single();

      const { data: orgInvProfile } = await supabase
        .from('invoice_profiles')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

      organizationAsBuyer = {
        name: orgInvProfile?.business_name || org?.name || 'Organization',
        companyCode: orgInvProfile?.company_code || undefined,
        vatCode: orgInvProfile?.vat_code || undefined,
        address: orgInvProfile?.address || undefined,
        email: orgInvProfile?.contact_email || org?.email || undefined,
        phone: orgInvProfile?.contact_phone || undefined,
      };
    }

    // Build seller snapshot
    const sellerTaxExemptionNote = proKlaseVatExemptionNote(
      profile.organization_id,
      !isOrgTutor,
    );
    const sellerSnapshot = {
      ...buildSellerSnapshot(sellerProfile, profile),
      ...(sellerTaxExemptionNote ? { taxExemptionNote: sellerTaxExemptionNote } : {}),
    };

    sessions.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // Group sessions and create invoices
    const groups = pvmEducationInvoice && !isOrgTutor
      ? groupSessionsByStudent(sessions).map((sess, i) => ({ key: `student-${i}`, sessions: sess }))
      : groupSessions(sessions, groupingType);
    const createdInvoices: string[] = [];

    for (const group of groups) {
      const orgTutorRateEur = isOrgTutor ? Number((profile as any)?.company_commission_percent) || 0 : null;
      const proKlasePay = isOrgTutor && isProKlaseOrg(profile.organization_id);
      const lessonPayEur = (s: { status?: string; price?: number | null; subject_id?: string | null; subjects?: unknown }) =>
        proKlasePay
          ? proKlaseSessionPayEur(
              { status: String(s.status || ''), price: s.price, subjects: s.subjects as { is_trial?: boolean | null } | null },
              orgTutorRateEur,
            )
          : orgTutorSessionPayEur({
              organizationId: profile.organization_id,
              defaultRate: orgTutorRateEur,
              bySubject: (profile as any)?.company_commission_by_subject,
              subjectId: s.subject_id,
              sessionPrice: s.price,
            });
      let lineItems = buildLineItems(group.sessions, groupingType, {
        orgTutorRateEur,
        detailed: detailedLineItems,
        proKlasePay,
        lessonPayEur: orgTutorRateEur != null ? lessonPayEur : undefined,
      });

      if (proKlasePay && isOrgTutor) {
        const { data: adjustments } = await supabase
          .from('tutor_adjustments')
          .select('id, amount_eur, type, reason, created_at')
          .eq('tutor_id', tutorId)
          .eq('organization_id', profile.organization_id)
          .gte('created_at', periodStart + 'T00:00:00')
          .lte('created_at', periodEnd + 'T23:59:59');
        for (const adj of adjustments || []) {
          const amt = Number((adj as any).amount_eur) || 0;
          if (amt === 0) continue;
          const label =
            (adj as any).type === 'penalty_tutor_no_show'
              ? 'Bauda: korepetitorius neatvyko'
              : (adj as any).type === 'penalty_missing_report'
                ? 'Bauda: nėra ataskaitos'
                : (adj as any).reason || 'Koregavimas';
          lineItems.push({
            description: label,
            quantity: 1,
            unitPrice: amt,
            totalPrice: amt,
            sessionIds: [],
          });
        }
      }

      const totalAmount = lineItems.reduce((sum, li) => sum + li.totalPrice, 0);

      const buyer = organizationAsBuyer ?? buildBuyerFromSessions(group.sessions);

      const studentRow = group.sessions[0]?.students as { full_name?: string; grade?: string } | undefined;
      const manoTutorInvoice = isManoKorepetitoriusTutorInvoice(isOrgTutor, profile.organization_id);
      const pdfMeta = pvmEducationInvoice && !isOrgTutor
        ? buildPvmPdfMeta(studentRow?.full_name || '', studentRow?.grade, group.sessions)
        : manoTutorInvoice
          ? buildClassicLtTutorPdfMeta({
              sessions: group.sessions,
              issuedByName: sellerSnapshot.name,
              lessonPayEur: (s) => lessonPayEur(s as any),
            })
          : null;

      const invoiceNumber = await allocateInvoiceNumber(supabase, sellerProfile.id);

      // Tag with the billing tutor's org so company /invoices lists and RLS org policies match.
      // (Org admin issues with their user id as issued_by_user_id but tutorId = billed tutor.)
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          issued_by_user_id: issuingUserId,
          organization_id: profile.organization_id ?? null,
          seller_snapshot: sellerSnapshot,
          buyer_snapshot: buyer,
          issue_date: new Date().toISOString().slice(0, 10),
          period_start: periodStart,
          period_end: periodEnd,
          grouping_type: groupingType,
          subtotal: totalAmount,
          total_amount: totalAmount,
          status: 'issued',
          origin: 'generated',
          pdf_meta: pdfMeta,
          ...(body.billingBatchId ? { billing_batch_id: body.billingBatchId } : {}),
        })
        .select('id')
        .single();

      if (invErr || !invoice) {
        console.error('[generate-invoice] Error creating invoice:', invErr);
        continue;
      }

      // Insert line items
      const lineItemInserts = lineItems.map(li => ({
        invoice_id: invoice.id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        total_price: li.totalPrice,
        session_ids: li.sessionIds,
      }));

      const { error: liInsertErr } = await supabase.from('invoice_line_items').insert(lineItemInserts);
      if (liInsertErr) {
        console.error('[generate-invoice] line items insert failed:', liInsertErr);
        await supabase.from('invoices').delete().eq('id', invoice.id);
        continue;
      }

      // Generate PDF
      try {
        const orgIdForBranding = profile.organization_id ?? null;
        const classicTutorMeta = pdfMeta?.layout === CLASSIC_LT_TUTOR_LAYOUT ? pdfMeta : null;
        const pvmMeta = pdfMeta && pdfMeta.layout === 'pvm_education' ? pdfMeta : null;
        const branding =
          !classicTutorMeta && orgIdForBranding
            ? await resolveInvoiceBranding(supabase, orgIdForBranding)
            : null;

        const pdfData: InvoicePdfData = {
          invoiceNumber,
          issueDate: classicTutorMeta
            ? new Date().toISOString().slice(0, 10)
            : new Date().toLocaleDateString('lt-LT'),
          periodStart: new Date(periodStart).toLocaleDateString('lt-LT'),
          periodEnd: new Date(periodEnd).toLocaleDateString('lt-LT'),
          seller: sellerSnapshot,
          buyer,
          lineItems: lineItems.map(li => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            totalPrice: li.totalPrice,
          })),
          totalAmount,
          branding: branding ?? undefined,
          isVatInvoice: !!sellerSnapshot.vatCode || !!pvmMeta,
          invoiceNumberLabel: pdfMeta
            ? formatInvoiceSeriesHeading(invoiceNumber)
            : `Nr. ${invoiceNumber}`,
          ...(pvmMeta
            ? {
                layout: 'pvm_education' as const,
                notes: pvmMeta.notes,
                lessonDetails: pvmMeta.lessonDetails,
                hidePlatformFooter: true,
              }
            : {}),
          ...(classicTutorMeta
            ? {
                layout: CLASSIC_LT_TUTOR_LAYOUT,
                lessonDetails: classicTutorMeta.lessonDetails,
                hidePlatformFooter: true,
                issuedByName: classicTutorMeta.issuedByName,
              }
            : {}),
        };

        const pdfBytes = await generateInvoicePdf(pdfData);
        const storagePath = `${issuingUserId}/${invoice.id}.pdf`;

        const { error: uploadErr } = await supabase.storage
          .from('invoices')
          .upload(storagePath, pdfBytes, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (!uploadErr) {
          await supabase
            .from('invoices')
            .update({ pdf_storage_path: storagePath })
            .eq('id', invoice.id);
        } else {
          console.error('[generate-invoice] PDF upload error:', uploadErr);
        }
      } catch (pdfErr) {
        console.error('[generate-invoice] PDF generation error:', pdfErr);
      }

      const invoicedPkgIds = resolvedPackageIds.filter(id => lineItems.some(li => li.sessionIds.includes(id)));
      if (invoicedPkgIds.length > 0) {
        await supabase
          .from('lesson_packages')
          .update({ manual_sales_invoice_id: invoice.id })
          .in('id', invoicedPkgIds);
      }

      if (onlyPaid) {
        const pkgSet = new Set(resolvedPackageIds);
        const invoicedSessionIds = lineItems.flatMap(li => li.sessionIds).filter(id => !pkgSet.has(id));
        if (invoicedSessionIds.length > 0) {
          await supabase
            .from('sessions')
            .update({ payment_status: 'invoiced' })
            .in('id', invoicedSessionIds);
        }
      }

      createdInvoices.push(invoice.id);
    }

    return res.status(200).json({
      success: true,
      invoiceIds: createdInvoices,
      count: createdInvoices.length,
    });
  } catch (err: any) {
    console.error('[generate-invoice] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

async function getSellerProfile(userId: string, orgId: string | null, isOrgTutor?: boolean) {
  // Org tutor billing the company: seller is the tutor (personal invoice profile).
  if (isOrgTutor) {
    const { data } = await supabase
      .from('invoice_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data;
  }

  // Org admin or org tutor issuing to students/payers: seller is the organization when configured.
  if (orgId) {
    const { data: orgInvoiceProfile } = await supabase
      .from('invoice_profiles')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (orgInvoiceProfile) return orgInvoiceProfile;
  }

  // Fallback: user's personal profile
  const { data } = await supabase
    .from('invoice_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

function buildSellerSnapshot(invoiceProfile: any, userProfile: any) {
  const entityType = String(invoiceProfile?.entity_type ?? '');
  const isCompany = ['mb', 'uab', 'ii'].includes(entityType);
  const bizRaw = invoiceProfile?.business_name;
  const biz = typeof bizRaw === 'string' ? bizRaw.trim() : '';
  const fullRaw = userProfile?.full_name;
  const full = typeof fullRaw === 'string' ? fullRaw.trim() : '';
  /** Vienių subjektams forma dažnai neturi aiškaus įmonės lauko „antraštės“ lauke Revkiščiuose — kombinuojame pavadinimą iš paskyros ir profilio DB. */
  const displayName = isCompany ? biz || full || 'Įmonė' : full || biz || 'Korepetitorius';
  return {
    name: displayName,
    entityType,
    companyCode:
      typeof invoiceProfile.company_code === 'string' && invoiceProfile.company_code.trim()
        ? invoiceProfile.company_code.trim()
        : undefined,
    vatCode:
      typeof invoiceProfile.vat_code === 'string' && invoiceProfile.vat_code.trim()
        ? invoiceProfile.vat_code.trim()
        : undefined,
    address: invoiceProfile.address?.trim?.() || undefined,
    activityNumber: invoiceProfile.activity_number || undefined,
    personalCode: invoiceProfile.personal_code || undefined,
    contactEmail: invoiceProfile.contact_email || userProfile.email || undefined,
    contactPhone: invoiceProfile.contact_phone || userProfile.phone || undefined,
    bankName: invoiceProfile.bank_name?.trim?.() || undefined,
    iban: invoiceProfile.iban?.trim?.() || undefined,
  };
}

function buildBuyerFromSessions(sessions: any[]) {
  const first = sessions[0];
  const student = first.students as any;
  return {
    name: student.payer_name || student.full_name || 'Mokinys',
    email: student.payer_email || student.email || undefined,
    phone: student.payer_phone || undefined,
  };
}

interface SessionGroup {
  key: string;
  sessions: any[];
}

function groupSessions(sessions: any[], groupingType: GroupingType): SessionGroup[] {
  if (groupingType === 'per_payment') {
    return sessions.map((s, i) => ({
      key: `session-${i}`,
      sessions: [s],
    }));
  }

  if (groupingType === 'per_week') {
    const weekMap = new Map<string, any[]>();
    for (const s of sessions) {
      const date = new Date(s.start_time);
      const weekKey = getISOWeekKey(date);
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, []);
      weekMap.get(weekKey)!.push(s);
    }
    return Array.from(weekMap.entries()).map(([key, sess]) => ({ key, sessions: sess }));
  }

  // single
  return [{ key: 'all', sessions }];
}

interface LineItemData {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sessionIds: string[];
}

function buildLineItems(
  sessions: any[],
  groupingType: GroupingType,
  opts?: {
    orgTutorRateEur: number | null;
    detailed?: boolean;
    proKlasePay?: boolean;
    lessonPayEur?: (session: any) => number;
  }
): LineItemData[] {
  const orgTutorPayRate = opts?.orgTutorRateEur ?? null;
  const detailed = opts?.detailed === true && orgTutorPayRate == null;
  if (orgTutorPayRate != null) {
    const linePay = (s: any) =>
      opts?.lessonPayEur
        ? opts.lessonPayEur(s)
        : opts?.proKlasePay
          ? proKlaseSessionPayEur(
              { status: s.status, price: s.price, subjects: s.subjects },
              orgTutorPayRate,
            )
          : orgTutorLessonPayEur(orgTutorPayRate, s.price);

    if (groupingType === 'per_payment') {
      return sessions.map(s => {
        const subject = (s.subjects as any)?.name || 'Pamoka';
        const date = new Date(s.start_time).toLocaleDateString('lt-LT');
        const amount = linePay(s);
        return {
          description: `${subject} (${date})`,
          quantity: 1,
          unitPrice: amount,
          totalPrice: amount,
          sessionIds: [s.id],
        };
      });
    }

    const subjectMap = new Map<string, { name: string; sessions: any[] }>();
    for (const s of sessions) {
      const subjectName = (s.subjects as any)?.name || 'Pamoka';
      if (!subjectMap.has(subjectName)) subjectMap.set(subjectName, { name: subjectName, sessions: [] });
      subjectMap.get(subjectName)!.sessions.push(s);
    }
    return Array.from(subjectMap.values()).map(group => {
      const qty = group.sessions.length;
      const totalPrice = group.sessions.reduce((sum, s) => sum + linePay(s), 0);
      const unitPrice = qty > 0 ? Math.round((totalPrice / qty) * 100) / 100 : 0;
      return {
        description: `${group.name} - korepetavimo paslaugos`,
        quantity: qty,
        unitPrice,
        totalPrice: Math.round(totalPrice * 100) / 100,
        sessionIds: group.sessions.map((s: any) => s.id),
      };
    });
  }

  if (groupingType === 'per_payment') {
    return sessions.map(s => {
      const subject = (s.subjects as any)?.name || 'Pamoka';
      const date = new Date(s.start_time).toLocaleDateString('lt-LT');
      if (s.__fromPackage) {
        const n = s.total_lessons ?? '';
        return {
          description: `${subject} — pamokų paketas (${n} pam.), ${date}`,
          quantity: 1,
          unitPrice: s.price || 0,
          totalPrice: s.price || 0,
          // For package pseudo-sessions, store the package id in session_ids
          // so the post-issue update `lesson_packages.manual_sales_invoice_id`
          // step (and invoice display links) can find it.
          sessionIds: [s.__packageId || s.id],
        };
      }
      return {
        description: `${subject} (${date})`,
        quantity: 1,
        unitPrice: s.price || 0,
        totalPrice: s.price || 0,
        sessionIds: [s.id],
      };
    });
  }

  // Detailed org invoices (invoice_detailed_line_items): one line per
  // (child, subject) with lesson-count quantity and the lesson dates
  // enumerated in the description, e.g. "Matematika – Jonas – 4 pam. (07-01, 07-08)".
  if (detailed) {
    const fmtMd = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const detailMap = new Map<string, { name: string; studentName: string; sessions: any[] }>();
    for (const s of sessions) {
      const subjectName = (s.subjects as any)?.name || 'Pamoka';
      const studentName = ((s.students as any)?.full_name as string) || '';
      const key = `${s.student_id ?? ''}|${subjectName}`;
      if (!detailMap.has(key)) detailMap.set(key, { name: subjectName, studentName, sessions: [] });
      detailMap.get(key)!.sessions.push(s);
    }
    return Array.from(detailMap.values()).map(group => {
      const real = group.sessions.filter((s: any) => !s.__fromPackage);
      const pseudo = group.sessions.filter((s: any) => s.__fromPackage);
      const qty =
        real.length + pseudo.reduce((n: number, s: any) => n + (Number(s.total_lessons) || 0), 0);
      const totalPrice = group.sessions.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
      const dates = [
        ...real.map((s: any) => fmtMd(s.start_time)),
        ...pseudo.flatMap((s: any) => (Array.isArray(s.__lessonDates) ? s.__lessonDates : [])),
      ].sort();
      const namePart = group.studentName ? ` – ${group.studentName}` : '';
      const mainLine = `${group.name}${namePart} – ${qty} pam.`;
      const datesLine = dates.length > 0 ? `(${dates.join(', ')})` : '';
      return {
        description: datesLine ? `${mainLine}\n${datesLine}` : mainLine,
        quantity: Math.max(1, qty),
        unitPrice: qty > 0 ? Math.round((totalPrice / qty) * 100) / 100 : Math.round(totalPrice * 100) / 100,
        totalPrice: Math.round(totalPrice * 100) / 100,
        sessionIds: Array.from(
          new Set(group.sessions.map((s: any) => s.__packageId || s.id)),
        ) as string[],
      };
    });
  }

  // per_week and single: aggregate by subject
  const subjectMap = new Map<string, { name: string; sessions: any[] }>();

  for (const s of sessions) {
    const subjectName = (s.subjects as any)?.name || 'Pamoka';
    const key = subjectName;
    if (!subjectMap.has(key)) subjectMap.set(key, { name: subjectName, sessions: [] });
    subjectMap.get(key)!.sessions.push(s);
  }

  return Array.from(subjectMap.values()).map(group => {
    const totalPrice = group.sessions.reduce((sum, s) => sum + (s.price || 0), 0);
    const avgPrice = group.sessions.length > 0 ? totalPrice / group.sessions.length : 0;
    return {
      description: `${group.name} - korepetavimo paslaugos`,
      quantity: group.sessions.length,
      unitPrice: Math.round(avgPrice * 100) / 100,
      totalPrice: Math.round(totalPrice * 100) / 100,
      // For package pseudo-sessions, use the underlying package id (multiple
      // items share the same package id; dedupe with a Set).
      sessionIds: Array.from(
        new Set(group.sessions.map((s: any) => s.__packageId || s.id)),
      ) as string[],
    };
  });
}

async function getNextInvoiceNumber(invoiceProfileId: string): Promise<string> {
  return allocateInvoiceNumber(supabase, invoiceProfileId);
}

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
