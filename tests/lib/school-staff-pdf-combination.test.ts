// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const { renderMock } = vi.hoisted(() => ({ renderMock: vi.fn() }));

vi.mock('../../api/_lib/renderSchoolContractDocxToPdf', () => ({
  renderDocxTemplateBufferToPdfBuffer: renderMock,
}));

import { renderStaffDocumentPdf } from '../../api/_lib/schoolStaffDocuments';

const fields = {
  name: 'Vardas Pavardė',
  employmentContractNumber: 'DS-42',
  employmentContractDate: '2026-09-22',
  date: new Date('2026-09-22T12:00:00Z'),
};

describe('staff PDF composition', () => {
  beforeEach(() => {
    renderMock.mockReset();
    renderMock.mockImplementation(async () => {
      const pdf = await PDFDocument.create();
      pdf.addPage();
      return Buffer.from(await pdf.save());
    });
  });

  it('joins the confidentiality agreement and its annex into one signing PDF', async () => {
    const bytes = await renderStaffDocumentPdf('confidentiality', fields);
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it('generates consent as its own PDF after ten choices', async () => {
    const bytes = await renderStaffDocumentPdf('consent', fields, Array(10).fill('no'));
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
