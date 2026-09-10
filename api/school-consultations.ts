import type { VercelRequest, VercelResponse } from './types';
import {
  assertOrgConsultationsEnabled,
  isOrgAdminForOrg,
  linkedStudentIdsForUser,
  requireConsultationsAuth,
  serviceSupabase,
  studentHasSignedAnnualContract,
} from './_lib/schoolConsultationsAccess.js';
import { consultationSchoolYear, isConsultationSeason } from '../src/lib/schoolConsultationYear.js';
import { annualUsLimitMinutes } from '../src/lib/schoolConsultationLimits.js';
import { computeUsBalance } from '../src/lib/schoolConsultationBalance.js';
import { consultationFamilyKey } from '../src/lib/schoolConsultationFamily.js';
import { canActWithoutParent } from '../src/lib/schoolConsultationAge.js';
import { cancelEffect, isLateCancellation } from '../src/lib/schoolConsultationCancel.js';
import {
  cannotExceedIndividualUs,
  groupUsChargeMinutes,
} from '../src/lib/schoolConsultationBalance.js';
import {
  computeHelpTeamQuota,
  familyHelpTeamQuota,
  helpTeamPriceEur,
  type HelpTeamCategory,
} from '../src/lib/schoolHelpTeamQuota.js';

type Body = Record<string, unknown>;

function body(req: VercelRequest): Body {
  return (req.body && typeof req.body === 'object' ? req.body : {}) as Body;
}

function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}

async function loadUsBalance(
  supabase: ReturnType<typeof serviceSupabase>,
  studentId: string,
  grade: string | null,
  schoolYear: string,
) {
  const limit = annualUsLimitMinutes(grade);
  const { data: rows } = await supabase
    .from('school_consultations')
    .select('status, mode, planned_minutes, reserved_minutes, charged_minutes, start_time, outcome')
    .eq('student_id', studentId)
    .eq('kind', 'teacher_subject')
    .eq('school_year', schoolYear);
  return computeUsBalance({ annualLimit: limit, consultations: rows || [] });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireConsultationsAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const supabase = serviceSupabase();
  const userId = auth.userId;

  if (req.method === 'GET') {
    const scope = String(req.query?.scope || 'portal');
    const organizationId = String(req.query?.organization_id || '').trim();

    if (scope === 'portal') {
      const studentIds = await linkedStudentIdsForUser(supabase, userId);
      if (!studentIds.length) return res.status(200).json({ ok: true, students: [], requests: [], consultations: [] });

      const { data: students } = await supabase
        .from('students')
        .select('id, full_name, grade, child_birth_date, organization_id, payer_name, payer_email, payer_personal_code, ppt_adapted, ppt_individualized')
        .in('id', studentIds);

      const orgIds = [...new Set((students || []).map((s) => s.organization_id).filter(Boolean))];
      for (const oid of orgIds) {
        const gate = await assertOrgConsultationsEnabled(supabase, oid);
        if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });
      }

      const eligible: string[] = [];
      for (const st of students || []) {
        if (await studentHasSignedAnnualContract(supabase, st.id)) eligible.push(st.id);
      }

      const schoolYear = consultationSchoolYear() || '';
      const [{ data: requests }, { data: consultations }] = await Promise.all([
        supabase
          .from('school_consultation_requests')
          .select('*, subject:subjects(name)')
          .in('student_id', eligible)
          .order('created_at', { ascending: false }),
        supabase
          .from('school_consultations')
          .select('*, tutor:profiles!school_consultations_tutor_id_fkey(full_name), subject:subjects(name)')
          .in('student_id', eligible)
          .order('start_time', { ascending: false, nullsFirst: false }),
      ]);

      const balances: Record<string, ReturnType<typeof computeUsBalance>> = {};
      for (const st of students || []) {
        if (!eligible.includes(st.id) || !schoolYear) continue;
        balances[st.id] = await loadUsBalance(supabase, st.id, st.grade, schoolYear);
      }

      const familyStudents = (students || []).filter((s) => eligible.includes(s.id));
      const familyQuota = familyHelpTeamQuota(familyStudents);
      const familyKey = familyStudents[0] ? consultationFamilyKey(familyStudents[0]) : null;
      let helpQuotas: Record<string, ReturnType<typeof computeHelpTeamQuota>> = {};
      if (familyKey && schoolYear && organizationId) {
        const { data: htRows } = await supabase
          .from('school_consultations')
          .select('help_team_category, status, outcome, is_paid, late_cancel, mode, start_time')
          .eq('organization_id', organizationId)
          .eq('family_key', familyKey)
          .eq('school_year', schoolYear)
          .eq('kind', 'help_team');
        for (const cat of ['speech', 'psychologist', 'special_pedagogue', 'additional_help'] as HelpTeamCategory[]) {
          helpQuotas[cat] = computeHelpTeamQuota({
            quota: familyQuota,
            category: cat,
            consultations: htRows || [],
          });
        }
      }

      const { data: specialists } = organizationId
        ? await supabase
          .from('profiles')
          .select('id, full_name, help_team_category')
          .eq('organization_id', organizationId)
          .not('help_team_category', 'is', null)
        : { data: [] };

      return res.status(200).json({
        ok: true,
        schoolYear,
        inSeason: isConsultationSeason(),
        students: students || [],
        eligibleStudentIds: eligible,
        requests: requests || [],
        consultations: consultations || [],
        balances,
        familyQuota,
        helpQuotas,
        specialists: specialists || [],
      });
    }

    if (!organizationId) return res.status(400).json({ error: 'Trūksta organization_id.' });
    const gate = await assertOrgConsultationsEnabled(supabase, organizationId);
    if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });

    const isAdmin = await isOrgAdminForOrg(supabase, userId, organizationId);
    const schoolYear = String(req.query?.school_year || consultationSchoolYear() || '');

    let requestsQuery = supabase
      .from('school_consultation_requests')
      .select('*, student:students(full_name, grade), subject:subjects(name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    let consultQuery = supabase
      .from('school_consultations')
      .select('*, student:students(full_name, grade), tutor:profiles!school_consultations_tutor_id_fkey(full_name)')
      .eq('organization_id', organizationId)
      .order('start_time', { ascending: false, nullsFirst: false });

    if (schoolYear) {
      requestsQuery = requestsQuery.eq('school_year', schoolYear);
      consultQuery = consultQuery.eq('school_year', schoolYear);
    }

    if (!isAdmin) {
      requestsQuery = requestsQuery.eq('status', 'submitted');
      consultQuery = consultQuery.eq('tutor_id', userId);
    }

    const [{ data: requests }, { data: consultations }] = await Promise.all([requestsQuery, consultQuery]);
    return res.status(200).json({ ok: true, requests: requests || [], consultations: consultations || [] });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = body(req);
  const action = String(b.action || '');

  if (action === 'need') {
    const studentId = String(b.student_id || '');
    const { data: student } = await supabase
      .from('students')
      .select('id, organization_id, grade, child_birth_date, payer_name, payer_email, payer_phone, linked_user_id')
      .eq('id', studentId)
      .maybeSingle();
    if (!student) return res.status(404).json({ error: 'Mokinys nerastas.' });
    const gate = await assertOrgConsultationsEnabled(supabase, student.organization_id);
    if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });
    if (!isConsultationSeason()) return res.status(400).json({ error: 'Konsultacijos nevyksta liepos–rugpjūčio mėn.' });
    if (!(await studentHasSignedAnnualContract(supabase, studentId))) {
      return res.status(403).json({ error: 'Reikia pasirašytos metinės sutarties.' });
    }
    const linked = await linkedStudentIdsForUser(supabase, userId);
    const isSelf = student.linked_user_id === userId;
    const isParent = linked.includes(studentId);
    if (!isParent && !(isSelf && canActWithoutParent(student.child_birth_date))) {
      return res.status(403).json({ error: 'Neturite teisės pateikti poreikio.' });
    }
    const schoolYear = consultationSchoolYear();
    if (!schoolYear) return res.status(400).json({ error: 'Ne mokslo metų sezonas.' });

    const { data: row, error } = await supabase
      .from('school_consultation_requests')
      .insert({
        organization_id: student.organization_id,
        student_id: studentId,
        subject_id: b.subject_id || null,
        grade_snapshot: student.grade,
        topic: String(b.topic || '').trim(),
        preferred_times: b.preferred_times || [],
        contact_snapshot: {
          payer_name: student.payer_name,
          payer_email: student.payer_email,
          payer_phone: student.payer_phone,
          ...(b.contact_snapshot && typeof b.contact_snapshot === 'object'
            ? b.contact_snapshot as Record<string, unknown>
            : {}),
        },
        status: 'submitted',
        school_year: schoolYear,
        created_by_user_id: userId,
      })
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, requestId: row.id });
  }

  if (action === 'propose') {
    const organizationId = String(b.organization_id || '');
    const gate = await assertOrgConsultationsEnabled(supabase, organizationId);
    if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });

    const isAdmin = await isOrgAdminForOrg(supabase, userId, organizationId);
    const tutorId = String(b.tutor_id || userId);
    if (!isAdmin && tutorId !== userId) return res.status(403).json({ error: 'Forbidden' });

    const mode = String(b.mode || 'individual') as 'individual' | 'group' | 'join_lesson';
    const requestIds = Array.isArray(b.request_ids) ? b.request_ids.map(String) : [String(b.request_id || '')].filter(Boolean);
    const startTime = String(b.start_time || '');
    const endTime = String(b.end_time || '');
    const sessionId = b.session_id ? String(b.session_id) : null;
    const planned = minutesBetween(startTime, endTime) || Number(b.planned_minutes) || 45;

    const { data: requests } = await supabase
      .from('school_consultation_requests')
      .select('id, student_id, organization_id, school_year, student:students(grade)')
      .in('id', requestIds)
      .eq('organization_id', organizationId);

    if (!requests?.length) return res.status(404).json({ error: 'Poreikis nerastas.' });

    const created: string[] = [];
    for (const reqRow of requests) {
      const grade = (reqRow as any).student?.grade || null;
      const balance = await loadUsBalance(supabase, reqRow.student_id, grade, reqRow.school_year);
      if (cannotExceedIndividualUs(balance.remainingMinutes, planned, mode)) {
        return res.status(400).json({ error: 'Šiam laikui liko per mažai minučių.' });
      }
      const reserved = mode === 'individual' ? planned : groupUsChargeMinutes(balance.remainingMinutes, planned);
      const { data: st } = await supabase.from('students').select('payer_personal_code, payer_email').eq('id', reqRow.student_id).maybeSingle();
      const { data: cRow, error: cErr } = await supabase
        .from('school_consultations')
        .insert({
          organization_id: organizationId,
          kind: 'teacher_subject',
          status: 'awaiting_parent_confirm',
          student_id: reqRow.student_id,
          family_key: st ? consultationFamilyKey(st) : null,
          request_id: reqRow.id,
          tutor_id: tutorId,
          mode,
          session_id: sessionId,
          start_time: startTime,
          end_time: endTime,
          planned_minutes: planned,
          reserved_minutes: reserved,
          school_year: reqRow.school_year,
          proposed_by: userId,
          proposed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (cErr) return res.status(500).json({ error: cErr.message });
      created.push(cRow.id);
      await supabase.from('school_consultation_requests').update({ status: 'awaiting_parent_confirm' }).eq('id', reqRow.id);
    }
    return res.status(200).json({ ok: true, consultationIds: created });
  }

  if (action === 'confirm' || action === 'reject') {
    const consultationId = String(b.consultation_id || '');
    const { data: row } = await supabase
      .from('school_consultations')
      .select('*, student:students(child_birth_date, linked_user_id)')
      .eq('id', consultationId)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: 'Nerasta.' });
    const linked = await linkedStudentIdsForUser(supabase, userId);
    const st = (row as any).student;
    const isSelf = st?.linked_user_id === userId;
    const isParent = linked.includes(row.student_id);
    if (!isParent && !(isSelf && canActWithoutParent(st?.child_birth_date))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (action === 'reject') {
      await supabase.from('school_consultations').update({
        status: 'cancelled_parent',
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        outcome: 'cancelled',
      }).eq('id', consultationId);
      return res.status(200).json({ ok: true });
    }
    await supabase.from('school_consultations').update({
      status: 'confirmed',
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    }).eq('id', consultationId);
    return res.status(200).json({ ok: true });
  }

  if (action === 'cancel') {
    const consultationId = String(b.consultation_id || '');
    const { data: row } = await supabase.from('school_consultations').select('*').eq('id', consultationId).maybeSingle();
    if (!row || !row.start_time) return res.status(404).json({ error: 'Nerasta.' });
    const late = isLateCancellation(row.start_time);
    const effect = cancelEffect({
      kind: row.kind as 'teacher_subject' | 'help_team',
      mode: row.mode,
      isPaid: Boolean(row.is_paid),
      startTimeIso: row.start_time,
    });
    const cancelledBy = String(b.as || 'parent');
    const status = cancelledBy === 'parent' ? 'cancelled_parent' : 'cancelled_staff';
    const updates: Record<string, unknown> = {
      status,
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      late_cancel: late,
      outcome: 'cancelled',
    };
    if (effect === 'charge_individual_us' && row.kind === 'teacher_subject') {
      updates.charged_minutes = row.planned_minutes;
      updates.outcome = 'no_show';
    }
    await supabase.from('school_consultations').update(updates).eq('id', consultationId);
    return res.status(200).json({ ok: true, effect });
  }

  if (action === 'outcome') {
    const consultationId = String(b.consultation_id || '');
    const outcome = String(b.outcome || '');
    const { data: row } = await supabase.from('school_consultations').select('*').eq('id', consultationId).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Nerasta.' });
    if (row.tutor_id !== userId && !(await isOrgAdminForOrg(supabase, userId, row.organization_id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const actual = Number(b.actual_minutes) || row.planned_minutes || 0;
    let charged = 0;
    if (outcome === 'occurred') {
      if (row.kind === 'teacher_subject') {
        const { data: st } = await supabase.from('students').select('grade').eq('id', row.student_id).maybeSingle();
        const balance = await loadUsBalance(supabase, row.student_id, st?.grade || null, row.school_year);
        charged = row.mode === 'individual'
          ? Math.min(actual, balance.remainingMinutes ?? actual)
          : groupUsChargeMinutes(balance.remainingMinutes, actual);
      }
    } else if (outcome === 'no_show' && row.mode === 'individual') {
      charged = row.planned_minutes || 0;
    }
    await supabase.from('school_consultations').update({
      status: outcome === 'occurred' ? 'occurred' : outcome === 'no_show' ? 'no_show' : 'cancelled_staff',
      outcome,
      actual_minutes: actual,
      charged_minutes: charged,
    }).eq('id', consultationId);
    return res.status(200).json({ ok: true });
  }

  if (action === 'book_help') {
    const organizationId = String(b.organization_id || '');
    const gate = await assertOrgConsultationsEnabled(supabase, organizationId);
    if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });
    if (!isConsultationSeason()) return res.status(400).json({ error: 'Konsultacijos nevyksta liepos–rugpjūčio mėn.' });

    const studentId = String(b.student_id || '');
    const specialistId = String(b.tutor_id || '');
    const category = String(b.help_team_category || '') as HelpTeamCategory;
    const startTime = String(b.start_time || '');
    const endTime = String(b.end_time || '');
    const audienceNote = String(b.audience_note || '').trim();
    const payAck = Boolean(b.pay_ack);

    const { data: student } = await supabase
      .from('students')
      .select('id, organization_id, grade, child_birth_date, linked_user_id, payer_personal_code, payer_email, ppt_adapted, ppt_individualized')
      .eq('id', studentId)
      .maybeSingle();
    if (!student) return res.status(404).json({ error: 'Mokinys nerastas.' });
    const linked = await linkedStudentIdsForUser(supabase, userId);
    const isSelf = student.linked_user_id === userId;
    const isParent = linked.includes(studentId);
    if (!isParent && !(isSelf && canActWithoutParent(student.child_birth_date))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!(await studentHasSignedAnnualContract(supabase, studentId))) {
      return res.status(403).json({ error: 'Reikia pasirašytos metinės sutarties.' });
    }

    const schoolYear = consultationSchoolYear();
    if (!schoolYear) return res.status(400).json({ error: 'Ne mokslo metų sezonas.' });

    const { data: siblings } = await supabase
      .from('students')
      .select('ppt_adapted, ppt_individualized')
      .eq('organization_id', organizationId)
      .or(`payer_personal_code.eq.${student.payer_personal_code || '___'},payer_email.ilike.${student.payer_email || '___'}`);
    const quota = familyHelpTeamQuota(siblings?.length ? siblings : [student]);
    const familyKey = consultationFamilyKey(student);

    const { data: htRows } = await supabase
      .from('school_consultations')
      .select('help_team_category, status, outcome, is_paid, late_cancel, mode, start_time')
      .eq('organization_id', organizationId)
      .eq('family_key', familyKey)
      .eq('school_year', schoolYear)
      .eq('kind', 'help_team');

    const catQuota = computeHelpTeamQuota({ quota, category, consultations: htRows || [] });
    const planned = minutesBetween(startTime, endTime) || 45;
    const isPaid = catQuota.nextIsPaid;

    if (isPaid && !payAck) return res.status(400).json({ error: 'Reikia patvirtinti užsakymą su prievole sumokėti.' });

    const { data: org } = await supabase.from('organizations').select('features').eq('id', organizationId).maybeSingle();
    const features = (org?.features || {}) as Record<string, unknown>;
    const hourly = Number(features.specialist_hourly_rate_eur) || 0;
    const price = isPaid ? helpTeamPriceEur(planned, hourly) : 0;

    const { data: created, error } = await supabase
      .from('school_consultations')
      .insert({
        organization_id: organizationId,
        kind: 'help_team',
        status: 'confirmed',
        student_id: studentId,
        family_key: familyKey,
        tutor_id: specialistId,
        help_team_category: category,
        audience_note: audienceNote,
        mode: 'individual',
        start_time: startTime,
        end_time: endTime,
        planned_minutes: planned,
        is_paid: isPaid,
        price_eur: price,
        paid_ack_at: isPaid ? new Date().toISOString() : null,
        paid_ack_by: isPaid ? userId : null,
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
        school_year: schoolYear,
      })
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, consultationId: created.id, isPaid, priceEur: price });
  }

  return res.status(400).json({ error: 'Nežinomas veiksmas.' });
}
