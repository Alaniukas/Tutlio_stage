import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('lesson settings email preferences', () => {
  it('uses positive checkbox semantics and keeps tutor-owned preferences saveable', () => {
    const source = readFileSync('src/pages/LessonSettings.tsx', 'utf8');

    expect(source).toContain("checked={!emailOptOut.includes('lesson_reminder_tutor')}");
    expect(source).toContain("checked={!emailOptOut.includes('org_tutor_availability_notice')}");
    expect(source).toContain('Personal email preferences stay editable even when lesson policy is org-managed.');
    expect(source).not.toContain("if (orgName && !orgPolicy.canEditLessonPricing)");
  });
});
