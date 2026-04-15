// GET /api/admin-organizations — list orgs + counts
// GET /api/admin-organizations?id=<uuid> — one org + tutors + students
// PATCH /api/admin-organizations?id=<uuid> — tutor_limit, status, features (merge)
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

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

async function computeOrgStats(
  supabase: any,
  organizationId: string,
  adminIds: Set<string>
) {
  const { data: tutorRows } = await supabase.from('profiles').select('id').eq('organization_id', organizationId);
  const tutorIdsNonAdmin = (tutorRows || []).filter((r: { id: string }) => !adminIds.has(r.id)).map((r: { id: string }) => r.id);
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
          .select('id, name, email, tutor_limit, status, features, created_at')
          .order('created_at', { ascending: false });

        if (error) return res.status(500).json({ error: error.message });

        const out = await Promise.all(
          (orgs || []).map(async (org) => {
            const { data: adminRows } = await supabase
              .from('organization_admins')
              .select('user_id')
              .eq('organization_id', org.id);
            const adminIds = new Set<string>((adminRows || []).map((a: { user_id: string }) => a.user_id));

            const stats = await computeOrgStats(supabase, org.id, adminIds);

            return {
              ...org,
              ...stats,
            };
          })
        );

        return res.status(200).json({ organizations: out });
      }

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name, email, tutor_limit, status, features, created_at')
        .eq('id', idParam)
        .maybeSingle();

      if (orgErr) return res.status(500).json({ error: orgErr.message });
      if (!org) return res.status(404).json({ error: 'Organization not found' });

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

      const tutors = (allProfiles || []).filter((t) => !adminIds.has(t.id));

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

      return res.status(200).json({
        organization: org,
        tutors,
        students,
        stats,
        audit: auditRows || [],
      });
    }

    if (req.method === 'PATCH') {
      if (!idParam) return res.status(400).json({ error: 'Missing id query param' });

      const { data: before, error: beforeErr } = await supabase
        .from('organizations')
        .select('id, name, email, tutor_limit, status, features')
        .eq('id', idParam)
        .maybeSingle();

      if (beforeErr) return res.status(500).json({ error: beforeErr.message });
      if (!before) return res.status(404).json({ error: 'Organization not found' });

      const body = (typeof req.body === 'object' && req.body) || {};
      const tutor_limit = typeof body.tutor_limit === 'number' ? body.tutor_limit : undefined;
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
      if (status !== undefined) patch.status = status;
      if (features !== undefined) patch.features = features;

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const { data: after, error: updErr } = await supabase
        .from('organizations')
        .update(patch as any)
        .eq('id', idParam)
        .select('id, name, email, tutor_limit, status, features')
        .single();

      if (updErr) return res.status(500).json({ error: updErr.message });

      await insertAudit(supabase, 'organization.update', idParam, {
        before,
        after,
        patch,
      });

      return res.status(200).json({ success: true, organization: after });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[admin-organizations]', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}
