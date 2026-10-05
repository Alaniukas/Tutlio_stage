import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('lesson settings email preferences', () => {
  it('uses positive checkbox semantics and keeps tutor-owned preferences saveable', () => {
    const source = readFileSync('src/pages/LessonSettings.tsx', 'utf8');

    expect(source).toContain('to="/settings#notifications"');
    expect(source).not.toContain('patch.email_notification_opt_out');
    expect(source).toContain('Personal email preferences stay editable even when lesson policy is org-managed.');
    expect(source).not.toContain("if (orgName && !orgPolicy.canEditLessonPricing)");
  });
});
