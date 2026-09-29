import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeSchoolHomework } from '../school-homework.js';
import { schoolFamilyPortalEnabled } from './schoolFamilyGuardianAccess.js';

export const SCHOOL_GROUP_MATERIAL_BUCKET = 'school-group-materials';
export const SCHOOL_GROUP_MATERIAL_MAX_BYTES = 10 * 1024 * 1024;
const allowedExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xlsx', 'txt']);
const objectNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[a-zA-Z0-9._-]{1,120}$/i;

export type MaterialGroup = { id: string; name: string; organization_id: string; tutor_id: string | null };
export type MaterialAccess = { ok: true; groups: MaterialGroup[]; canManage: boolean } |
  { ok: false; status: number };

export function validMaterialFile(name: string, size: number): boolean {
  const fileName = String(name || '').trim();
  const extension = fileName.split('.').at(-1)?.toLowerCase() || '';
  return fileName.length > 0 && fileName.length <= 180 && allowedExtensions.has(extension)
    && Number.isSafeInteger(size) && size > 0 && size <= SCHOOL_GROUP_MATERIAL_MAX_BYTES;
}

export function materialObjectName(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.');
  const extension = originalName.slice(lastDot).toLowerCase();
  const stem = originalName.slice(0, lastDot).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_').replace(/^[_\.]+/, '').slice(0, 100) || 'file';
  return `${crypto.randomUUID()}_${stem}${extension}`;
}

export function validMaterialObjectName(name: string): boolean {
  return objectNamePattern.test(name) && allowedExtensions.has(name.split('.').at(-1)?.toLowerCase() || '');
}

export function materialDisplayName(objectName: string): string {
  return objectName.slice(37);
}

/** Authorization comes from live group ownership or the child's live group membership. */
export async function resolveSchoolGroupMaterialAccess(
  db: SupabaseClient,
  params: { userId: string | null; groupId?: string; studentId?: string; token?: string },
): Promise<MaterialAccess> {
  const groupId = String(params.groupId || '').trim();
  const studentId = String(params.studentId || '').trim();
  if (!studentId) {
    if (!params.userId || !groupId) return { ok: false, status: 403 };
    const { data: group, error } = await db.from('school_class_groups')
      .select('id, name, organization_id, tutor_id').eq('id', groupId).maybeSingle();
    if (error) throw error;
    if (!group || group.tutor_id !== params.userId) return { ok: false, status: 403 };
    const { data: org, error: orgError } = await db.from('organizations')
      .select('id, entity_type').eq('id', group.organization_id).maybeSingle();
    if (orgError) throw orgError;
    if (org?.entity_type !== 'school') return { ok: false, status: 403 };
    return { ok: true, groups: [group as MaterialGroup], canManage: true };
  }

  const family = await authorizeSchoolHomework(db, studentId, String(params.token || ''), params.userId);
  if (family.ok === false) return { ok: false, status: family.status };
  // New material in schools with private family accounts follows that private boundary.
  if (!params.userId && schoolFamilyPortalEnabled(family.org.features)) return { ok: false, status: 403 };
  const { data: members, error: memberError } = await db.from('school_class_group_members')
    .select('group_id').eq('student_id', studentId);
  if (memberError) throw memberError;
  const ids = [...new Set((members || []).map((row: { group_id: string }) => row.group_id))];
  if (groupId && !ids.includes(groupId)) return { ok: false, status: 403 };
  if (!ids.length) return { ok: true, groups: [], canManage: false };
  const { data: groups, error: groupError } = await db.from('school_class_groups')
    .select('id, name, organization_id, tutor_id')
    .eq('organization_id', family.org.id).in('id', groupId ? [groupId] : ids);
  if (groupError) throw groupError;
  if (groupId && !groups?.length) return { ok: false, status: 403 };
  return { ok: true, groups: (groups || []) as MaterialGroup[], canManage: false };
}
