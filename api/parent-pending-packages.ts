import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Pooled rows cannot be read directly by the browser: they contain private
// fulfillment state. Read only the fields needed for this authorized summary.
const PACKAGE_COLUMNS =
  'id,student_id,total_lessons,total_price,payment_method,pool_organization_id,active,expires_at,lesson_package_items(subjects(name))';

type LinkedStudent = {
  id: string;
  full_name: string | null;
  organization_id: string | null;
  detached_at: string | null;
};

type PendingPackage = {
  id: string;
  student_id: string;
  total_lessons: number | string;
  total_price: number | string | null;
  payment_method: string | null;
  pool_organization_id: string | null;
  active: boolean;
  expires_at: string | null;
  lesson_package_items: Array<{ subjects: { name: string | null } | Array<{ name: string | null }> | null }> | null;
};

function databaseClients(authorization: string) {
  const url = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL]
    .find((value) => value && !value.includes('xklzjhfztjxltrdkplog'));
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !publicKey) throw new Error('Server configuration error');
  const auth = { autoRefreshToken: false, persistSession: false };
  return {
    service: createClient(url, serviceKey, { auth }),
    user: createClient(url, publicKey, { auth, global: { headers: { Authorization: authorization } } }),
  };
}

async function liveParentStudentIds(db: SupabaseClient, userId: string) {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 200) {
    const scope = await db.rpc('get_parent_child_ids', { p_user_id: userId }).range(offset, offset + 199);
    if (scope.error) throw scope.error;
    for (const row of scope.data || []) ids.add(String(row.student_id));
    if ((scope.data || []).length < 200) return ids;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await verifyRequestAuth(req);
    if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const rawStudentId = req.query?.studentId;
    if (rawStudentId !== undefined && (typeof rawStudentId !== 'string' || !UUID.test(rawStudentId.trim()))) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }
    const requestedStudentId = typeof rawStudentId === 'string' ? rawStudentId.trim().toLowerCase() : null;
    const { service: db, user: userDb } = databaseClients(authorization);
    const parent = await db.from('parent_profiles').select('id').eq('user_id', auth.userId).maybeSingle();
    if (parent.error) throw parent.error;
    if (!parent.data) return res.status(403).json({ error: 'Parent account required' });

    // A name, email, or package pool identity never grants access to a child.
    const links = await db.from('parent_students').select('student_id').eq('parent_id', parent.data.id);
    if (links.error) throw links.error;
    // Run with the parent's JWT so current school guardian restrictions also
    // apply. Calling this RPC with the service key would have no auth.uid().
    const liveIds = await liveParentStudentIds(userDb, auth.userId);
    const linkedIds = [...new Set((links.data || []).map((link) => String(link.student_id)))]
      .filter((id) => liveIds.has(id));
    if (requestedStudentId && !linkedIds.includes(requestedStudentId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const studentIds = requestedStudentId ? [requestedStudentId] : linkedIds;
    if (!studentIds.length) return res.status(200).json({ packages: [] });

    const students = await db.from('students').select('id,full_name,organization_id,detached_at').in('id', studentIds);
    if (students.error) throw students.error;
    const studentById = new Map((students.data as LinkedStudent[] || []).map((student) => [student.id, student]));
    if (!studentById.size) return res.status(200).json({ packages: [] });

    const isEligiblePackage = (row: PendingPackage) => {
      const student = studentById.get(row.student_id);
      if (!student) return false;
      if (row.pool_organization_id == null) return true;
      return row.pool_organization_id === student.organization_id && student.detached_at == null && row.active === true
        && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now());
    };
    const eligiblePackages: PendingPackage[] = [];
    // Apply the display limit after eligibility, so expired or inactive pools
    // cannot hide older offers. Each read and the retained result stay bounded.
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const packages = await db.from('lesson_packages').select(PACKAGE_COLUMNS)
        .in('student_id', [...studentById.keys()])
        .eq('paid', false)
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (packages.error) throw packages.error;
      const rows = (packages.data || []) as unknown as PendingPackage[];
      for (const row of rows) {
        if (isEligiblePackage(row)) eligiblePackages.push(row);
        if (eligiblePackages.length === 20) break;
      }
      if (eligiblePackages.length === 20 || rows.length < pageSize) break;
    }

    // Do not disclose a stale family binding if it was revoked while loading.
    const currentLinks = await db.from('parent_students').select('student_id').eq('parent_id', parent.data.id);
    if (currentLinks.error) throw currentLinks.error;
    const currentLinkedIds = new Set((currentLinks.data || []).map((link) => String(link.student_id)));
    const currentLiveIds = await liveParentStudentIds(userDb, auth.userId);
    const visiblePackages = eligiblePackages.filter((row) =>
      currentLinkedIds.has(row.student_id) && currentLiveIds.has(row.student_id) && isEligiblePackage(row),
    ).map((row) => {
      const subjects = (Array.isArray(row.lesson_package_items) ? row.lesson_package_items : [])
        .map((item) => Array.isArray(item.subjects) ? item.subjects[0]?.name : item.subjects?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);
      return {
        id: row.id,
        totalLessons: Number(row.total_lessons) || 0,
        totalPrice: row.total_price == null ? null : Number(row.total_price),
        paymentMethod: row.payment_method ?? null,
        studentName: studentById.get(row.student_id)?.full_name || '',
        subjects: subjects.join(', '),
      };
    });
    return res.status(200).json({ packages: visiblePackages });
  } catch (error) {
    console.error('[parent-pending-packages] Load failed:', error);
    return res.status(500).json({ error: 'Could not load pending packages.' });
  }
}
