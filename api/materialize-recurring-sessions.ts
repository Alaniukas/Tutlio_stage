import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import {
  buildRollingOccurrenceDates,
  recurringDurationMs,
  wallClockToUtc,
  type RecurringFrequency,
} from './_lib/recurringOccurrences.js';
import { findActivePackageForBooking } from '../src/lib/lessonPackageBooking.js';
import { defaultSessionPaymentStatusForStudent } from '../src/lib/studentPaymentModel.js';
import {
  EXTRA_LESSONS_CONTRACT_KIND,
  extraLessonsServiceStartYmd,
  type ExtraLessonsOrderSnapshot,
  type StartWithin14Status,
} from '../src/lib/extraLessonsContract.js';
import { snapshotFromRow } from './_lib/extraLessonsContractShared.js';

const HORIZON_DAYS = 60;
export const MATERIALIZER_BATCH_SIZE = 100;

type RecurringTemplate = {
  id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
  frequency: RecurringFrequency | null;
  meeting_link: string | null;
  topic: string | null;
  price: number | null;
  last_materialized_at: string | null;
};

function ymdInVilnius(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase server configuration' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = new Date();
  const windowStartYmd = ymdInVilnius(now);
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const windowEndYmd = ymdInVilnius(horizon);

  const { data, error } = await supabase
    .from('recurring_individual_sessions')
    .select('id, tutor_id, student_id, subject_id, start_date, end_date, start_time, end_time, frequency, meeting_link, topic, price, last_materialized_at')
    .eq('active', true)
    .is('end_date', null)
    .lte('start_date', windowEndYmd)
    .order('last_materialized_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(MATERIALIZER_BATCH_SIZE);

  if (error) return res.status(500).json({ error: error.message });
  const templates = (data || []) as RecurringTemplate[];
  let created = 0;
  let skipped = 0;

  if (templates.length > 0) {
  const studentIds = [...new Set(templates.map((template) => template.student_id))];
  const subjectIds = [...new Set(templates.map((template) => template.subject_id).filter(Boolean))] as string[];
  const [{ data: studentRows }, { data: subjectRows }] = await Promise.all([
    supabase
      .from('students')
      .select('id, payment_model, detached_at')
      .in('id', studentIds),
    subjectIds.length > 0
      ? supabase.from('subjects').select('id, is_group').in('id', subjectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; is_group: boolean | null }> }),
  ]);
  const paymentModelByStudent = new Map(
    (studentRows || []).map((student: any) => [student.id as string, student.payment_model as string | null]),
  );
  const detachedStudentIds = new Set(
    (studentRows || []).filter((student: any) => student.detached_at != null).map((student: any) => student.id as string),
  );
  const groupSubjectIds = new Set(
    (subjectRows || []).filter((subject: any) => subject.is_group === true).map((subject: any) => subject.id as string),
  );

  for (const template of templates) {
    // Archived (detached) students no longer get new lessons — for anyone.
    if (detachedStudentIds.has(template.student_id)) {
      skipped += 1;
      continue;
    }
    const durationMs = recurringDurationMs(template.start_time, template.end_time);
    if (durationMs <= 0) {
      skipped += 1;
      continue;
    }

    const dates = buildRollingOccurrenceDates(template, windowStartYmd, windowEndYmd);
    if (dates.length === 0) continue;
    const occurrenceStarts = dates.map((date) => wallClockToUtc(date, template.start_time));
    const rangeStart = occurrenceStarts[0]!.toISOString();
    const rangeEnd = new Date(occurrenceStarts.at(-1)!.getTime() + durationMs).toISOString();

    const [{ data: existingRows }, { data: tutorBusyRows }] = await Promise.all([
      supabase
        .from('sessions')
        .select('start_time')
        .eq('recurring_session_id', template.id)
        .gte('start_time', rangeStart)
        .lte('start_time', rangeEnd),
      supabase
        .from('sessions')
        .select('start_time, end_time, subject_id')
        .eq('tutor_id', template.tutor_id)
        .eq('status', 'active')
        .lt('start_time', rangeEnd)
        .gt('end_time', rangeStart),
    ]);

    const existing = new Set((existingRows || []).map((row: any) => new Date(row.start_time).toISOString()));
    const busy = (tutorBusyRows || []).map((row: any) => ({
      start: new Date(row.start_time).getTime(),
      end: new Date(row.end_time).getTime(),
      subjectId: row.subject_id as string | null,
    }));

    const packageMatch = template.subject_id
      ? await findActivePackageForBooking(supabase, {
        studentId: template.student_id,
        subjectId: template.subject_id,
      })
      : null;
    let packageUsed = 0;
    const packageCapacity = packageMatch
      ? Math.max(0, Math.floor(Math.min(
        packageMatch.pkg.available_lessons,
        packageMatch.item.available_lessons,
      )))
      : 0;

    const rows: Array<Record<string, unknown>> = [];
    for (const start of occurrenceStarts) {
      const startIso = start.toISOString();
      if (existing.has(startIso)) continue;
      const end = new Date(start.getTime() + durationMs);
      const overlaps = busy.some((interval) => {
        const overlapsTime = start.getTime() < interval.end && end.getTime() > interval.start;
        const sameGroupSlot =
          !!template.subject_id &&
          groupSubjectIds.has(template.subject_id) &&
          interval.subjectId === template.subject_id &&
          interval.start === start.getTime() &&
          interval.end === end.getTime();
        return overlapsTime && !sameGroupSlot;
      });
      if (overlaps) {
        skipped += 1;
        continue;
      }

      const usesPackage = packageUsed < packageCapacity;
      if (usesPackage) packageUsed += 1;
      rows.push({
        tutor_id: template.tutor_id,
        student_id: template.student_id,
        subject_id: template.subject_id,
        start_time: startIso,
        end_time: end.toISOString(),
        status: 'active',
        meeting_link: template.meeting_link,
        topic: template.topic,
        price: template.price,
        paid: usesPackage,
        payment_status: defaultSessionPaymentStatusForStudent(
          paymentModelByStudent.get(template.student_id) ?? null,
          { paid: false, hasPackage: usesPackage },
        ),
        lesson_package_id: usesPackage ? packageMatch!.pkg.id : null,
        recurring_session_id: template.id,
      });
      busy.push({ start: start.getTime(), end: end.getTime(), subjectId: template.subject_id });
    }

    if (rows.length === 0) continue;
    const { error: insertError } = await supabase.from('sessions').insert(rows);
    if (insertError) {
      console.error('[materialize-recurring-sessions] insert failed', template.id, insertError.message);
      skipped += rows.length;
      continue;
    }
    created += rows.length;

    if (packageMatch && packageUsed > 0) {
      const { error: itemError } = await supabase
        .from('lesson_package_items')
        .update({
          available_lessons: packageMatch.item.available_lessons - packageUsed,
          reserved_lessons: packageMatch.item.reserved_lessons + packageUsed,
        })
        .eq('id', packageMatch.item.id);
      if (!itemError) {
        await supabase
          .from('lesson_packages')
          .update({
            available_lessons: packageMatch.pkg.available_lessons - packageUsed,
            reserved_lessons: packageMatch.pkg.reserved_lessons + packageUsed,
          })
          .eq('id', packageMatch.pkg.id);
      } else {
        console.error('[materialize-recurring-sessions] package item update failed', itemError.message);
      }
    }
  }

  const { error: cursorError } = await supabase
    .from('recurring_individual_sessions')
    .update({ last_materialized_at: new Date().toISOString() })
    .in('id', templates.map((template) => template.id));
  if (cursorError) {
    console.error('[materialize-recurring-sessions] cursor update failed', cursorError.message);
  }
  } // end templates.length > 0

  // School class groups: materialize base sessions for enrolled members.
  let groupCreated = 0;
  const { data: orgsWithGroups } = await supabase
    .from('organizations')
    .select('id, features')
    .contains('features', { school_class_groups: true });
  const extraStartByStudent = new Map<string, string>();
  const { data: extraContracts } = await supabase
    .from('school_contracts')
    .select('student_id, class_group_id, accepted_at, start_within_14_status, start_within_14_days, order_snapshot, withdrawal_requested_at')
    .eq('kind', EXTRA_LESSONS_CONTRACT_KIND)
    .eq('signing_status', 'signed')
    .not('accepted_at', 'is', null);
  for (const row of extraContracts || []) {
    if (row.withdrawal_requested_at) continue;
    const order = snapshotFromRow(row) as ExtraLessonsOrderSnapshot | null;
    if (!order || !row.accepted_at || !row.student_id) continue;
    const ymd = extraLessonsServiceStartYmd({
      status: (row.start_within_14_status || (row.start_within_14_days ? 'yes' : 'no')) as StartWithin14Status,
      acceptedAtIso: row.accepted_at,
      order,
    });
    const key = `${row.student_id}:${row.class_group_id || order.group_id || ''}`;
    extraStartByStudent.set(key, ymd);
  }

  for (const org of orgsWithGroups || []) {
    const { data: groups } = await supabase
      .from('school_class_groups')
      .select('id, tutor_id, subject_id, meeting_link, duration_minutes, school_year_start, school_year_end, slots:school_class_group_slots(*), members:school_class_group_members(student_id)')
      .eq('organization_id', org.id)
      .lte('school_year_start', windowEndYmd)
      .gte('school_year_end', windowStartYmd);
    for (const group of groups || []) {
      const slots = group.slots || [];
      const members = group.members || [];
      if (!slots.length || !members.length) continue;
      for (const slot of slots) {
        // Align template start to the first matching weekday on/after school_year_start.
        const anchor = new Date(`${group.school_year_start}T12:00:00Z`);
        const want = Number(slot.weekday);
        while (anchor.getUTCDay() !== want) {
          anchor.setUTCDate(anchor.getUTCDate() + 1);
        }
        const alignedStart = anchor.toISOString().slice(0, 10);
        const dates = buildRollingOccurrenceDates(
          {
            start_date: alignedStart,
            end_date: group.school_year_end,
            start_time: String(slot.start_time).slice(0, 5),
            end_time: String(slot.end_time).slice(0, 5),
            frequency: 'weekly',
          },
          windowStartYmd,
          windowEndYmd,
        );
        for (const ymd of dates.slice(0, 8)) {
          for (const member of members) {
            const startUtc = wallClockToUtc(ymd, String(slot.start_time).slice(0, 5));
            const endUtc = wallClockToUtc(ymd, String(slot.end_time).slice(0, 5));
            if (!startUtc || !endUtc) continue;
            const { data: existing } = await supabase
              .from('sessions')
              .select('id')
              .eq('tutor_id', group.tutor_id)
              .eq('student_id', member.student_id)
              .eq('start_time', startUtc.toISOString())
              .maybeSingle();
            if (existing) continue;
            const startYmd = ymd;
            const extraGate = extraStartByStudent.get(`${member.student_id}:${group.id}`);
            if (extraGate && startYmd < extraGate) continue;
            const { error: insErr } = await supabase.from('sessions').insert({
              tutor_id: group.tutor_id,
              student_id: member.student_id,
              subject_id: group.subject_id,
              start_time: startUtc.toISOString(),
              end_time: endUtc.toISOString(),
              status: 'active',
              meeting_link: group.meeting_link,
              price: 0,
              school_billing_kind: 'base',
              class_group_id: group.id,
            });
            if (!insErr) groupCreated += 1;
          }
        }
      }
    }
  }

  return res.status(200).json({
    success: true,
    created,
    groupCreated,
    skipped,
    templates: templates.length,
    batchSize: MATERIALIZER_BATCH_SIZE,
    cursorUpdated: templates.length > 0,
  });
}
