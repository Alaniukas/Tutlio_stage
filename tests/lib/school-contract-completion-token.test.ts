import { describe, expect, it } from 'vitest';
import { isSchoolContractCompletionTokenUsed } from '../../api/_lib/schoolContractCompletionToken';

describe('school contract completion token', () => {
  it('treats used_at as consumed', () => {
    expect(
      isSchoolContractCompletionTokenUsed({
        id: '1',
        contract_id: 'c1',
        token: 't',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        used_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('treats legacy used boolean as consumed', () => {
    expect(
      isSchoolContractCompletionTokenUsed({
        id: '1',
        contract_id: 'c1',
        token: 't',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        used: true,
      }),
    ).toBe(true);
  });

  it('allows unused token', () => {
    expect(
      isSchoolContractCompletionTokenUsed({
        id: '1',
        contract_id: 'c1',
        token: 't',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        used: false,
        used_at: null,
      }),
    ).toBe(false);
  });
});
