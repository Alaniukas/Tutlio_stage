// GET /api/admin-individual-tutors — solo tutors (profiles without org, with subjects or students)
// PATCH /api/admin-individual-tutors — body: { tutor_id, enable_manual_student_payments }
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { soloTutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';

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

async function insertAudit(supabase: any, action: string, details: Record<string, unknown>) {
  await supabase.from('platform_admin_audit' as any).insert({
    action,
    organization_id: null,
    details: details as any,
  });
}

async function getSoloRelevantTutorIds(supabase: any): Promise<Set<string>> {
  const ids = new Set<string>();
  const [{ data: subjRows }, { data: studRows }] = await Promise.all([
    supabase.from('subjects').select('tutor_id'),
    supabase.from('students').select('tutor_id'),
  ]);
  for (const r of subjRows || []) {
    const id = (r as { tutor_id?: string | null }).tutor_id;
    if (id) ids.add(id);
  }
  for (const r of studRows || []) {
    const id = (r as { tutor_id?: string | null }).tutor_id;
    if (id) ids.add(id);
  }
  return ids;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return;

  const supabase = getSupabase() as any;
  if (!supabase) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  try {
    if (req.method === 'GET') {
      const idSet = await getSoloRelevantTutorIds(supabase);
      const tutorIds = Array.from(idSet);
      if (tutorIds.length === 0) {
        return res.status(200).json({ tutors: [] });
      }

      type Row = {
        id: string;
        full_name: string | null;
        email: string | null;
        subscription_plan: string | null;
        subscription_status: string | null;
        manual_subscription_exempt: boolean | null;
        enable_manual_student_payments: boolean | null;
        organization_id: string | null;
      };

      const merged: Row[] = [];
      for (const part of chunk(tutorIds, 120)) {
        const { data, error } = await supabase
          .from('profiles')
          .select(
            'id, full_name, email, subscription_plan, subscription_status, manual_subscription_exempt, enable_manual_student_payments, organization_id',
          )
          .in('id', part)
          .is('organization_id', null);

        if (error) return res.status(500).json({ error: error.message });
        for (const r of data || []) merged.push(r as Row);
      }

      merged.sort((a, b) => (a.full_name || a.email || a.id).localeCompare(b.full_name || b.email || b.id, 'lt'));

      const tutors = merged.map((p) => ({
        ...p,
        enable_manual_student_payments: !!p.enable_manual_student_payments,
        effective_manual_student_payments: soloTutorUsesManualStudentPayments(p),
      }));

      return res.status(200).json({ tutors });
    }

    if (req.method === 'PATCH') {
      const body = (typeof req.body === 'object' && req.body) || {};
      const tutorId = typeof body.tutor_id === 'string' ? body.tutor_id : '';
      const flag = body.enable_manual_student_payments;
      if (!tutorId) return res.status(400).json({ error: 'Missing tutor_id' });
      if (typeof flag !== 'boolean') return res.status(400).json({ error: 'enable_manual_student_payments must be boolean' });

      const idSet = await getSoloRelevantTutorIds(supabase);
      if (!idSet.has(tutorId)) {
        return res.status(400).json({ error: 'Not a solo tutor candidate (no subjects/students)' });
      }

      const { data: prof, error: readErr } = await supabase
        .from('profiles')
        .select('id, organization_id, full_name, email')
        .eq('id', tutorId)
        .maybeSingle();

      if (readErr) return res.status(500).json({ error: readErr.message });
      if (!prof) return res.status(404).json({ error: 'Profile not found' });
      if (prof.organization_id) {
        return res.status(400).json({ error: 'Profile belongs to an organization' });
      }

      const { error: upErr } = await supabase
        .from('profiles')
        .update({ enable_manual_student_payments: flag })
        .eq('id', tutorId)
        .is('organization_id', null);

      if (upErr) return res.status(500).json({ error: upErr.message });

      await insertAudit(supabase, 'individual_tutor.manual_student_payments', {
        tutor_id: tutorId,
        tutor_name: prof.full_name,
        tutor_email: prof.email,
        enable_manual_student_payments: flag,
      });

      const { data: fresh } = await supabase
        .from('profiles')
        .select(
          'id, full_name, email, subscription_plan, subscription_status, manual_subscription_exempt, enable_manual_student_payments, organization_id',
        )
        .eq('id', tutorId)
        .maybeSingle();

      return res.status(200).json({
        tutor: fresh
          ? {
              ...(fresh as object),
              effective_manual_student_payments: soloTutorUsesManualStudentPayments(fresh as any),
            }
          : { id: tutorId, enable_manual_student_payments: flag },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
