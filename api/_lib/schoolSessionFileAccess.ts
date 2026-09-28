import type { SupabaseClient } from '@supabase/supabase-js';
import { studentMaySeeGroupFile } from '../../src/lib/sessionFileVisibility.js';

/** A peer folder may share teacher material, but never another child's submission. */
export async function schoolSessionFileFolderAllowed(db: SupabaseClient, input: {
  organizationId: string; studentId: string; sessionId: string; folderId: string; fileName: string;
}): Promise<boolean> {
  const { organizationId, studentId, sessionId, folderId, fileName } = input;
  if (!studentMaySeeGroupFile(fileName, folderId, sessionId)) return false;
  const own = await db.from('sessions')
    .select('id,student_id,tutor_id,subject_id,class_group_id,start_time,end_time,subjects(is_group)')
    .eq('id', sessionId).eq('student_id', studentId).maybeSingle();
  if (own.error) throw own.error;
  if (!own.data) return false;
  if (own.data.class_group_id) {
    const [member, group] = await Promise.all([
      db.from('school_class_group_members').select('student_id')
        .eq('group_id', own.data.class_group_id).eq('student_id', studentId).maybeSingle(),
      db.from('school_class_groups').select('id')
        .eq('id', own.data.class_group_id).eq('organization_id', organizationId).maybeSingle(),
    ]);
    if (member.error || group.error) throw member.error || group.error;
    if (!member.data || !group.data) return false;
  }
  if (folderId === sessionId) return true;
  let sibling = db.from('sessions').select('id,student_id').eq('id', folderId)
    .eq('start_time', own.data.start_time);
  sibling = own.data.end_time ? sibling.eq('end_time', own.data.end_time) : sibling.is('end_time', null);
  if (own.data.class_group_id) {
    sibling = sibling.eq('class_group_id', own.data.class_group_id);
  } else {
    const subject = Array.isArray(own.data.subjects) ? own.data.subjects[0] : own.data.subjects;
    if (!subject?.is_group || !own.data.subject_id || !own.data.tutor_id) return false;
    sibling = sibling.eq('tutor_id', own.data.tutor_id).eq('subject_id', own.data.subject_id)
      .is('class_group_id', null);
  }
  const source = await sibling.maybeSingle();
  if (source.error) throw source.error;
  if (!source.data?.student_id) return false;
  const sourceStudent = await db.from('students').select('id').eq('id', source.data.student_id)
    .eq('organization_id', organizationId).maybeSingle();
  if (sourceStudent.error) throw sourceStudent.error;
  return Boolean(sourceStudent.data);
}
