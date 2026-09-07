import { supabase } from '@/lib/supabase';
import {
  moksloVaisiaiPayerInboxEmail,
  moksloVaisiaiRoutesLessonCommsToPayer,
} from '@/lib/moksloVaisiaiLessonComms';

/** Resolve where to send booking / session emails for a student row. */
export async function resolveStudentNotificationEmail(
  row: {
    email?: string | null;
    linked_user_id?: string | null;
    payer_email?: string | null;
    organization_id?: string | null;
    tutor_id?: string | null;
  } | null
  | undefined,
  opts?: {
    organizationId?: string | null;
    tutorOrganizationId?: string | null;
  },
): Promise<string | null> {
  if (!row) return null;
  const direct = String(row.email ?? '').trim();
  if (direct) return direct;

  const uid = row.linked_user_id;
  if (uid && typeof uid === 'string') {
    try {
      const { data: prof } = await supabase.from('profiles').select('email').eq('id', uid).maybeSingle();
      const em = String(prof?.email ?? '').trim();
      if (em) return em;
    } catch {
      /* fall through to MV payer routing */
    }
  }

  let tutorOrganizationId = opts?.tutorOrganizationId ?? null;
  if (!tutorOrganizationId && row.tutor_id) {
    try {
      const { data: tutor } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', row.tutor_id)
        .maybeSingle();
      tutorOrganizationId = (tutor?.organization_id as string | null) ?? null;
    } catch {
      tutorOrganizationId = null;
    }
  }

  const organizationId = opts?.organizationId ?? row.organization_id ?? null;
  if (
    moksloVaisiaiRoutesLessonCommsToPayer({
      organizationId,
      tutorOrganizationId,
      studentEmail: direct || null,
      linkedUserId: row.linked_user_id,
    })
  ) {
    return moksloVaisiaiPayerInboxEmail(row);
  }

  return null;
}
