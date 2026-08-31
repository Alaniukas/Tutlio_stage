import { describe, expect, it } from 'vitest';
import { extractSchoolContractStoragePath } from '../../src/lib/schoolContractPdfPath';

describe('extractSchoolContractStoragePath', () => {
  it('keeps a bare storage key', () => {
    expect(extractSchoolContractStoragePath('org/contracts/id/Sutartis-PP-1.pdf'))
      .toBe('org/contracts/id/Sutartis-PP-1.pdf');
  });

  it('strips public and signed storage URL prefixes', () => {
    expect(extractSchoolContractStoragePath(
      'https://x.supabase.co/storage/v1/object/public/school-contracts/org/file.pdf',
    )).toBe('org/file.pdf');
    expect(extractSchoolContractStoragePath(
      'https://x.supabase.co/storage/v1/object/sign/school-contracts/org/file.pdf?token=abc',
    )).toBe('org/file.pdf');
  });
});
