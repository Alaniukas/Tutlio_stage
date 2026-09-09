/** Annual UŠ consultation limits in minutes by education program. */

export const US_LIMIT_PREPRIMARY_MIN = 1080;
export const US_LIMIT_PRIMARY_MIN = 1920;
export const US_LIMIT_BASIC_MIN = 4560;

export type ConsultationProgram = 'preprimary' | 'primary' | 'basic' | 'none';

/** Parse grade for consultation limits — includes 0 klasė / priešmokyklinė. */
export function parseConsultationGrade(grade: string | null | undefined): number | null {
  const raw = String(grade ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('priešmok') || raw === '0' || raw.startsWith('0 ')) return 0;
  const match = raw.match(/\d{1,2}/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isInteger(n) || n < 0 || n > 12) return null;
  return n;
}

export function consultationProgramFromGrade(grade: string | null | undefined): ConsultationProgram {
  const g = parseConsultationGrade(grade);
  if (g === null) return 'none';
  if (g === 0) return 'preprimary';
  if (g >= 1 && g <= 4) return 'primary';
  if (g >= 5 && g <= 10) return 'basic';
  return 'none';
}

export function annualUsLimitMinutes(grade: string | null | undefined): number | null {
  const program = consultationProgramFromGrade(grade);
  switch (program) {
    case 'preprimary':
      return US_LIMIT_PREPRIMARY_MIN;
    case 'primary':
      return US_LIMIT_PRIMARY_MIN;
    case 'basic':
      return US_LIMIT_BASIC_MIN;
    default:
      return null;
  }
}
