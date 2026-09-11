import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('organization administrator individual lesson deletion UI', () => {
  it('exposes the permission-gated action in the school schedule', () => {
    const src = readFileSync('src/pages/company/CompanyTvarkarastis.tsx', 'utf8');

    expect(src).toContain('isSchoolOrgView && !cancelConfirmOpen && canDeleteSelectedEvent');
    expect(src).toContain('onClick={() => void handleHardDeleteScheduleSession()}');
  });

  it('uses the same individual-lesson guard in the lesson list', () => {
    const src = readFileSync('src/pages/company/CompanySessions.tsx', 'utf8');

    expect(src).toContain('const canDeleteSelectedSession = canDeleteIndividualOrgSession(');
    expect(src).toContain('onClick={() => void handleHardDeleteCompanySession()}');
  });
});
