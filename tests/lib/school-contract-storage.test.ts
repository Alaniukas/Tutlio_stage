import { describe, expect, it } from 'vitest';
import {
  extractSchoolContractStoragePath,
  SCHOOL_CONTRACTS_BUCKET,
} from '../../api/_lib/schoolContractStorage';

describe('schoolContractStorage', () => {
  it('extracts path from legacy public storage URL', () => {
    const url = `https://example.supabase.co/storage/v1/object/public/${SCHOOL_CONTRACTS_BUCKET}/org-1/abc.docx`;
    expect(extractSchoolContractStoragePath(url)).toBe('org-1/abc.docx');
  });

  it('returns plain path unchanged', () => {
    expect(extractSchoolContractStoragePath('org-1/abc.docx')).toBe('org-1/abc.docx');
  });
});
