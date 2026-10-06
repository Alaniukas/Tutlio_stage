import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CompanyTvarkarastis tutor teaching notes', () => {
  it('loads teaching_notes and shows badges in Pro Klasė schedule tutor filter', () => {
    const source = readFileSync('src/pages/company/CompanyTvarkarastis.tsx', 'utf8');

    expect(source).toContain(
      "'id, full_name, email, has_active_license, personal_meeting_link, break_between_lessons, teaching_notes'",
    );
    expect(source).toContain('isProKlase && <TutorTeachingNotesBadge notes={tutor.teaching_notes} />');
  });
});
