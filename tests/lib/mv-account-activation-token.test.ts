import { describe, expect, it } from 'vitest';
import {
  buildMvAccountActivationToken,
  buildMvLoginUrl,
  verifyMvAccountActivationToken,
} from '../../api/_lib/mvAccountActivationToken.js';

describe('mvAccountActivationToken', () => {
  const secret = 'test-secret-for-mv-activation';

  it('builds and verifies parent activation token', () => {
    const token = buildMvAccountActivationToken(
      { studentId: 'student-1', role: 'parent', email: 'Parent@Example.com', ttlMs: 60_000 },
      secret,
    );
    const verified = verifyMvAccountActivationToken(token, secret);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.studentId).toBe('student-1');
      expect(verified.payload.role).toBe('parent');
      expect(verified.payload.email).toBe('parent@example.com');
    }
  });

  it('builds login url with portal and email', () => {
    const url = buildMvLoginUrl('https://tutlio.lt', 'student@example.com', 'student');
    expect(url).toContain('/login?');
    expect(url).toContain('email=student%40example.com');
    expect(url).toContain('portal=student');
    expect(url).toContain('mvActivated=1');
  });
});
