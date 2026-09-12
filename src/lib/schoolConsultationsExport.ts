import { annualUsLimitMinutes } from './schoolConsultationLimits.js';
import { computeUsBalance } from './schoolConsultationBalance.js';
import { familyHelpTeamQuota, computeHelpTeamQuota, HELP_TEAM_CATEGORY_I18N, type HelpTeamCategory } from './schoolHelpTeamQuota.js';

export type ConsultationExportRow = {
  studentName: string;
  grade: string;
  usLimit: number | string;
  usUsed: number;
  usReserved: number;
  usRemaining: number | string;
  speechUsed: number;
  speechQuota: number;
  psychologistUsed: number;
  psychologistQuota: number;
  specialPedagogueUsed: number;
  specialPedagogueQuota: number;
  additionalHelpUsed: number;
  additionalHelpQuota: number;
  paidHelpVisits: number;
  lateCancels: number;
};

const CATEGORIES: HelpTeamCategory[] = ['speech', 'psychologist', 'special_pedagogue', 'additional_help'];

export function buildConsultationExportRows(input: {
  students: Array<{
    id: string;
    full_name: string;
    grade?: string | null;
    ppt_adapted?: boolean | null;
    ppt_individualized?: boolean | null;
  }>;
  consultations: Array<Record<string, unknown>>;
  schoolYear: string;
}): ConsultationExportRow[] {
  const familyQuota = familyHelpTeamQuota(input.students);
  return input.students.map((st) => {
    const limit = annualUsLimitMinutes(st.grade);
    const usRows = input.consultations.filter(
      (c) => c.student_id === st.id && c.kind === 'teacher_subject' && c.school_year === input.schoolYear,
    );
    const bal = computeUsBalance({ annualLimit: limit, consultations: usRows as any });
    const familyKey = (input.consultations.find((c) => c.student_id === st.id) as any)?.family_key;
    const htRows = input.consultations.filter(
      (c) => c.kind === 'help_team' && (c.student_id === st.id || (familyKey && c.family_key === familyKey)),
    );
    const catStats: Record<string, ReturnType<typeof computeHelpTeamQuota>> = {};
    for (const cat of CATEGORIES) {
      catStats[cat] = computeHelpTeamQuota({ quota: familyQuota, category: cat, consultations: htRows as any });
    }
    const paidHelp = htRows.filter((c) => c.is_paid && (c.status === 'occurred' || c.outcome === 'occurred')).length;
    const lateCancels = htRows.filter((c) => c.late_cancel).length;
    return {
      studentName: st.full_name,
      grade: st.grade || '',
      usLimit: limit ?? '—',
      usUsed: bal.usedMinutes,
      usReserved: bal.reservedMinutes,
      usRemaining: bal.remainingMinutes ?? '—',
      speechUsed: catStats.speech.used + catStats.speech.reserved,
      speechQuota: catStats.speech.quota,
      psychologistUsed: catStats.psychologist.used + catStats.psychologist.reserved,
      psychologistQuota: catStats.psychologist.quota,
      specialPedagogueUsed: catStats.special_pedagogue.used + catStats.special_pedagogue.reserved,
      specialPedagogueQuota: catStats.special_pedagogue.quota,
      additionalHelpUsed: catStats.additional_help.used + catStats.additional_help.reserved,
      additionalHelpQuota: catStats.additional_help.quota,
      paidHelpVisits: paidHelp,
      lateCancels,
    };
  });
}

export function consultationExportHeaders(t: (key: string) => string): string[] {
  return [
    t('compStu.student'),
    t('compStu.grade'),
    t('schoolConsult.balance.limit'),
    t('schoolConsult.balance.used'),
    t('schoolConsult.balance.reserved'),
    t('schoolConsult.balance.remaining'),
    t(HELP_TEAM_CATEGORY_I18N.speech),
    t(HELP_TEAM_CATEGORY_I18N.psychologist),
    t(HELP_TEAM_CATEGORY_I18N.special_pedagogue),
    t(HELP_TEAM_CATEGORY_I18N.additional_help),
    'Mokamos PK',
    'Vėlyvi atšaukimai',
  ];
}
