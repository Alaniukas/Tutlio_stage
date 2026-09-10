import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('/api/admin-organizations tutor meeting-link contract', () => {
  it('selects the saved profile link and the admin UI renders it as a safe URL', () => {
    const apiSource = readFileSync('api/admin-organizations.ts', 'utf8');
    const adminSource = readFileSync('src/pages/AdminPanel.tsx', 'utf8');

    expect(apiSource).toContain("select('id, full_name, email, phone, personal_meeting_link')");
    expect(adminSource).toContain('personal_meeting_link: string | null');
    expect(adminSource).toContain('href={normalizeUrl(tu.personal_meeting_link) || undefined}');
  });
});
