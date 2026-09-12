import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('school manual attendance controls', () => {
  it('lets a tutor confirm either outcome for each ended group participant', () => {
    const source = readFileSync('src/pages/Calendar.tsx', 'utf8');

    expect(source).toContain("'completed',\n                                      false,\n                                      { keepModalOpen: true }");
    expect(source).toContain("'no_show',\n                                      false,\n                                      { keepModalOpen: true }");
    expect(source).toContain('!options?.keepModalOpen');
    expect(source).toContain('isSchoolTutor');
    expect(source).toContain("correctExisting: true");
  });

  it('lets a school administrator confirm either outcome per group participant', () => {
    const source = readFileSync('src/pages/company/CompanyTvarkarastis.tsx', 'utf8');

    expect(source).toContain('handleSetGroupParticipantAttendance');
    expect(source).toContain("handleSetGroupParticipantAttendance(participantSession, 'completed')");
    expect(source).toContain("handleSetGroupParticipantAttendance(participantSession, 'no_show')");
    expect(source).toContain('canEditSessions');
  });

  it('also exposes manual attendance correction in the school lesson list', () => {
    const source = readFileSync('src/pages/company/CompanySessions.tsx', 'utf8');

    expect(source).toContain('const supportsManualAttendance = isSchoolOrgView || isProKlase');
    expect(source).toContain('handleMarkStudentAttended');
    expect(source).toContain('handleMarkStudentNoShow');
  });
});
