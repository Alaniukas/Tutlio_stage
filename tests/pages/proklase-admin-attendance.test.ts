import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pro Klase admin attendance controls', () => {
  it('offers both attended and no-show outcomes in the lesson list and calendar', () => {
    for (const file of [
      'src/pages/company/CompanySessions.tsx',
      'src/pages/company/CompanyTvarkarastis.tsx',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain("t('compSess.markAttended')");
      expect(source).toContain("t('compSess.markNoShow')");
      expect(source).toContain('confirmSessionOutcome({');
    }
  });
});
