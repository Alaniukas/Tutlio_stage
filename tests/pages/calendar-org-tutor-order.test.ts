import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * Regression: commit 6f8529b introduced hideProKlaseOrgTutorCancel BEFORE useUser(),
 * causing ReferenceError (TDZ) once useOrgTutorPolicy set isOrgTutor=true — only org
 * tutors (e.g. Pro Klasė) hit the second operand; solo tutors short-circuited safely.
 */
describe('Calendar org tutor hook order', () => {
  it('declares useUser() before hideProKlaseOrgTutorCancel', () => {
    const src = readFileSync('src/pages/Calendar.tsx', 'utf8');
    const useUserIdx = src.indexOf('const { user: ctxUser, profile: ctxProfile } = useUser()');
    const hideIdx = src.indexOf('const hideProKlaseOrgTutorCancel');
    expect(useUserIdx).toBeGreaterThan(-1);
    expect(hideIdx).toBeGreaterThan(-1);
    expect(useUserIdx).toBeLessThan(hideIdx);
  });
});
