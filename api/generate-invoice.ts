import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { generateInvoicePdf, type InvoicePdfData } from './_lib/invoicePdf.js';

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
      .select('id, full_name, email, phone, organization_id, company_commission_percent')
      .eq('id', tutorId)
      .single();

    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Fetch seller invoice profile
    // When isOrgTutor, the tutor is the seller (billing the org), so use tutorId
    const sellerUserId = isOrgTutor ? tutorId : issuingUserId;
    const sellerProfile = await getSellerProfile(sellerUserId, profile.organization_id, isOrgTutor);
    if (!sellerProfile) {
      return res.status(400).json({ error: 'Invoice settings not configured. Please set up your business details first.' });
    }

    const sessionSelect = `
        id, price, start_time, subject_id, student_id,
        students!inner(id, full_name, email, payer_email, payer_name, payer_phone),
        subjects(name)
      `;

    let sessions: any[] = [];
    let sessErr: any = null;

    const hasSessionIds = !!(body.sessionIds && body.sessionIds.length > 0);
    const hasPackageIds = resolvedPackageIds.length > 0;

    if (hasSessionIds) {
      const result = await supabase
        .from('sessions')
        .select(sessionSelect)
        .in('id', body.sessionIds!)
        .eq('tutor_id', tutorId)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });
      sessions = result.data || [];
      sessErr = result.error;
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

      const result = await query;
      sessions = result.data || [];
      sessErr = result.error;
    }

    if (hasPackageIds) {
      const baseSelect = `
          id, tutor_id, student_id, subject_id, total_price, total_lessons, paid_at, created_at,
          paid, payment_method, manual_sales_invoice_id,
          students!inner(id, full_name, email, payer_email, payer_name, payer_phone),
          subjects(name)
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
          .eq('payment_method', 'stripe')
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
      const pseudoSessions = (pkgs || []).filter(p => requested.has(p.id)).map(pkg => {
        const when = pkg.paid_at || pkg.created_at || new Date().toISOString();
        const isPaid = !!pkg.paid;
        return {
          id: pkg.id,
          tutor_id: pkg.tutor_id,
          student_id: pkg.student_id,
          subject_id: pkg.subject_id,
          start_time: when,
          price: Number(pkg.total_price) || 0,
          students: pkg.students,
          subjects: pkg.subjects,
          payment_status: isPaid ? 'paid' : 'pending',
          total_lessons: pkg.total_lessons,
          __fromPackage: true,
        };
      });

      if (pseudoSessions.length < requested.size) {
        return res.status(400).json({
          error: allowPendingStripePackages
            ? 'One or more packages are not eligible (must be unpaid Stripe checkout, not already on a sales invoice).'
            : 'One or more packages are not eligible (must be manual or Stripe, paid, not already on a sales invoice).',
        });
      }

      sessions = [...sessions, ...pseudoSessions];
    }

    if (sessErr) return res.status(500).json({ error: sessErr.message });
    if (!sessions.length) {
      if (precheckOnly) {
        return res.status(200).json({ canGenerate: false, reason: 'no_sessions' });
      }
      return res.status(400).json({ error: 'No sessions found in the selected period' });
    }

    // Server-side duplicate protection for org-tutor/company invoices:
    // if any session in this candidate set is already included in a non-cancelled
    // invoice for the same period/org, do not allow issuing again.
    if (isOrgTutor && profile.organization_id) {
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
    const sellerSnapshot = buildSellerSnapshot(sellerProfile, profile);

    sessions.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // Group sessions and create invoices
    const groups = groupSessions(sessions, groupingType);
    const createdInvoices: string[] = [];

    for (const group of groups) {
      const orgTutorRateEur = isOrgTutor ? Number((profile as any)?.company_commission_percent) || 0 : null;
      const lineItems = buildLineItems(group.sessions, groupingType, { orgTutorRateEur });
      const totalAmount = lineItems.reduce((sum, li) => sum + li.totalPrice, 0);

      const buyer = organizationAsBuyer ?? buildBuyerFromSessions(group.sessions);

      // Get and increment invoice number
      const invoiceNumber = await getNextInvoiceNumber(sellerProfile.id);

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

      await supabase.from('invoice_line_items').insert(lineItemInserts);

      // Generate PDF
      try {
        const pdfData: InvoicePdfData = {
          invoiceNumber,
          issueDate: new Date().toLocaleDateString('lt-LT'),
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

      createdInvoices.push(invoice.id);

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

  // Org admin (or same org) issuing to students/payers: seller is the organization.
  if (orgId) {
    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (adminRow) {
      const { data } = await supabase
        .from('invoice_profiles')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (data) return data;
    }
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
  const isCompany = ['mb', 'uab', 'ii'].includes(invoiceProfile.entity_type);
  return {
    name: isCompany
      ? invoiceProfile.business_name
      : userProfile.full_name || 'Korepetitorius',
    entityType: invoiceProfile.entity_type,
    companyCode: invoiceProfile.company_code || undefined,
    vatCode: invoiceProfile.vat_code || undefined,
    address: invoiceProfile.address || undefined,
    activityNumber: invoiceProfile.activity_number || undefined,
    personalCode: invoiceProfile.personal_code || undefined,
    contactEmail: invoiceProfile.contact_email || userProfile.email || undefined,
    contactPhone: invoiceProfile.contact_phone || userProfile.phone || undefined,
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
  opts?: { orgTutorRateEur: number | null }
): LineItemData[] {
  const orgTutorRateEur = opts?.orgTutorRateEur ?? null;
  if (orgTutorRateEur != null) {
    // Org tutor → invoice to organization: quantity = occurred lessons, unit price = org rate.
    // GroupingType only affects aggregation, not the rate.
    if (groupingType === 'per_payment') {
      return sessions.map(s => {
        const subject = (s.subjects as any)?.name || 'Pamoka';
        const date = new Date(s.start_time).toLocaleDateString('lt-LT');
        return {
          description: `${subject} (${date})`,
          quantity: 1,
          unitPrice: orgTutorRateEur,
          totalPrice: orgTutorRateEur,
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
      const totalPrice = qty * orgTutorRateEur;
      return {
        description: `${group.name} - korepetavimo paslaugos`,
        quantity: qty,
        unitPrice: Math.round(orgTutorRateEur * 100) / 100,
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
          sessionIds: [s.id],
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
      sessionIds: group.sessions.map((s: any) => s.id),
    };
  });
}

async function getNextInvoiceNumber(invoiceProfileId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('invoice_profiles')
    .select('invoice_series, next_invoice_number')
    .eq('id', invoiceProfileId)
    .single();

  if (!profile) return 'SF-001';

  const series = profile.invoice_series || 'SF';
  const num = profile.next_invoice_number || 1;
  const paddedNum = String(num).padStart(3, '0');

  await supabase
    .from('invoice_profiles')
    .update({ next_invoice_number: num + 1, updated_at: new Date().toISOString() })
    .eq('id', invoiceProfileId);

  return `${series}-${paddedNum}`;
}

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
