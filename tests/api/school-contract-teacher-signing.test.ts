import { describe, expect, it } from 'vitest';
import {
  advanceAfterRoleSigned,
  inputPdfPathForRole,
  isTeacherContract,
} from '../../api/_lib/schoolContractSigning';
import { signaturePositionForRole } from '../../api/_lib/gosignConfig';

function updateOnlySupabase(updates: Array<Record<string, unknown>>) {
  return {
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(values);
          return { error: null };
        },
      }),
    }),
  } as any;
}

describe('teacher contract signing integration', () => {
  it('uses the school-signed PDF as the teacher input', () => {
    expect(isTeacherContract({ party_kind: 'teacher' })).toBe(true);
    expect(inputPdfPathForRole({}, [{ role: 'school', signed_pdf_path: 'school.pdf' }], 'teacher'))
      .toBe('school.pdf');
    expect(signaturePositionForRole('teacher')).toContain('7.2cm');
  });

  it('stops after the school signature until the teacher is invited', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const result = await advanceAfterRoleSigned(
      updateOnlySupabase(updates),
      { id: 'contract-1', party_kind: 'teacher', student: null },
      'school',
      'school.pdf',
      'https://example.test',
    );

    expect(result).toEqual({ contractStatus: 'signed_by_school', done: false });
    expect(updates).toEqual([{ signing_status: 'signed_by_school' }]);
  });

  it('finalizes without creating parent payment side effects after the teacher signs', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const result = await advanceAfterRoleSigned(
      updateOnlySupabase(updates),
      { id: 'contract-1', party_kind: 'teacher', counterparty_email: null },
      'teacher',
      'teacher.pdf',
      'https://example.test',
    );

    expect(result).toEqual({ contractStatus: 'signed', done: true });
    expect(updates).toEqual([expect.objectContaining({
      signing_status: 'signed',
      signed_contract_url: 'teacher.pdf',
    })]);
  });
});
