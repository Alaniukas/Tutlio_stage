import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { previousCalendarMonthVilnius } from '../src/lib/schoolExtraLessonsBilling.js';
import { schoolConsultationsEnabled } from '../src/lib/schoolConsultationsOrg.js';
import {
  buildConsultationFreeLine,
  buildConsultationPaidLine,
  invoiceLinesTotal,
  shouldIssueInvoice,
  type MonthlyInvoiceLineInput,
} from '../src/lib/schoolMonthlyInvoiceLines.js';
import { HELP_TEAM_CATEGORY_I18N, type HelpTeamCategory } from '../src/lib/schoolHelpTeamQuota.js';

const HELP_LABEL: Record<HelpTeamCategory, string> = {
  speech: 'Logopedė',
  psychologist: 'Psichologė',
  special_pedagogue: 'Spec. pedagogė',
  additional_help: 'Papildoma pagalba',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { start, end } = previousCalendarMonthVilnius();
  const periodStartIso = `${start}T00:00:00.000Z`;
  const periodEndIso = `${end}T23:59:59.999Z`;

  const { data: orgs } = await supabase.from('organizations').select('id, features').eq('entity_type', 'school');
  let created = 0;
  let skipped = 0;

  for (const org of orgs || []) {
    if (!schoolConsultationsEnabled(org.id, (org.features || {}) as Record<string, unknown>)) continue;

    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, grade, payer_email, payer_name')
      .eq('organization_id', org.id)
      .eq('enrollment_status', 'active');

    for (const student of students || []) {
      const { data: existing } = await supabase
        .from('school_monthly_invoices')
        .select('id')
        .eq('student_id', student.id)
        .eq('period_start', start)
        .is('contract_id', null)
        .maybeSingle();
      if (existing) {
        skipped += 1;
        continue;
      }

      const { data: consultations } = await supabase
        .from('school_consultations')
        .select('id, kind, status, outcome, is_paid, price_eur, help_team_category, mode, start_time, tutor:profiles!school_consultations_tutor_id_fkey(full_name), subject:subjects(name)')
        .eq('student_id', student.id)
        .gte('start_time', periodStartIso)
        .lte('start_time', periodEndIso)
        .in('status', ['occurred', 'no_show', 'confirmed']);

      const lines: MonthlyInvoiceLineInput[] = [];
      for (const c of consultations || []) {
        if (c.status !== 'occurred' && c.outcome !== 'occurred' && c.status !== 'no_show') continue;
        const tutorName = (c.tutor as { full_name?: string } | null)?.full_name || '';
        if (c.kind === 'teacher_subject') {
          const subj = (c.subject as { name?: string } | null)?.name || 'Konsultacija';
          lines.push(buildConsultationFreeLine(`${subj} - mokytojas ${tutorName}`));
        } else if (c.kind === 'help_team' && c.is_paid) {
          const cat = String(c.help_team_category || '') as HelpTeamCategory;
          const label = `Pagalbos komanda, ${HELP_LABEL[cat] || cat} ${tutorName}`.trim();
          lines.push({
            ...buildConsultationPaidLine(label, Number(c.price_eur) || 0, 1),
            consultationId: c.id,
          });
        } else if (c.kind === 'help_team') {
          const cat = String(c.help_team_category || '') as HelpTeamCategory;
          const label = `Pagalbos komanda, ${HELP_LABEL[cat] || cat} ${tutorName}`.trim();
          lines.push(buildConsultationFreeLine(label));
        }
      }

      if (!shouldIssueInvoice(lines)) {
        skipped += 1;
        continue;
      }

      const total = invoiceLinesTotal(lines);
      const due = new Date(`${end}T12:00:00Z`);
      due.setUTCDate(due.getUTCDate() + 7);

      const pamNum = `PAM-${start.slice(0, 4)}-${String(student.id).slice(0, 8)}-${start.slice(5, 7)}`;

      const { data: inv, error: insErr } = await supabase
        .from('school_monthly_invoices')
        .insert({
          organization_id: org.id,
          contract_id: null,
          student_id: student.id,
          period_start: start,
          period_end: end,
          unit_price_eur: 0,
          base_lessons: 0,
          base_amount_eur: 0,
          extra_lessons: 0,
          extra_amount_eur: 0,
          total_eur: total,
          extra_session_ids: [],
          payment_status: total > 0 ? 'pending' : 'paid',
          due_date: due.toISOString().slice(0, 10),
          invoice_number: pamNum,
        })
        .select('id')
        .single();

      if (insErr || !inv) {
        console.error('[bill-school-monthly]', insErr?.message);
        skipped += 1;
        continue;
      }

      const lineRows = lines.map((l, i) => ({
        invoice_id: inv.id,
        sort_order: i,
        description: l.description,
        unit_price_eur: l.unitPriceEur,
        quantity: l.quantity,
        amount_eur: l.amountEur,
        source: l.source,
        consultation_id: l.consultationId || null,
        session_id: l.sessionId || null,
      }));
      await supabase.from('school_monthly_invoice_lines').insert(lineRows);
      created += 1;
    }
  }

  return res.status(200).json({ success: true, created, skipped, period: { start, end } });
}
