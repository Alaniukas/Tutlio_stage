import { describe, it, expect } from 'vitest';

/** Mirrors StudentOnboarding mapRegisterStudentError logic */
function mapRegisterStudentError(
  body: { error?: string; code?: string },
  fallback: string,
  emailAlready: string,
) {
  if (body?.code === 'email_already_registered') {
    return emailAlready;
  }
  if (body?.code === 'create_user_failed' && body?.error) {
    return body.error;
  }
  return body?.error || fallback;
}

describe('registration error mapping', () => {
  it('maps email_already_registered code to dedicated message', () => {
    expect(
      mapRegisterStudentError(
        { code: 'email_already_registered', error: 'raw' },
        'fallback',
        'already',
      ),
    ).toBe('already');
  });

  it('passes through create_user_failed detail', () => {
    expect(
      mapRegisterStudentError(
        { code: 'create_user_failed', error: 'Password too weak' },
        'fallback',
        'already',
      ),
    ).toBe('Password too weak');
  });

  it('falls back when code is unknown', () => {
    expect(mapRegisterStudentError({ error: 'Server error' }, 'fallback', 'already')).toBe(
      'Server error',
    );
    expect(mapRegisterStudentError({}, 'fallback', 'already')).toBe('fallback');
  });
});
