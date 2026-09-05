/**
 * After a parent accepts the extra-lessons click-wrap, invite them to the
 * nearest lesson of that contract: date, time, teacher, tracked join link and
 * the homework page — all usable without a Tutlio account.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types.js';
import {
  extraLessonsServiceStartYmd,
  formatScheduleLabel,
  vilniusYmd,
  type ExtraLessonsOrderSnapshot,
  type StartWithin14Status,
} from '../../src/lib/extraLessonsContract.js';
import { materializeClassGroupNow } from './schoolClassGroupMaterialize.js';
import { buildSchoolHomeworkUrl } from './publicLinkToken.js';
import { internalApiOrigin } from './extraLessonsContractShared.js';
import { publicOriginFromRequest } from './public-origin.js';

export type InviteCandidateSession = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string | null;
  meeting_link: string | null;
  tutor_id: string | null;
  class_group_id: string | null;
  topic?: string | null;
};

/** Pure: first upcoming active lesson on/after the contract's service start, preferring the contract's group. */
export function pickNearestSession(
  rows: InviteCandidateSession[],
  opts: { nowIso: string; serviceStartYmd: string; groupId?: string | null },
): InviteCandidateSession | null {
  const nowMs = Date.parse(opts.nowIso);
  const eligible = rows
    .filter((row) => {
      if (row.status !== 'active') return false;
      const startMs = Date.parse(row.start_time);
      if (!Number.isFinite(startMs) || startMs < nowMs) return false;
      return vilniusYmd(new Date(startMs)) >= opts.serviceStartYmd;
    })
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  if (opts.groupId) {
    const inGroup = eligible.find((row) => row.class_group_id === opts.groupId);
    if (inGroup) return inGroup;
  }
  return eligible[0] ?? null;
}

const TZ = 'Europe/Vilnius';
export function vilniusDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ });
}
export function vilniusTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

export type FirstLessonInviteInput = {
  contractId: string;
  contractNumber: string | null;
  organizationId: string;
  schoolName: string | null;
  studentId: string;
  studentName: string | null;
  parentName: string | null;
  payerEmail: string | null;
  order: ExtraLessonsOrderSnapshot;
  acceptedAtIso: string;
  startWithin14Status: StartWithin14Status;
  classGroupId: string | null;
};

export type FirstLessonInviteResult = {
  sent: boolean;
  sessionId: string | null;
  serviceStartYmd: string;
  reason?: string;
};

export async function sendFirstLessonInvite(
  supabase: SupabaseClient,
  req: VercelRequest,
  input: FirstLessonInviteInput,
  deps: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<FirstLessonInviteResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const serviceStartYmd = extraLessonsServiceStartYmd({
    status: input.startWithin14Status,
    acceptedAtIso: input.acceptedAtIso,
    order: input.order,
  });
  const to = String(input.payerEmail || '').trim();
  if (!to) return { sent: false, sessionId: null, serviceStartYmd, reason: 'no payer email' };

  const groupId = input.classGroupId || input.order.group_id || null;
  if (groupId) {
    // The contract's 14-day gate just changed — make the group's lessons for this student exist now.
    try {
      await materializeClassGroupNow(supabase, groupId, input.organizationId);
    } catch (e) {
      console.error('[first-lesson-invite] materialize failed', groupId, (e as Error)?.message);
    }
  }

  const { data: rows } = await supabase
    .from('sessions')
    .select('id, start_time, end_time, status, meeting_link, tutor_id, class_group_id, topic')
    .eq('student_id', input.studentId)
    .eq('status', 'active')
    .gte('start_time', now.toISOString())
    .order('start_time', { ascending: true })
    .limit(40);
  const session = pickNearestSession((rows || []) as InviteCandidateSession[], {
    nowIso: now.toISOString(),
    serviceStartYmd,
    groupId,
  });

  let tutorName = '';
  let groupName = '';
  if (session?.tutor_id) {
    const { data: tutor } = await supabase.from('profiles').select('full_name').eq('id', session.tutor_id).maybeSingle();
    tutorName = String((tutor as { full_name?: string | null } | null)?.full_name || '');
  }
  const groupLookupId = session?.class_group_id || groupId;
  if (groupLookupId) {
    const { data: group } = await supabase.from('school_class_groups').select('name').eq('id', groupLookupId).maybeSingle();
    groupName = String((group as { name?: string | null } | null)?.name || '');
  }

  const publicOrigin = publicOriginFromRequest(req);
  const data: Record<string, unknown> = {
    organizationId: input.organizationId,
    schoolName: input.schoolName || '',
    studentId: input.studentId,
    studentName: input.studentName || 'Mokinys',
    parentName: input.parentName || '',
    recipientName: input.parentName || '',
    contractNumber: input.contractNumber || '',
    serviceStartDate: serviceStartYmd,
    waitsFor14Days: input.startWithin14Status === 'no',
    scheduleLabel: formatScheduleLabel(input.order.schedule_slots || []),
    groupName,
    tutorName,
    homeworkUrl: buildSchoolHomeworkUrl(publicOrigin, input.studentId),
  };
  if (session) {
    data.sessionId = session.id;
    data.date = vilniusDateLabel(session.start_time);
    data.time = vilniusTimeLabel(session.start_time);
    if (session.end_time) {
      data.duration = Math.round((Date.parse(session.end_time) - Date.parse(session.start_time)) / 60000);
    }
    data.meetingLink = session.meeting_link || undefined;
  }

  try {
    const resp = await fetchImpl(`${internalApiOrigin(req)}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({ type: 'school_extra_first_lesson_invite', to, data }),
    });
    if (!resp.ok) return { sent: false, sessionId: session?.id ?? null, serviceStartYmd, reason: `send-email ${resp.status}` };
  } catch (e) {
    return { sent: false, sessionId: session?.id ?? null, serviceStartYmd, reason: (e as Error)?.message || 'fetch failed' };
  }
  return { sent: true, sessionId: session?.id ?? null, serviceStartYmd };
}
