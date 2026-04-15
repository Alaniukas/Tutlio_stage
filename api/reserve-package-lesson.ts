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

  const { packageId } = req.body as { packageId?: string };
  if (!packageId) return json(res, 400, { error: 'packageId is required' });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: pkg, error: pkgErr } = await supabase
    .from('lesson_packages')
    .select('id, available_lessons, reserved_lessons, total_lessons, tutor_id, student_id, subject_id')
    .eq('id', packageId)
    .eq('paid', true)
    .eq('active', true)
    .single();

  if (pkgErr || !pkg) {
    return json(res, 404, { error: 'Package not found', details: pkgErr?.message });
  }

  const available = Number(pkg.available_lessons || 0);
  if (available <= 0) {
    return json(res, 409, { error: 'No available lessons in package' });
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
    return json(res, 500, { error: 'Failed to reserve package lesson', details: updErr.message });
  }

  if (updated.available_lessons === 0) {
    try {
      const [{ data: tutorRow }, { data: studentRow }, { data: subjectRow }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, organization_id').eq('id', (pkg as any).tutor_id).maybeSingle(),
        supabase.from('students').select('id, full_name').eq('id', (pkg as any).student_id).maybeSingle(),
        supabase.from('subjects').select('id, name').eq('id', (pkg as any).subject_id).maybeSingle(),
      ]);

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
        await fetch(`${APP_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
          body: JSON.stringify({
            type: 'package_depleted_notification',
            to: recipients,
            data: {
              tutorName: recipientName,
              studentName: (studentRow as any)?.full_name || 'Mokinys',
              subjectName: (subjectRow as any)?.name || 'Dalykas',
              totalLessons: Number(pkg.total_lessons || 0),
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
