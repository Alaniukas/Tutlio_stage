import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('organization administrator lesson deletion UI', () => {
  it('exposes the permission-gated action in school and company schedules', () => {
    const src = readFileSync('src/pages/company/CompanyTvarkarastis.tsx', 'utf8');

    expect(src).toContain('!cancelConfirmOpen && canDeleteSelectedEvent');
    expect(src).toContain('onClick={() => void handleHardDeleteScheduleSession()}');
  });

  it('uses the same permission guard in the lesson list', () => {
    const src = readFileSync('src/pages/company/CompanySessions.tsx', 'utf8');

    expect(src).toContain('const canDeleteSelectedSession = canDeleteOrgSession(');
    expect(src).toContain('onClick={() => void handleHardDeleteCompanySession()}');
  });
});
