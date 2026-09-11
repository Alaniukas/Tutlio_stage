import { describe, expect, it } from 'vitest';
import { buildConsultationExportRows } from '@/lib/schoolConsultationsExport';

describe('school consultations export', () => {
  it('builds per-student UŠ and help-team summary', () => {
    const rows = buildConsultationExportRows({
      schoolYear: '2026/2027',
      students: [
        { id: 's1', full_name: 'Jonas', grade: '5 klasė', ppt_adapted: true },
      ],
      consultations: [
        { student_id: 's1', kind: 'teacher_subject', school_year: '2026/2027', status: 'occurred', mode: 'individual', charged_minutes: 45, planned_minutes: 45, reserved_minutes: 0 },
        { student_id: 's1', family_key: 'fam1', kind: 'help_team', help_team_category: 'speech', status: 'occurred', outcome: 'occurred' },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].studentName).toBe('Jonas');
    expect(rows[0].usUsed).toBe(45);
    expect(rows[0].speechUsed).toBeGreaterThanOrEqual(1);
  });
});
