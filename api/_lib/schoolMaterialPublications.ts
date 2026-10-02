import type { SupabaseClient } from '@supabase/supabase-js';
import { getDriveFileMetadata, isRecordingWithinRetention, listDriveRecordings, type DriveRecordingFile } from './googleDriveRecordings.js';
import { loadSchoolFamilyGuardianAccess, schoolFamilyPortalEnabled } from './schoolFamilyGuardianAccess.js';
import { recordingSlotScope, recordingSlotTags, recordingVisibleToScope } from './schoolRecordingSlotAccess.js';
import { schoolJoinContact, schoolMaterialDigestsEnabled } from '../../src/lib/schoolNotificationPolicy.js';

export const MATERIAL_PUBLICATIONS = 'school_material_publications';
export type SchoolMaterialPublication = {
  id: string; organization_id: string; source: 'drive' | 'session_file' | 'session_note';
  target_id: string; file_id: string; source_version: string; label: string;
  source_created_at: string | null; first_published_at: string; legacy_access: boolean;
};

/** Enabling the digest must not notify families about the existing inventory. */
export function schoolMaterialPublicationIsNotifiable(publication: SchoolMaterialPublication,
  features?: Record<string, unknown> | null, notificationsStartedAt?: string | null): boolean {
  if (schoolFamilyPortalEnabled(features)) return !publication.legacy_access;
  if (!schoolMaterialDigestsEnabled(features)) return false;
  const cutoff = Date.parse(notificationsStartedAt || '');
  return Number.isFinite(cutoff) && Date.parse(publication.first_published_at) >= cutoff
    && (publication.source !== 'drive' || Date.parse(publication.source_created_at || '') >= cutoff);
}

/** Unknown publications are private after cutover, including an old Drive file newly added to a folder. */
export async function schoolRecordingPublicationAllowsLegacyAccess(db: SupabaseClient, input: {
  organizationId: string; targetId: string; fileId: string; createdTime?: string | null;
  modifiedTime?: string | null; features?: Record<string, unknown> | null;
}): Promise<boolean> {
  if (!schoolFamilyPortalEnabled(input.features)) return true;
  const { data, error } = await db.from(MATERIAL_PUBLICATIONS).select('legacy_access, source_version')
    .eq('organization_id', input.organizationId).eq('source', 'drive')
    .eq('target_id', input.targetId).eq('file_id', input.fileId)
    .order('first_published_at', { ascending: false }).order('source_version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('school_material_access_unavailable');
  const currentVersion = input.modifiedTime || input.createdTime;
  return data?.legacy_access === true && Boolean(currentVersion) && data.source_version === currentVersion;
}

export async function registerDrivePublications(db: SupabaseClient, input: {
  organizationId: string; targetId: string; files: DriveRecordingFile[];
  features?: Record<string, unknown> | null; baselineCutoff?: string;
}): Promise<void> {
  if (!input.files.length) return;
  const privatePortal = schoolFamilyPortalEnabled(input.features);
  const rows = input.files.map((file) => ({
    organization_id: input.organizationId, source: 'drive', target_id: input.targetId,
    file_id: file.id, source_version: file.modifiedTime || file.createdTime || 'unknown',
    label: file.name, source_created_at: file.createdTime,
    legacy_access: !privatePortal && (!input.baselineCutoff
      || Date.parse(file.modifiedTime || file.createdTime || '') <= Date.parse(input.baselineCutoff)),
  }));
  const { error } = await db.from(MATERIAL_PUBLICATIONS).upsert(rows, {
    onConflict: 'organization_id,source,target_id,file_id,source_version', ignoreDuplicates: true,
  });
  if (error) throw new Error('school_material_publish_failed');
}

export async function legacySessionMaterialPaths(db: SupabaseClient, organizationId: string, paths: string[]): Promise<Set<string>> {
  if (!paths.length) return new Set();
  const { data, error } = await db.from(MATERIAL_PUBLICATIONS)
    .select('file_id, legacy_access, first_published_at, source_version').eq('organization_id', organizationId)
    .eq('source', 'session_file').in('file_id', paths)
    .order('first_published_at', { ascending: false }).order('source_version', { ascending: false });
  if (error) throw new Error('school_material_access_unavailable');
  const seen = new Set<string>(); const allowed = new Set<string>();
  for (const row of data || []) {
    if (seen.has(row.file_id)) continue;
    seen.add(row.file_id);
    if (row.legacy_access === true) allowed.add(row.file_id);
  }
  return allowed;
}

/** This preparation is resumable and never changes the org feature or existing contacts. */
export async function prepareSchoolMaterialBaseline(db: SupabaseClient, organizationId: string): Promise<{ complete: boolean; folders: number }> {
  const org = await db.from('organizations').select('features, entity_type').eq('id', organizationId).single();
  if (org.error || org.data?.entity_type !== 'school') throw new Error('school_not_found');
  if (schoolFamilyPortalEnabled(org.data.features)) throw new Error('school_material_baseline_requires_disabled_portal');
  const baseline = await db.rpc('school_baseline_session_materials', { p_organization_id: organizationId });
  if (baseline.error) throw new Error('school_material_baseline_failed');
  const settings = await db.from('school_material_baselines').select('*').eq('organization_id', organizationId).single();
  if (settings.error) throw settings.error;
  if (settings.data.completed_at) return { complete: true, folders: settings.data.drive_offset };
  const offset = Number(settings.data.drive_offset || 0);
  const mappings = await db.from('school_recording_drive_folders').select('id, group_id, subject_id, drive_folder_id')
    .eq('organization_id', organizationId).order('id').range(offset, offset + 4);
  if (mappings.error) throw mappings.error;
  for (const mapping of mappings.data || []) {
    const files = await listDriveRecordings(mapping.drive_folder_id);
    await registerDrivePublications(db, { organizationId,
      targetId: mapping.subject_id ? `subject:${mapping.subject_id}` : mapping.group_id,
      files, features: org.data.features, baselineCutoff: settings.data.cutoff_at });
  }
  const complete = (mappings.data || []).length < 5;
  const folders = offset + (mappings.data || []).length;
  const saved = await db.from('school_material_baselines').update({ drive_offset: folders,
    ...(complete ? { completed_at: new Date().toISOString() } : {}) }).eq('organization_id', organizationId);
  if (saved.error) throw saved.error;
  return { complete, folders };
}

/** Private portals require a verified guardian; email-only schools use their existing contacts. */
export async function schoolMaterialRecipient(db: SupabaseClient, student: {
  id: string; organization_id: string; email?: string | null; full_name?: string | null; linked_user_id?: string | null;
  payer_email?: string | null; payer_name?: string | null; parent_secondary_email?: string | null; parent_secondary_name?: string | null;
}, features?: Record<string, unknown> | null): Promise<{ email: string; kind: 'student' | 'payer'; name: string; userId?: string | null } | null> {
  const email = String(student.email || '').trim().toLowerCase();
  if (email.includes('@') && !email.endsWith('.invalid')) return { email, kind: 'student', name: student.full_name || '', userId: student.linked_user_id };
  if (!schoolFamilyPortalEnabled(features) && features?.school_join_and_material_notifications === true) {
    const contact = schoolJoinContact(student);
    if (contact) return { ...contact, name: contact.name || '' };
    const links = await db.from('parent_students').select('parent_id').eq('student_id', student.id);
    if (links.error) throw new Error('school_family_contact_unavailable');
    const parentIds = (links.data || []).map(link => link.parent_id);
    if (!parentIds.length) return null;
    const parents = await db.from('parent_profiles').select('email,full_name').in('id', parentIds).order('id');
    if (parents.error) throw new Error('school_family_contact_unavailable');
    for (const parent of parents.data || []) {
      const fallback = schoolJoinContact({ payer_email: parent.email, payer_name: parent.full_name });
      if (fallback) return { ...fallback, name: fallback.name || '' };
    }
    return null;
  }
  const { data, error } = await db.from('school_family_guardians').select('guardian_user_id, guardian_email, guardian_name')
    .eq('organization_id', student.organization_id).eq('student_id', student.id).maybeSingle();
  if (error) throw new Error('school_family_contact_unavailable');
  if (!data?.guardian_user_id) return null;
  const access = await loadSchoolFamilyGuardianAccess(db, data.guardian_user_id, student.organization_id);
  if (!access.distinctParent || !access.studentIds.includes(student.id)) return null;
  return { email: data.guardian_email, kind: 'payer', name: data.guardian_name, userId: data.guardian_user_id };
}

/** Live ownership is also checked for queued digests; stale filenames must not escape after revocation. */
export async function schoolStudentMayViewPublication(db: SupabaseClient, publication: SchoolMaterialPublication, studentId: string,
  options: { recipientKind?: 'student' | 'payer'; verifyDrive?: boolean } = {}): Promise<boolean> {
  const [org, student] = await Promise.all([
    db.from('organizations').select('entity_type,features').eq('id', publication.organization_id).single(),
    db.from('students').select('organization_id,detached_at,enrollment_status').eq('id', studentId).single(),
  ]);
  if (org.error || student.error) throw new Error('school_material_access_unavailable');
  if (org.data.entity_type !== 'school' || !schoolMaterialDigestsEnabled(org.data.features)
    || student.data.organization_id !== publication.organization_id || student.data.detached_at
    || (student.data.enrollment_status && student.data.enrollment_status !== 'active')) return false;
  // Student submissions are kept in the family workflow, never shared as
  // teacher material in the group's digest, including a previously queued item.
  if (publication.source === 'session_file' && publication.file_id.split('/')[1]?.startsWith('nd-')) return false;
  if (publication.source === 'drive') {
    if (org.data.features?.school_lesson_recordings !== true || !isRecordingWithinRetention(publication.source_created_at)) return false;
    if (publication.target_id.startsWith('subject:')) {
      const recurring = await db.from('recurring_individual_sessions').select('id,tutor:profiles!inner(organization_id)')
        .eq('student_id', studentId).eq('subject_id', publication.target_id.slice(8)).eq('active', true)
        .eq('tutor.organization_id', publication.organization_id).limit(1);
      if (recurring.error) throw recurring.error;
      if (!recurring.data?.length) return false;
    } else {
      const [scope, tags] = await Promise.all([
        recordingSlotScope(db, publication.target_id, [studentId], false, { organizationId: publication.organization_id, features: org.data.features }),
        recordingSlotTags(db, publication.target_id),
      ]);
      if (!recordingVisibleToScope(scope, tags.get(publication.file_id) || null)) return false;
    }
    if (options.verifyDrive) {
      let mapping = db.from('school_recording_drive_folders').select('drive_folder_id').eq('organization_id', publication.organization_id);
      mapping = publication.target_id.startsWith('subject:') ? mapping.eq('subject_id', publication.target_id.slice(8)) : mapping.eq('group_id', publication.target_id);
      const folder = await mapping.maybeSingle(); if (folder.error) throw folder.error;
      if (!folder.data) return false;
      const file = await getDriveFileMetadata(publication.file_id);
      if (!file.parents.includes(folder.data.drive_folder_id) || !file.canDownload || !isRecordingWithinRetention(file.createdTime)
        || (file.modifiedTime || file.createdTime || 'unknown') !== publication.source_version) return false;
    }
    return true;
  }
  const session = await db.from('sessions').select('id,student_id,class_group_id,start_time,tutor_comment,show_comment_to_student,show_comment_to_parent')
    .eq('id', publication.target_id).maybeSingle();
  if (session.error) throw session.error;
  if (!session.data) return false;
  if (publication.source === 'session_note') {
    if (session.data.student_id !== studentId || !session.data.tutor_comment) return false;
    return options.recipientKind === 'student' ? session.data.show_comment_to_student === true : session.data.show_comment_to_parent === true;
  }
  if (session.data.class_group_id) {
    const [member, ownSession] = await Promise.all([
      db.from('school_class_group_members').select('student_id').eq('group_id', session.data.class_group_id).eq('student_id', studentId).maybeSingle(),
      db.from('sessions').select('id').eq('student_id', studentId).eq('class_group_id', session.data.class_group_id).eq('start_time', session.data.start_time).limit(1),
    ]);
    if (member.error || ownSession.error) throw member.error || ownSession.error;
    return Boolean(member.data && ownSession.data?.length);
  }
  return session.data.student_id === studentId;
}
