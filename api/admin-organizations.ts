// GET /api/admin-organizations — list orgs + counts
// GET /api/admin-organizations?id=<uuid> — one org + tutors + students
// PATCH /api/admin-organizations?id=<uuid> — tutor_limit, status, features (merge)
// POST /api/admin-organizations?id=<uuid> — actions (e.g. archive tutor)
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { getOrgVisibleTutorProfileIds } from './_lib/orgVisibleTutorIds.js';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // Cast to any to avoid build-time strict DB type coupling in serverless.
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
}

function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function insertAudit(
  supabase: any,
  action: string,
  organizationId: string | null,
  details: Record<string, unknown>
) {
  await supabase.from('platform_admin_audit' as any).insert({
    action,
    organization_id: organizationId,
    details: details as any,
  });
}

/**
 * Profiles that can have students assigned (students.tutor_id):
 * - profiles.organization_id = org
 * - organization_admins.user_id (org admin be organization_id profilyje)
 * - tutor_invites.used_by_profile_id — tutor joined via invite; sometimes profiles.organization_id remains NULL
 */
async function getOrgTutorProfileIdsForData(
  supabase: any,
  organizationId: string
): Promise<string[]> {
  const { data: profs } = await supabase.from('profiles').select('id').eq('organization_id', organizationId);

  const { data: adminRows } = await supabase
    .from('organization_admins')
    .select('user_id')
    .eq('organization_id', organizationId);

  const { data: inviteRows } = await supabase
    .from('tutor_invites')
    .select('used_by_profile_id')
    .eq('organization_id', organizationId);

  const ids = new Set<string>();
  (profs || []).forEach((p: { id: string }) => ids.add(p.id));
  (adminRows || []).forEach((a: { user_id: string }) => ids.add(a.user_id));
  (inviteRows || []).forEach((r: { used_by_profile_id: string | null }) => {
    if (r.used_by_profile_id) ids.add(r.used_by_profile_id);
  });
  return Array.from(ids);
}

async function getOrgStudentProfileExclusions(
  supabase: any,
  organizationId: string
): Promise<{ ids: Set<string>; emails: Set<string> }> {
  const { data: students } = await supabase
    .from('students')
    .select('linked_user_id, email')
    .eq('organization_id', organizationId);

  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const s of students || []) {
    const linkedId = typeof (s as any).linked_user_id === 'string' ? (s as any).linked_user_id : '';
    const emailRaw = String((s as any).email || '').trim().toLowerCase();
    if (linkedId) ids.add(linkedId);
    if (emailRaw) emails.add(emailRaw);
  }

  return { ids, emails };
}

async function computeOrgStats(
  supabase: any,
  organizationId: string,
  adminIds: Set<string>
) {
  const { data: tutorRows } = await supabase.from('profiles').select('id, email').eq('organization_id', organizationId);
  const { ids: studentProfileIds, emails: studentEmails } = await getOrgStudentProfileExclusions(supabase, organizationId);
  const tutorIdsNonAdmin = (tutorRows || [])
    .filter((r: { id: string; email?: string | null }) => {
      const email = String(r.email || '').trim().toLowerCase();
      return !adminIds.has(r.id) && !studentProfileIds.has(r.id) && !studentEmails.has(email);
    })
    .map((r: { id: string }) => r.id);
  const tutorCount = tutorIdsNonAdmin.length;

  const allProfileIds = await getOrgTutorProfileIdsForData(supabase, organizationId);

  let studentCount = 0;
  let lessonsOccurred = 0;
  let paidRevenue = 0;

  const { data: rpcStudentCount, error: rpcStudentErr } = await supabase.rpc('admin_org_student_count' as any, {
    p_org_id: organizationId,
  });
  if (!rpcStudentErr && rpcStudentCount != null) {
    studentCount = Number(rpcStudentCount);
  } else if (allProfileIds.length > 0) {
    const { count: sc } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .in('tutor_id', allProfileIds);
    studentCount = sc ?? 0;
  }

  if (allProfileIds.length > 0) {
    const { count: lc } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .in('tutor_id', allProfileIds)
      .in('status', ['completed', 'no_show']);
    lessonsOccurred = lc ?? 0;

    const { data: paidRows } = await supabase
      .from('sessions')
      .select('price')
      .in('tutor_id', allProfileIds)
      .eq('paid', true)
      .neq('status', 'cancelled');
    paidRevenue = paidRows?.reduce((s, r) => s + Number((r as { price: number | null }).price ?? 0), 0) ?? 0;
  }

  const platformFee2pct = Math.round(paidRevenue * 0.02 * 100) / 100;

  return {
    tutor_count: tutorCount,
    student_count: studentCount,
    lessons_occurred: lessonsOccurred,
    paid_revenue_eur: paidRevenue,
    platform_fee_2pct_eur: platformFee2pct,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return;

  const supabase = getSupabase() as any;
  if (!supabase) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const idParam = typeof req.query.id === 'string' ? req.query.id : Array.isArray(req.query.id) ? req.query.id[0] : undefined;

  try {
    if (req.method === 'GET') {
      if (!idParam) {
        const { data: orgs, error } = await supabase
          .from('organizations')
          .select('id, name, email, tutor_limit, tutor_license_count, status, features, created_at')
          .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        // Keep list endpoint fast: heavy stats are computed in the detail endpoint.
        const out = (orgs || []).map((org) => ({
          ...org,
          tutor_license_count: Math.max(Number((org as any).tutor_license_count) || 0, Number((org as any).tutor_limit) || 0),
          tutor_count: 0,
          student_count: 0,
          lessons_occurred: null,
          paid_revenue_eur: 0,
          platform_fee_2pct_eur: 0,
        }));

        return res.status(200).json({ organizations: out });
      }

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name, email, tutor_limit, tutor_license_count, status, features, created_at')
        .eq('id', idParam)
        .maybeSingle();

      if (orgErr) return res.status(500).json({ error: orgErr.message });
      if (!org) return res.status(404).json({ error: 'Organization not found' });

      (org as any).tutor_license_count = Math.max(
        Number((org as any).tutor_license_count) || 0,
        Number((org as any).tutor_limit) || 0
      );

      const { data: adminRows } = await supabase
        .from('organization_admins')
        .select('user_id')
        .eq('organization_id', idParam);
      const adminIds = new Set<string>((adminRows || []).map((a: { user_id: string }) => a.user_id));

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .eq('organization_id', idParam)
        .order('full_name');
      const { ids: studentProfileIds, emails: studentEmails } = await getOrgStudentProfileExclusions(supabase, idParam);
      const tutors = (allProfiles || []).filter((t) => {
        const email = String((t as any).email || '').trim().toLowerCase();
        return !adminIds.has(t.id) && !studentProfileIds.has(t.id) && !studentEmails.has(email);
      });

      type StudRow = { id: string; full_name: string; email: string | null; tutor_id: string };
      let students: StudRow[] = [];

      const { data: rpcStudentList, error: rpcListErr } = await supabase.rpc('admin_org_students' as any, {
        p_org_id: idParam,
      });
      if (!rpcListErr && rpcStudentList && Array.isArray(rpcStudentList)) {
        students = (rpcStudentList as StudRow[]).sort((a, b) =>
          (a.full_name || '').localeCompare(b.full_name || '', 'lt')
        );
      } else {
        const orgProfileIds = await getOrgTutorProfileIdsForData(supabase, idParam);
        const { data: studByTutor } =
          orgProfileIds.length > 0
            ? await supabase.from('students').select('id, full_name, email, tutor_id').in('tutor_id', orgProfileIds)
            : { data: [] as StudRow[] };
        const { data: studByOrg, error: studOrgErr } = await supabase
          .from('students')
          .select('id, full_name, email, tutor_id')
          .eq('organization_id', idParam);
        const merged = new Map<string, StudRow>();
        for (const s of studByTutor || []) merged.set(s.id, s as StudRow);
        if (!studOrgErr) {
          for (const s of studByOrg || []) merged.set(s.id, s as StudRow);
        }
        students = Array.from(merged.values()).sort((a, b) =>
          (a.full_name || '').localeCompare(b.full_name || '', 'lt')
        );
      }

      const stats = await computeOrgStats(supabase, idParam, adminIds);

      const { data: auditRows } = await supabase
        .from('platform_admin_audit')
        .select('id, created_at, action, details')
        .eq('organization_id', idParam)
        .order('created_at', { ascending: false })
        .limit(50);

      const archivedTutorsMap = new Map<string, { id: string; full_name: string | null; email: string | null }>();
      for (const a of auditRows || []) {
        if (a.action !== 'organization.archive_tutor') continue;
        const details = (a.details || {}) as Record<string, unknown>;
        const tutorId = typeof details.tutor_id === 'string' ? details.tutor_id : '';
        if (!tutorId || archivedTutorsMap.has(tutorId)) continue;
        archivedTutorsMap.set(tutorId, {
          id: tutorId,
          full_name: typeof details.tutor_name === 'string' ? details.tutor_name : null,
          email: typeof details.tutor_email === 'string' ? details.tutor_email : null,
        });
      }

      const archivedTutors = Array.from(archivedTutorsMap.values());

      return res.status(200).json({
        organization: org,
        tutors,
        archived_tutors: archivedTutors,
        students,
        stats,
        audit: auditRows || [],
      });
    }

    if (req.method === 'POST') {
      if (!idParam) return res.status(400).json({ error: 'Missing id query param' });
      const body = (typeof req.body === 'object' && req.body) || {};
      const action = typeof body.action === 'string' ? body.action : '';

      if (action === 'archive_tutor') {
        const tutorId = typeof body.tutor_id === 'string' ? body.tutor_id : '';
        if (!tutorId) return res.status(400).json({ error: 'Missing tutor_id' });

        const { data: tutorProfile, error: tutorErr } = await supabase
          .from('profiles')
          .select('id, organization_id, full_name, email')
          .eq('id', tutorId)
          .maybeSingle();
        if (tutorErr) return res.status(500).json({ error: tutorErr.message });
        if (!tutorProfile) return res.status(404).json({ error: 'Tutor not found' });
        if (tutorProfile.organization_id !== idParam) {
          return res.status(400).json({ error: 'Tutor does not belong to this organization' });
        }

        const { data: affectedStudents } = await supabase
          .from('students')
          .select('id')
          .eq('organization_id', idParam)
          .eq('tutor_id', tutorId);

        await supabase
          .from('students')
          .update({ tutor_id: null })
          .eq('organization_id', idParam)
          .eq('tutor_id', tutorId);

        const { error: detachErr } = await supabase
          .from('profiles')
          .update({ organization_id: null })
          .eq('id', tutorId);
        if (detachErr) return res.status(500).json({ error: detachErr.message });

        await insertAudit(supabase, 'organization.archive_tutor', idParam, {
          tutor_id: tutorId,
          tutor_name: tutorProfile.full_name,
          tutor_email: tutorProfile.email,
          detached_student_ids: (affectedStudents || []).map((s: { id: string }) => s.id),
        });

        return res.status(200).json({ success: true });
      }

      if (action === 'unarchive_tutor') {
        const tutorId = typeof body.tutor_id === 'string' ? body.tutor_id : '';
        if (!tutorId) return res.status(400).json({ error: 'Missing tutor_id' });

        const { data: tutorProfile, error: tutorErr } = await supabase
          .from('profiles')
          .select('id, organization_id, full_name, email')
          .eq('id', tutorId)
          .maybeSingle();
        if (tutorErr) return res.status(500).json({ error: tutorErr.message });
        if (!tutorProfile) return res.status(404).json({ error: 'Tutor not found' });

        const { data: archiveAuditRows, error: auditErr } = await supabase
          .from('platform_admin_audit')
          .select('id, details, created_at')
          .eq('organization_id', idParam)
          .eq('action', 'organization.archive_tutor')
          .order('created_at', { ascending: false })
          .limit(100);
        if (auditErr) return res.status(500).json({ error: auditErr.message });

        const archiveEntry = (archiveAuditRows || []).find((r: any) => {
          const details = (r.details || {}) as Record<string, unknown>;
          return typeof details.tutor_id === 'string' && details.tutor_id === tutorId;
        });
        if (!archiveEntry) {
          return res.status(404).json({ error: 'Archive entry not found for this tutor in this organization' });
        }

        const details = (archiveEntry.details || {}) as Record<string, unknown>;
        const detachedIdsRaw = Array.isArray(details.detached_student_ids) ? details.detached_student_ids : [];
        const detachedStudentIds = detachedIdsRaw.filter((v): v is string => typeof v === 'string');

        const { error: attachErr } = await supabase
          .from('profiles')
          .update({ organization_id: idParam })
          .eq('id', tutorId);
        if (attachErr) return res.status(500).json({ error: attachErr.message });

        if (detachedStudentIds.length > 0) {
          await supabase
            .from('students')
            .update({ tutor_id: tutorId })
            .eq('organization_id', idParam)
            .is('tutor_id', null)
            .in('id', detachedStudentIds);
        }

        await insertAudit(supabase, 'organization.unarchive_tutor', idParam, {
          tutor_id: tutorId,
          tutor_name: tutorProfile.full_name,
          tutor_email: tutorProfile.email,
          restored_student_ids: detachedStudentIds,
        });

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

  if (req.method === 'PATCH') {
      if (!idParam) return res.status(400).json({ error: 'Missing id query param' });

      const { data: before, error: beforeErr } = await supabase
        .from('organizations')
        .select('id, name, email, tutor_limit, tutor_license_count, status, features')
        .eq('id', idParam)
        .maybeSingle();

      if (beforeErr) return res.status(500).json({ error: beforeErr.message });
      if (!before) return res.status(404).json({ error: 'Organization not found' });

      const body = (typeof req.body === 'object' && req.body) || {};
      const tutor_limit = typeof body.tutor_limit === 'number' ? body.tutor_limit : undefined;
      const tutor_license_count =
        typeof body.tutor_license_count === 'number' ? body.tutor_license_count : undefined;
      const status = body.status === 'active' || body.status === 'suspended' ? body.status : undefined;
      let features: Record<string, unknown> | undefined;
      if (body.features !== undefined) {
        if (typeof body.features === 'object' && body.features !== null && !Array.isArray(body.features)) {
          features = body.features as Record<string, unknown>;
        } else {
          return res.status(400).json({ error: 'features must be a JSON object' });
        }
      }

      const patch: Record<string, unknown> = {};
      if (tutor_limit !== undefined) {
        if (tutor_limit < 1 || tutor_limit > 10000) return res.status(400).json({ error: 'tutor_limit out of range' });
        patch.tutor_limit = tutor_limit;
      }
      if (tutor_license_count !== undefined) {
        if (tutor_license_count < 0 || tutor_license_count > 10000) {
          return res.status(400).json({ error: 'tutor_license_count out of range' });
        }
        patch.tutor_license_count = tutor_license_count;
      }
      if (status !== undefined) patch.status = status;
      if (features !== undefined) patch.features = features;

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const { data: after, error: updErr } = await supabase
        .from('organizations')
        .update(patch as any)
        .eq('id', idParam)
        .select('id, name, email, tutor_limit, tutor_license_count, status, features')
        .single();

      if (updErr) return res.status(500).json({ error: updErr.message });

      await insertAudit(supabase, 'organization.update', idParam, {
        before,
        after,
        patch,
      });

      // Match CompanySettings: org manual-payment feature → all visible org tutors' profiles.
      if (features !== undefined && after?.features && typeof after.features === 'object') {
        const feat = after.features as Record<string, unknown>;
        const manualOn = feat.manual_payments === true || feat.enable_manual_student_payments === true;
        try {
          const ids = await getOrgVisibleTutorProfileIds(supabase, idParam);
          if (ids.length > 0) {
            const { error: profUpdErr } = await supabase
              .from('profiles')
              .update({ enable_manual_student_payments: manualOn })
              .in('id', ids);
            if (profUpdErr) console.error('[admin-organizations] sync tutor manual flag:', profUpdErr.message);
          }
        } catch (e) {
          console.error('[admin-organizations] sync tutor manual flag', e);
        }
      }

      return res.status(200).json({ success: true, organization: after });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[admin-organizations]', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}
