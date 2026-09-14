import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/company/CompanySessions.tsx', 'utf8');

describe('school session monitoring completeness', () => {
  it('uses the full stats query rather than the first paginated list page', () => {
    expect(source).toContain('<SchoolSessionMonitoring sessions={schoolMonitoringSessions} />');
    expect(source).not.toContain('<SchoolSessionMonitoring sessions={filtered} />');
  });

  it('loads the group and pupil identity fields needed by the monitoring aggregate', () => {
    expect(source).toContain("'id, tutor_id, student_id, class_group_id, subject_id, status");
    expect(source).toContain('student:students(full_name)');
  });
});
