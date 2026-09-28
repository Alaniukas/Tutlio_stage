import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { generateSchoolDiscountAgreementPdf, type SchoolDiscountAgreementPdfData } from '../../api/_lib/schoolDiscountAgreementPdf';

async function renderAgreement(overrides: Partial<SchoolDiscountAgreementPdfData> = {}) {
  const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
  try {
    const bytes = await generateSchoolDiscountAgreementPdf({
      agreementNumber: 'NPR-1', contractNumber: 'AZ-1', issueDate: '2026-09-17',
      acceptedAt: '2026-09-17 14:32', schoolName: 'Ąžuolo mokykla',
      parentName: 'Tėvas', parentEmail: 'tevas@example.com', studentName: 'Jonas Jonaitis',
      activityLabel: 'Matematika 8 kl.', discountType: 'percent', discountValue: 25,
      validFrom: '2026-09-01', validUntil: '2027-06-30', acceptanceStatement: 'Sutinku.',
      ...overrides,
    });
    const text = drawText.mock.calls.map(([line]) => line).join(' ').replace(/\s+/g, ' ');
    return { bytes, text, document: await PDFDocument.load(bytes) };
  } finally {
    drawText.mockRestore();
  }
}

describe('school discount agreement PDF', () => {
  it('renders the addendum using the target school name', async () => {
    const { bytes, text, document } = await renderAgreement();
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF');
    expect(document.getPageCount()).toBe(1);
    expect(text).toContain('Ąžuolo mokykla');
    expect(text).not.toContain('Laisvi vaikai');
    expect(text).toContain('PRIEDAS PATVIRTINTAS');
    expect(text).toContain('Patvirtino: Tėvas (tevas@example.com)');
    expect(text).toContain('Patvirtinimo data ir laikas: 2026-09-17 14:32');
    expect(text).toContain('Sutinku.');
    expect(text).toContain('Dokumentas patvirtintas elektroniniu būdu Tutlio sistemoje.');
  });

  it('renders a pending proposal without invented acceptance evidence', async () => {
    const { text, document } = await renderAgreement({ acceptedAt: null, acceptanceStatement: null, contractAccepted: false });
    expect(document.getPageCount()).toBe(1);
    expect(text).toContain('PASIŪLYMAS - PRIEDAS NEPATVIRTINTAS');
    expect(text).toContain('Pasiūlymo parengimo data: 2026-09-17');
    expect(text).toContain('Elektroninis patvirtinimas negautas.');
    expect(text).toContain('patvirtinta ir Sutartis, ir šis priedas');
    expect(text).toContain('tik šiame priede nurodytu galiojimo laikotarpiu');
    expect(text).not.toContain('ELEKTRONINIO PATVIRTINIMO DUOMENYS');
    expect(text).not.toContain('Patvirtino:');
    expect(text).not.toContain('Patvirtinimo data ir laikas:');
    expect(text).not.toContain('Dokumentas patvirtintas elektroniniu būdu');
  });

  it('keeps annex approval evidence while the main contract still awaits confirmation', async () => {
    const { text } = await renderAgreement({ contractAccepted: false });
    expect(text).toContain('PRIEDAS PATVIRTINTAS');
    expect(text).toContain('Patvirtinimo data ir laikas: 2026-09-17 14:32');
    expect(text).toContain('Šio priedo patvirtinimo metu užsiėmimų sutartis dar nepatvirtinta.');
    expect(text).toContain('Nuolaida bus taikoma patvirtinus ir užsiėmimų sutartį.');
  });
});
