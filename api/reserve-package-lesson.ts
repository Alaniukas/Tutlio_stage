import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth) return json(res, 401, { error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Missing Supabase env vars' });
  }

  const { packageId, subjectId } = req.body as { packageId?: string; subjectId?: string };
  if (!packageId) return json(res, 400, { error: 'packageId is required' });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: pkg, error: pkgErr } = await supabase
    .from('lesson_packages')
    .select('id, available_lessons, reserved_lessons, total_lessons, tutor_id, student_id, subject_id, expires_at')
    .eq('id', packageId)
    .eq('paid', true)
    .eq('active', true)
    .single();

  if (pkgErr || !pkg) {
    return json(res, 404, { error: 'Package not found', details: pkgErr?.message });
  }

  const available = Number(pkg.available_lessons || 0);
  const nowMs = Date.now();
  const expiresAtMs = pkg.expires_at ? new Date(pkg.expires_at).getTime() : null;
  if (expiresAtMs !== null && !Number.isNaN(expiresAtMs) && expiresAtMs <= nowMs) {
    try {
      await supabase
        .from('lesson_packages')
        .update({ active: false, payment_status: 'expired' })
        .eq('id', packageId);
    } catch {
      // best-effort
    }
    return json(res, 409, { error: 'Package expired' });
  }
  if (available <= 0) {
    return json(res, 409, { error: 'No available lessons in package' });
  }

  // Pick the matching package item to decrement.
  // - subjectId provided: find the item for that subject
  // - subjectId omitted (legacy callers): fall back to the package's denormalized subject_id
  const lookupSubjectId = (subjectId && subjectId.trim()) || (pkg as any).subject_id;
  let itemRow: { id: string; available_lessons: number; reserved_lessons: number } | null = null;
  if (lookupSubjectId) {
    const { data: itemData } = await supabase
      .from('lesson_package_items')
      .select('id, available_lessons, reserved_lessons')
      .eq('package_id', packageId)
      .eq('subject_id', lookupSubjectId)
      .maybeSingle();
    itemRow = (itemData as any) || null;
  }
  if (!itemRow) {
    return json(res, 409, { error: 'No matching package item for this subject' });
  }
  const itemAvailable = Number(itemRow.available_lessons || 0);
  if (itemAvailable <= 0) {
    return json(res, 409, { error: 'No available lessons for this subject in package' });
  }

  // Atomically decrement the item first (with optimistic CAS on available_lessons),
  // then decrement the parent aggregate.
  const itemUpdated = {
    available_lessons: itemAvailable - 1,
    reserved_lessons: Number(itemRow.reserved_lessons || 0) + 1,
  };
  const { error: itemUpdErr } = await supabase
    .from('lesson_package_items')
    .update(itemUpdated)
    .eq('id', itemRow.id)
    .eq('available_lessons', itemAvailable);
  if (itemUpdErr) {
    return json(res, 500, { error: 'Failed to reserve package item lesson', details: itemUpdErr.message });
  }

  const updated = {
    available_lessons: available - 1,
    reserved_lessons: Number(pkg.reserved_lessons || 0) + 1,
  };

  const { error: updErr } = await supabase
    .from('lesson_packages')
    .update(updated)
    .eq('id', packageId)
    .eq('available_lessons', available);

  if (updErr) {
    // Roll back the item-level change so counters stay consistent.
    await supabase
      .from('lesson_package_items')
      .update({ available_lessons: itemAvailable, reserved_lessons: Number(itemRow.reserved_lessons || 0) })
      .eq('id', itemRow.id);
    return json(res, 500, { error: 'Failed to reserve package lesson', details: updErr.message });
  }

  if (updated.available_lessons === 0) {
    try {
      const [{ data: tutorRow }, { data: studentRow }, { data: subjectRow }, { data: itemsRows }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, organization_id').eq('id', (pkg as any).tutor_id).maybeSingle(),
        supabase.from('students').select('id, full_name').eq('id', (pkg as any).student_id).maybeSingle(),
        supabase.from('subjects').select('id, name').eq('id', (pkg as any).subject_id).maybeSingle(),
        supabase
          .from('lesson_package_items')
          .select('total_lessons, price_per_lesson, subjects!inner(name)')
          .eq('package_id', packageId)
          .order('position', { ascending: true }),
      ]);

      type DepletedItem = { subjectName: string; totalLessons: number; pricePerLesson: string };
      const itemsForEmail: DepletedItem[] = (itemsRows || []).map((row: any) => ({
        subjectName: (row.subjects?.name as string) || 'Pamoka',
        totalLessons: Number(row.total_lessons) || 0,
        pricePerLesson: Number(row.price_per_lesson || 0).toFixed(2),
      }));

      let recipients: string[] = [];
      let recipientName = 'Administratore';
      if ((tutorRow as any)?.organization_id) {
        const { data: orgAdmins } = await supabase
          .from('organization_admins')
          .select('user_id')
          .eq('organization_id', (tutorRow as any).organization_id);
        const adminIds = (orgAdmins || []).map((a: any) => a.user_id).filter(Boolean);
        if (adminIds.length > 0) {
          const { data: adminProfiles } = await supabase
            .from('profiles')
            .select('email, full_name')
            .in('id', adminIds);
          recipients = (adminProfiles || [])
            .map((p: any) => String(p.email || '').trim())
            .filter((e: string) => e.length > 0);
          recipientName = (adminProfiles || []).map((p: any) => p.full_name).find(Boolean) || recipientName;
        }
      } else if ((tutorRow as any)?.email) {
        recipients = [String((tutorRow as any).email)];
        recipientName = (tutorRow as any).full_name || 'Korepetitoriau';
      }

      if (recipients.length > 0) {
        const firstItem = itemsForEmail[0];
        await fetch(`${APP_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
          body: JSON.stringify({
            type: 'package_depleted_notification',
            to: recipients,
            data: {
              tutorName: recipientName,
              studentName: (studentRow as any)?.full_name || 'Mokinys',
              // Back-compat: first subject (or legacy denormalized value)
              subjectName: firstItem?.subjectName || (subjectRow as any)?.name || 'Dalykas',
              // Multi-subject payload:
              items: itemsForEmail,
              totalLessons: Number(pkg.total_lessons || 0),
              ...((tutorRow as any)?.organization_id ? { organizationId: (tutorRow as any).organization_id } : {}),
            },
          }),
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[reserve-package-lesson] package depleted email error:', e);
    }
  }

  return json(res, 200, {
    success: true,
    packageId,
    availableLessons: updated.available_lessons,
    reservedLessons: updated.reserved_lessons,
    totalLessons: Number(pkg.total_lessons || 0),
  });
}
