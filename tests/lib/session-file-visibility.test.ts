import { describe, expect, it } from 'vitest';
import {
  isHomeworkSubmissionFile,
  studentMaySeeGroupFile,
} from '@/lib/sessionFileVisibility';

describe('sessionFileVisibility', () => {
  it('shares teacher materials across group folders', () => {
    expect(isHomeworkSubmissionFile('uzduotys.pdf')).toBe(false);
    expect(studentMaySeeGroupFile('uzduotys.pdf', 'classmate-session', 'mine')).toBe(true);
  });

  it('hides a classmate homework submission from the student', () => {
    expect(isHomeworkSubmissionFile('nd-gabija-atsakymai.pdf')).toBe(true);
    expect(studentMaySeeGroupFile('nd-gabija-atsakymai.pdf', 'classmate-session', 'mine')).toBe(false);
    expect(studentMaySeeGroupFile('nd-lukas-atsakymai.pdf', 'mine', 'mine')).toBe(true);
  });
});
