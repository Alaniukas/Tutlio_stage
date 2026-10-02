import type { VercelRequest, VercelResponse } from './types';
import { Resend } from 'resend';
import { verifyRequestAuth, isInternalRequest } from './_lib/auth.js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { listDriveRecordings } from './_lib/googleDriveRecordings.js';
import { registerDrivePublications, schoolMaterialPublicationIsNotifiable } from './_lib/schoolMaterialPublications.js';
import { queueSchoolMaterialAudience, prepareSchoolMaterialDigests, deliverSchoolMaterialDigest,
  holdExpiredSchoolMaterialDigests, repairSchoolMaterialDigestEntries, dueSchoolMaterialDigestIds } from './_lib/schoolMaterialDigest.js';
import { publicAppOrigin } from './_lib/publicLinkToken.js';
import { schoolFamilyPortalEnabled } from './_lib/schoolFamilyGuardianAccess.js';
import { schoolMaterialDigestsEnabled } from '../src/lib/schoolNotificationPolicy.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = serviceSupabase();
  const preview = req.query.preview === '1';
  let organizationId: string | undefined;
  if (preview) {
    const auth = await verifyRequestAuth(req);
    const admin = auth?.userId ? await getOrgAdminAccessByUserId(db, auth.userId) : null;
    if (!admin || !hasOrgAdminPermission(admin.role, admin.permissions, 'sessions.edit')) return res.status(403).json({ error: 'Forbidden' });
    organizationId = admin.organizationId;
  } else if (!isInternalRequest(req) && !requireCronAuth(req, res)) return;
  try {
    const now = new Date();
    if (!preview) {
      const initialized = await db.rpc('school_start_material_notifications');
      if (initialized.error) throw initialized.error;
    }
    // Oldest checked orgs first; each run advances up to five folders per school.
    let baselines = db.from('school_material_baselines')
      .select('organization_id,scan_offset,completed_at,notifications_started_at,organization:organizations!inner(id,entity_type,features)')
      .or('completed_at.not.is.null,notifications_started_at.not.is.null')
      .eq('organization.entity_type', 'school')
      .or('features->>school_family_portal.eq.true,features->>school_join_and_material_notifications.eq.true', { referencedTable: 'organization' })
      .order('last_scan_at', { ascending: true, nullsFirst: true }).limit(5);
    if (organizationId) baselines = baselines.eq('organization_id', organizationId);
    const settings = await baselines;
    if (settings.error) throw settings.error;
    let scanned = 0; const failures: string[] = [];
    for (const baseline of settings.data || []) {
      const org = Array.isArray(baseline.organization) ? baseline.organization[0] : baseline.organization;
      if (org?.entity_type !== 'school' || !schoolMaterialDigestsEnabled(org.features)
        || (schoolFamilyPortalEnabled(org.features) ? !baseline.completed_at : !baseline.notifications_started_at)) continue;
      const mappings = await db.from('school_recording_drive_folders').select('id,group_id,subject_id,drive_folder_id')
        .eq('organization_id', baseline.organization_id).order('id').range(baseline.scan_offset, baseline.scan_offset + 4);
      if (mappings.error) throw mappings.error;
      let succeeded = true;
      for (const mapping of mappings.data || []) {
        try {
          await registerDrivePublications(db, { organizationId: baseline.organization_id,
            targetId: mapping.subject_id ? `subject:${mapping.subject_id}` : mapping.group_id,
            files: await listDriveRecordings(mapping.drive_folder_id), features: org?.features });
          scanned++;
        } catch (e) { succeeded = false; failures.push(baseline.organization_id); console.error('[school-materials] Drive scan failed', (e as Error).message); }
      }
      const saved = await db.from('school_material_baselines').update({ last_scan_at: now.toISOString(),
        ...(succeeded ? { scan_offset: (mappings.data || []).length < 5 ? 0 : baseline.scan_offset + 5 } : {}) }).eq('organization_id', baseline.organization_id);
      if (saved.error) throw saved.error;
    }
    // Admin preview does not fan out other schools, send mail, or freeze a daily email.
    if (preview) {
      const baseline = (settings.data || []).find(row => row.organization_id === organizationId);
      const org = Array.isArray(baseline?.organization) ? baseline.organization[0] : baseline?.organization;
      let pendingQuery = db.from('school_material_publications').select('*').eq('organization_id', organizationId!);
      pendingQuery = schoolFamilyPortalEnabled(org?.features) ? pendingQuery.eq('legacy_access', false)
        : baseline?.notifications_started_at ? pendingQuery.gte('first_published_at', baseline.notifications_started_at) : pendingQuery.eq('legacy_access', false);
      const pending = await pendingQuery.order('first_published_at', { ascending: false }).limit(100);
      if (pending.error) throw pending.error;
      const deliveries = await db.from('school_material_digest_deliveries').select('id,recipient_email,state,payload')
        .eq('organization_id', organizationId!).order('digest_date', { ascending: false }).limit(20);
      if (deliveries.error) throw deliveries.error;
      return res.status(200).json({ ok: true, scanned, failures,
        publications: (pending.data || []).filter(pub => schoolMaterialPublicationIsNotifiable(pub, org?.features, baseline?.notifications_started_at)),
        deliveries: deliveries.data });
    }
    const queued = await queueSchoolMaterialAudience(db);
    await repairSchoolMaterialDigestEntries(db);
    await holdExpiredSchoolMaterialDigests(db, now);
    const configuredHour = Number(process.env.SCHOOL_MATERIAL_DIGEST_HOUR ?? 20);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vilnius', hour: '2-digit', hourCycle: 'h23' }).format(now));
    let sent = 0;
    if (hour >= (Number.isInteger(configuredHour) && configuredHour >= 0 && configuredHour <= 23 ? configuredHour : 20)) {
      try { await prepareSchoolMaterialDigests(db, { origin: publicAppOrigin(), now }); }
      catch {
        failures.push('digest_preparation');
        console.error('[school-materials] Digest preparation deferred; existing deliveries remain retryable');
      }
    }
    // Creation is once per evening; retries continue during the provider's safe window.
    const due = await dueSchoolMaterialDigestIds(db, now);
    const key = process.env.RESEND_API_KEY || process.env.RESEND_API_KEY_STAGE;
    for (const deliveryId of due) {
      if (!key || process.env.TUTLIO_DEV_SUPPRESS_EMAIL === '1') break;
      try {
        const outcome = await deliverSchoolMaterialDigest(db, deliveryId, async (payload, idempotencyKey) => {
          const { items: _items, ...email } = payload;
          const result = await new Resend(key).emails.send(email, { idempotencyKey });
          return result.error ? { error: result.error.message } : { id: result.data?.id };
        }, { now });
        if (outcome === 'sent') sent++;
      } catch {
        failures.push(deliveryId);
        console.error('[school-materials] Digest attempt failed; retry remains queued');
      }
    }
    return res.status(200).json({ ok: true, scanned, queued, sent, failures });
  } catch (e) {
    console.error('[process-school-materials] failed', (e as Error).message);
    return res.status(503).json({ error: 'school_material_processing_failed' });
  }
}
