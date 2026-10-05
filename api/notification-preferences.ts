import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import {
  availableNotificationKeys, legacyNotificationEnabled, type NotificationPortal,
  type NotificationOrganization, type NotificationContext,
} from '../src/lib/notificationPreferences.js';
import { hasOrgAdminPermission, normalizeOrgAdminPermissions, type OrgAdminRole } from '../src/lib/orgAdminPermissions.js';
import { tutorHasPlatformSubscriptionAccess } from '../src/lib/subscription.js';

type Student = { id: string; organization_id: string | null; tutor_id: string | null; payment_payer: string | null; email?: string | null; payer_email?: string | null };
const STUDENT_COLUMNS = 'id,organization_id,tutor_id,payment_payer,email,payer_email';
const assertResult = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw result.error;
  return result.data;
};

export async function loadNotificationSettings(db: SupabaseClient, userId: string, portal: NotificationPortal) {
  const [profileResult, parentResult, preferenceResult] = await Promise.all([
    db.from('profiles').select('id,email,organization_id,subscription_status,manual_subscription_exempt,email_notification_opt_out').eq('id', userId).maybeSingle(),
    db.from('parent_profiles').select('id,email,email_notification_opt_out,disable_lesson_reminders').eq('user_id', userId).maybeSingle(),
    db.from('user_notification_preferences').select('category,enabled').eq('user_id', userId),
  ]);
  const profile = assertResult(profileResult);
  const parent = assertResult(parentResult);
  const preferences = assertResult(preferenceResult) || [];
  let students: Student[] = [];
  let orgIds: string[] = [];
  let seats: Array<{ organization_id: string; role: OrgAdminRole; permissions: unknown }> = [];
  if (portal === 'org_admin') {
    seats = assertResult(await db.from('organization_admins').select('organization_id,role,permissions')
      .eq('user_id', userId).eq('status', 'active').not('accepted_at', 'is', null)) || [];
    if (!seats.length) return null;
    orgIds = seats.map(row => row.organization_id);
  } else if (portal === 'tutor') {
    if (!profile) return null;
    // Profile rows used solely for login/locale do not confer a tutor portal.
    const [admin, child] = await Promise.all([
      db.from('organization_admins').select('user_id').eq('user_id', userId).limit(1),
      db.from('students').select('id').eq('linked_user_id', userId).limit(1),
    ]);
    const hasAdmin = Boolean(assertResult(admin)?.length);
    const hasStudent = Boolean(assertResult(child)?.length);
    if (hasAdmin || (!tutorHasPlatformSubscriptionAccess(profile) && (parent || hasStudent))) return null;
    if (profile.organization_id) orgIds = [profile.organization_id];
  } else if (portal === 'student') {
    students = assertResult(await db.from('students').select(STUDENT_COLUMNS).eq('linked_user_id', userId).is('detached_at', null)) || [];
    if (!students.length) return null;
  } else {
    if (!parent) return null;
    const [links, direct] = await Promise.all([
      db.from('parent_students').select('student_id').eq('parent_id', parent.id),
      db.from('students').select(STUDENT_COLUMNS).eq('parent_user_id', userId).is('detached_at', null),
    ]);
    students = assertResult(direct) || [];
    const studentIds = (assertResult(links) || []).map(row => row.student_id);
    if (studentIds.length) {
      students.push(...(assertResult(await db.from('students').select(STUDENT_COLUMNS).in('id', studentIds).is('detached_at', null)) || []));
    }
  }
  orgIds.push(...students.map(row => row.organization_id).filter((id): id is string => Boolean(id)));
  const tutorIds = [...new Set(students.filter(row => !row.organization_id).map(row => row.tutor_id).filter((id): id is string => Boolean(id)))];
  const tutors = tutorIds.length ? assertResult(await db.from('profiles').select('id,organization_id').in('id', tutorIds)) || [] : [];
  orgIds.push(...tutors.map(row => row.organization_id).filter((id): id is string => Boolean(id)));
  orgIds = [...new Set(orgIds)];
  const organizations: NotificationOrganization[] = orgIds.length
    ? assertResult(await db.from('organizations').select('id,email,entity_type,features').in('id', orgIds)) || [] : [];
  for (const org of organizations) {
    const seat = seats.find(row => row.organization_id === org.id);
    if (!seat) continue;
    const permissions = normalizeOrgAdminPermissions(seat.permissions);
    org.canMessage = hasOrgAdminPermission(seat.role, permissions, 'messages.view');
    org.canViewFinance = hasOrgAdminPermission(seat.role, permissions, 'finance.view');
    // These alerts go to the signing contact, rather than every contract viewer.
    const signingContact = String(org.features?.school_contract_signing_email || org.email || '').trim().toLowerCase();
    org.canViewContracts = hasOrgAdminPermission(seat.role, permissions, 'contracts.view')
      && Boolean(profile?.email) && signingContact === profile.email.trim().toLowerCase();
  }
  const context: NotificationContext = {
    portal, organizations,
    hasSoloTutor: tutors.some(row => !row.organization_id) || students.some(row => !row.organization_id && !row.tutor_id),
    studentPays: students.some(row => row.payment_payer !== 'parent'),
    studentReceivesAttendanceAlerts: portal === 'student' && students.some(row => Boolean(row.email)
      && row.email?.trim().toLowerCase() === row.payer_email?.trim().toLowerCase()),
    parentReceivesWaitlistAlerts: portal === 'parent' && students.some(row => Boolean(row.email)
      && [parent?.email, profile?.email].some(email => email && email.trim().toLowerCase() === row.email?.trim().toLowerCase())),
  };
  return availableNotificationKeys(context).map(key => {
    const saved = preferences.find(row => row.category === key);
    const legacy = legacyNotificationEnabled(key, portal, profile?.email_notification_opt_out,
      parent?.email_notification_opt_out, parent?.disable_lesson_reminders === true);
    // Footer unsubscribe and earlier reminder controls continue to take effect.
    const enabled = key === 'lesson_reminders' ? saved?.enabled !== false && legacy : saved?.enabled ?? legacy;
    return { key, enabled };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const portal = req.query.portal;
  if (typeof portal !== 'string' || !['tutor', 'student', 'parent', 'org_admin'].includes(portal)) {
    return res.status(400).json({ error: 'Invalid portal' });
  }
  try {
    const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '', supabaseServiceRoleClientOptions());
    const choices = await loadNotificationSettings(db, auth.userId, portal as NotificationPortal);
    if (!choices) return res.status(403).json({ error: 'Portal unavailable' });
    return res.status(200).json({ choices });
  } catch (error) {
    console.error('[notification-preferences] lookup failed', error);
    return res.status(503).json({ error: 'Notification settings unavailable' });
  }
}
