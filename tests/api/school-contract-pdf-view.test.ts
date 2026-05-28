import { describe, expect, it } from 'vitest';
import { extractSchoolContractStoragePath } from '../../api/_lib/schoolContractStorage';
import {
  extractTokenFromSchoolContractUrl,
  schoolContractCompletionPageUrl,
  schoolContractPdfApiUrl,
} from '../../api/_lib/schoolContractPdfView';

describe('school contract PDF parent links', () => {
  it('builds matching token URLs for PDF and completion form', () => {
    const appBase = 'https://www.tutlio.lt';
    const token = 'abc123';
    const pdfUrl = schoolContractPdfApiUrl(appBase, token);
    const formUrl = schoolContractCompletionPageUrl(appBase, token);
    expect(pdfUrl).toContain('/api/school-contract-pdf?token=abc123');
    expect(formUrl).toContain('/school-contract-complete?token=abc123');
    expect(extractTokenFromSchoolContractUrl(pdfUrl)).toBe('abc123');
    expect(extractTokenFromSchoolContractUrl(formUrl)).toBe('abc123');
  });

  it('resolves legacy public pdf_url to storage path for download', () => {
    const legacy =
      'https://x.supabase.co/storage/v1/object/public/school-contracts/org/contracts/id/Sutartis.pdf';
    expect(extractSchoolContractStoragePath(legacy)).toBe('org/contracts/id/Sutartis.pdf');
  });
});
