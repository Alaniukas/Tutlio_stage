import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types.js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { fetchAllRows } from '../src/lib/fetchAllRows.js';
import { buildOrgTutorIdSet, filterConfirmedOrgTutors } from '../src/lib/orgVisibleTutors.js';
import { isOwnOrgTutorInvoice } from '../src/lib/orgTutorInvoiceAccess.js';
import {
  buildProKlaseTutorFinance, type ProKlaseFinanceTutor, type ProKlaseFinanceSession,
  type TutorPayAdjustment, type TutorPayInvoice,
} from '../src/lib/proKlaseTutorFinance.js';
import type { OrgTutorInviteLink } from '../src/lib/tutorInviteClaim.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, supabaseServiceRoleClientOptions(),
    );
    const access = await requireOrgAdminAccess(req, supabase, 'finance.view');
    if (access.ok === false) return res.status(access.status).json({ error: access.error });
    const organizationId = access.access.organizationId;
    if (!isProKlaseOrg(organizationId)) return res.status(403).json({ error: 'Not authorized for this organization' });

    const start = typeof req.query.start === 'string' ? req.query.start : '';
    const end = typeof req.query.end === 'string' ? req.query.end : '';
    const tutorId = typeof req.query.tutorId === 'string' ? req.query.tutorId : '';
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    // UI allows 45 calendar days. The extra hour accounts for a DST clock change.
    if (!ISO_INSTANT.test(start) || !ISO_INSTANT.test(end)
      || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs
      || endMs - startMs > 45 * 86_400_000 + 3_600_000
      || (req.query.tutorId !== undefined && !UUID.test(tutorId))) {
      return res.status(400).json({ error: 'Invalid finance period or tutor' });
    }

    const [profiles, admins, students, invites] = await Promise.all([
      fetchAllRows<ProKlaseFinanceTutor & { has_active_license: boolean | null }>((from, to) => supabase.from('profiles')
        .select('id, full_name, email, company_commission_percent, has_active_license')
        .eq('organization_id', organizationId).order('id').range(from, to), Infinity),
      fetchAllRows<{ user_id: string }>((from, to) => supabase.from('organization_admins')
        .select('user_id').eq('organization_id', organizationId).order('id').range(from, to), Infinity),
      fetchAllRows<{ tutor_id: string | null }>((from, to) => supabase.from('students')
        .select('tutor_id').eq('organization_id', organizationId).order('id').range(from, to), Infinity),
      fetchAllRows<OrgTutorInviteLink>((from, to) => supabase.from('tutor_invites')
        .select('used_by_profile_id, used, invitee_email').eq('organization_id', organizationId)
        .order('id').range(from, to), Infinity),
    ]);
    const tutorIds = buildOrgTutorIdSet(students, invites, profiles);
    const tutors = filterConfirmedOrgTutors(profiles, new Set(admins.map(row => row.user_id)), tutorIds)
      .filter(tutor => tutor.has_active_license !== false && (!tutorId || tutor.id === tutorId))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (tutorId && tutors.length === 0) return res.status(404).json({ error: 'Tutor not found in organization' });

    const sessions: ProKlaseFinanceSession[] = [];
    const adjustments: TutorPayAdjustment[] = [];
    const now = new Date().toISOString();
    for (let offset = 0; offset < tutors.length; offset += 100) {
      const batchIds = tutors.slice(offset, offset + 100).map(tutor => tutor.id);
      const [sessionRows, adjustmentRows] = await Promise.all([
        fetchAllRows<ProKlaseFinanceSession>((from, to) => supabase.from('sessions')
          .select('id, tutor_id, status, status_confirmed_at, exclude_from_lesson_count, is_complimentary, subjects(is_trial), students!inner(organization_id)')
          .eq('students.organization_id', organizationId).in('tutor_id', batchIds)
          .in('status', ['completed', 'no_show']).lte('end_time', now)
          .gte('start_time', start).lte('start_time', end).order('id').range(from, to), Infinity),
        fetchAllRows<TutorPayAdjustment>((from, to) => supabase.from('tutor_adjustments')
          .select('id, tutor_id, session_id, type, amount_eur, reason, created_at')
          .eq('organization_id', organizationId).in('tutor_id', batchIds)
          .gte('created_at', start).lte('created_at', end)
          .order('created_at', { ascending: false }).order('id').range(from, to), Infinity),
      ]);
      sessions.push(...sessionRows);
      adjustments.push(...adjustmentRows);
    }

    let invoices: TutorPayInvoice[] = [];
    if (tutorId) {
      const { data, error } = await supabase.from('invoices')
        .select('id, invoice_number, issue_date, period_start, period_end, total_amount, status, organization_id, pdf_meta')
        .eq('organization_id', organizationId).eq('pdf_meta->>invoiceKind', 'tutor_pay')
        .eq('pdf_meta->>tutorId', tutorId).neq('status', 'cancelled')
        .order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      invoices = (data || []).filter(invoice => isOwnOrgTutorInvoice(invoice, tutorId));
    }
    return res.status(200).json({ tutors: buildProKlaseTutorFinance(tutors, sessions, adjustments), invoices });
  } catch (error) {
    console.error('[company-tutor-finance] Finance load failed:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(503).json({ error: 'Tutor finance unavailable' });
  }
}
