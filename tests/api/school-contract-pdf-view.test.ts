import { describe, expect, it } from 'vitest';
import { extractSchoolContractStoragePath } from '../../api/_lib/schoolContractStorage';

describe('school contract PDF parent links', () => {
  it('builds tokenized app URL path (not public storage)', () => {
    const appBase = 'https://www.tutlio.lt';
    const token = 'abc123';
    const url = `${appBase}/api/school-contract-pdf?token=${encodeURIComponent(token)}`;
    expect(url).toContain('/api/school-contract-pdf?token=');
    expect(url).not.toContain('/object/public/');
  });

  it('resolves legacy public pdf_url to storage path for download', () => {
    const legacy =
      'https://x.supabase.co/storage/v1/object/public/school-contracts/org/contracts/id/Sutartis.pdf';
    expect(extractSchoolContractStoragePath(legacy)).toBe('org/contracts/id/Sutartis.pdf');
  });
});
