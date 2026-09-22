import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { fillDocxTemplateBuffer } from '../../api/_lib/renderSchoolContractDocxToPdf';
import {
  staffDocumentStatus,
  staffFilesDeleteAt,
  staffPdfPathsForRetention,
  staffTemplateNames,
  staffTemplatePayload,
  validateConsentAnswers,
} from '../../api/_lib/schoolStaffDocuments';

const folder = join(process.cwd(), 'api', '_lib', 'templates', 'staff');

describe('school staff document templates and lifecycle', () => {
  it('requires an independent yes/no answer for every consent purpose', () => {
    expect(validateConsentAnswers(Array(10).fill('yes'))).toHaveLength(10);
    expect(validateConsentAnswers(Array(9).fill('yes'))).toBeNull();
    expect(validateConsentAnswers([...Array(9).fill('yes'), 'maybe'])).toBeNull();
  });

  it('fills each of the three supplied DOCX templates without unresolved fields', () => {
    const fields = staffTemplatePayload({
      name: 'Vardas Pavardė',
      employmentContractNumber: 'DS-42',
      employmentContractDate: '2026-09-22',
      date: new Date('2026-09-22T12:00:00Z'),
    });
    for (const name of ['confidentiality-agreement.docx', 'confidentiality-annex.docx', 'staff-consent.docx']) {
      const payload = { ...fields, ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`choice_${index + 1}`, index % 2 ? 'NESUTINKU' : 'SUTINKU'])) };
      const result = fillDocxTemplateBuffer({ templateBytes: readFileSync(join(folder, name)), payload });
      const xml = new PizZip(result).file('word/document.xml')?.asText() || '';
      expect(xml).toContain('Vardas Pavardė');
      expect(xml).not.toContain('{{');
      expect(xml).not.toContain('}}');
      if (name === 'staff-consent.docx') {
        expect(xml).toContain('SUTINKU');
        expect(xml).toContain('NESUTINKU');
      }
    }
  });

  it('renders agreement and annex into one signing PDF, with consent separate', () => {
    expect(staffTemplateNames('confidentiality')).toEqual([
      'confidentiality-agreement.docx', 'confidentiality-annex.docx',
    ]);
    expect(staffTemplateNames('consent')).toEqual(['staff-consent.docx']);
  });

  it('retains staff status while marking the PDF for deletion 30 days after signing', () => {
    expect(staffFilesDeleteAt('2026-09-01T12:00:00.000Z')).toBe('2026-10-01T12:00:00.000Z');
    expect(staffDocumentStatus({ signing_status: 'signed', staff_viewed_at: '2026-09-01' })).toBe('signed');
    expect(staffDocumentStatus({ signing_status: 'signed', staff_revoked_at: '2026-09-02' })).toBe('revoked');
    expect(staffDocumentStatus({ sent_at: '2026-09-01', staff_viewed_at: '2026-09-02' })).toBe('viewed');
  });

  it('targets only PDF files within the staff document folder for retention', () => {
    const folder = 'org/contracts/document';
    expect(staffPdfPathsForRetention([
      `${folder}/agreement.pdf`,
      `${folder}/signed/employee.PDF`,
      `${folder}/audit.json`,
      'org/contracts/another-document/signed.pdf',
    ], folder)).toEqual([
      `${folder}/agreement.pdf`,
      `${folder}/signed/employee.PDF`,
    ]);
  });
});
