import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkOrgStudentEmailAvailable } from '../../src/lib/orgStudentContactCheckApi';

const state = vi.hoisted(() => ({ resolveAccessToken: vi.fn() }));
vi.mock('../../src/lib/authSession.js', () => ({ resolveAccessToken: state.resolveAccessToken }));

const input = { organizationId: 'org-1', fullName: 'New Student', studentEmail: ' child@example.test ' };

describe('organization student contact check API', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    state.resolveAccessToken.mockResolvedValue('admin-token');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('checks a contact using the current administrator token and preserves duplicate details', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({
      code: 'student_email_taken', email: 'child@example.test', existingStudentId: 'existing', existingStudentName: 'Existing Child',
    }) });
    await expect(checkOrgStudentEmailAvailable(input)).resolves.toEqual({
      ok: false, code: 'student_email_taken', email: 'child@example.test', existingStudentId: 'existing', existingStudentName: 'Existing Child',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/org-student-contact-check', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
      body: JSON.stringify({ ...input, studentEmail: 'child@example.test' }),
    }));
  });

  it('returns unavailable after a network failure so the form can show an error and retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fetchMock.mockResolvedValueOnce({ ok: true });
    await expect(checkOrgStudentEmailAvailable(input)).resolves.toEqual({ ok: false, unavailable: true });
    await expect(checkOrgStudentEmailAvailable(input)).resolves.toEqual({ ok: true });
  });

  it('keeps authorization failures and malformed server errors closed', async () => {
    state.resolveAccessToken.mockRejectedValueOnce(new Error('Auth unavailable'));
    await expect(checkOrgStudentEmailAvailable(input)).resolves.toEqual({ ok: false, unavailable: true });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => { throw new Error('Invalid JSON'); } });
    await expect(checkOrgStudentEmailAvailable(input)).resolves.toEqual({ ok: false, unavailable: true });
  });
});
