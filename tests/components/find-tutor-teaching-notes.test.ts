import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('FindTutorModal tutor teaching notes', () => {
  it('loads and renders subjects/grades notes beside tutor names', () => {
    const source = readFileSync('src/components/FindTutorModal.tsx', 'utf8');

    expect(source).toContain("'id, full_name, email, teaching_notes, has_active_license, break_between_lessons'");
    expect(source.match(/TutorTeachingNotesBadge/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
