import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { resolveInvoiceFontPath, type InvoicePdfBranding } from './invoicePdf.js';
import {
  schoolDiscountTermsLabel,
  schoolDiscountValueLabel,
  type SchoolDiscountType,
} from '../../src/lib/schoolDiscountAgreement.js';

export type SchoolDiscountAgreementPdfData = {
  agreementNumber: string;
  contractNumber: string;
  issueDate: string;
  acceptedAt: string;
  schoolName: string;
  schoolCompanyCode?: string | null;
  schoolAddress?: string | null;
  schoolEmail?: string | null;
  parentName: string;
  parentEmail: string;
  studentName: string;
  activityLabel: string;
  discountType: SchoolDiscountType;
  discountValue: number;
  validFrom: string;
  validUntil: string;
  note?: string | null;
  acceptanceStatement: string;
  branding?: InvoicePdfBranding | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 54;
const BLACK = rgb(0, 0, 0);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const paragraphs = String(text || '').split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    if (!words.length) lines.push('');
  }
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; width: number; font: PDFFont; size?: number; lineHeight?: number },
): number {
  const size = options.size ?? 9;
  const lineHeight = options.lineHeight ?? 13;
  let y = options.y;
  for (const line of wrap(text, options.font, size, options.width)) {
    if (line) page.drawText(line, { x: options.x, y, size, font: options.font, color: BLACK });
    y -= lineHeight;
  }
  return y;
}

function drawDetailRow(
  page: PDFPage,
  y: number,
  label: string,
  value: string,
  font: PDFFont,
  bold: PDFFont,
): number {
  const height = 25;
  const labelWidth = 150;
  const width = PAGE_W - MARGIN * 2;
  page.drawRectangle({ x: MARGIN, y: y - height, width, height, borderColor: BLACK, borderWidth: 0.6 });
  page.drawLine({
    start: { x: MARGIN + labelWidth, y },
    end: { x: MARGIN + labelWidth, y: y - height },
    thickness: 0.6,
    color: BLACK,
  });
  page.drawText(label, { x: MARGIN + 7, y: y - 16.5, size: 8.3, font, color: BLACK });
  const valueLines = wrap(value, bold, 8.3, width - labelWidth - 14).slice(0, 2);
  valueLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN + labelWidth + 7,
      y: y - 12.5 - index * 9.5,
      size: 8.3,
      font: bold,
      color: BLACK,
    });
  });
  return y - height;
}

/** One-page click-wrap addendum attached to an accepted lessons contract. */
export async function generateSchoolDiscountAgreementPdf(
  data: SchoolDiscountAgreementPdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(new Uint8Array(readFileSync(resolveInvoiceFontPath('regular'))), { subset: true });
  const bold = await doc.embedFont(new Uint8Array(readFileSync(resolveInvoiceFontPath('bold'))), { subset: true });
  let logo = null;
  if (data.branding?.logo) {
    try {
      logo = data.branding.logo.mime === 'jpeg'
        ? await doc.embedJpg(data.branding.logo.bytes)
        : await doc.embedPng(data.branding.logo.bytes);
    } catch { /* A broken organization logo must not block the signed addendum. */ }
  }
  const page = doc.addPage([PAGE_W, PAGE_H]);

  if (logo) {
    const logoScale = Math.min(150 / logo.width, 105 / logo.height);
    page.drawImage(logo, {
      x: MARGIN, y: PAGE_H - 145,
      width: logo.width * logoScale, height: logo.height * logoScale,
    });
  }

  page.drawText(data.schoolName, { x: 330, y: PAGE_H - 66, size: 10, font: bold, color: BLACK });
  let schoolY = PAGE_H - 82;
  const schoolLines = [
    data.schoolCompanyCode ? `Įmonės kodas ${data.schoolCompanyCode}` : '',
    data.schoolAddress || '',
    data.schoolEmail ? `El. paštas ${data.schoolEmail}` : '',
  ].filter(Boolean);
  for (const line of schoolLines) {
    schoolY = drawWrapped(page, line, { x: 330, y: schoolY, width: PAGE_W - 330 - MARGIN, font, size: 8, lineHeight: 10 });
  }

  let y = PAGE_H - 180;
  const title = 'PRIEDAS PRIE UGDYMO PASLAUGŲ SUTARTIES';
  page.drawText(title, {
    x: (PAGE_W - bold.widthOfTextAtSize(title, 12)) / 2,
    y,
    size: 12,
    font: bold,
    color: BLACK,
  });
  y -= 19;
  const subtitle = 'SUSITARIMAS DĖL NUOLAIDOS';
  page.drawText(subtitle, {
    x: (PAGE_W - bold.widthOfTextAtSize(subtitle, 10)) / 2,
    y,
    size: 10,
    font: bold,
    color: BLACK,
  });
  y -= 21;
  const refs = `${data.agreementNumber} | Sutartis Nr. ${data.contractNumber}`;
  page.drawText(refs, {
    x: (PAGE_W - font.widthOfTextAtSize(refs, 8.5)) / 2,
    y,
    size: 8.5,
    font,
    color: BLACK,
  });
  y -= 25;

  y = drawDetailRow(page, y, 'Mokinys', data.studentName, font, bold);
  y = drawDetailRow(page, y, 'Mokėtojas / atstovas', data.parentName, font, bold);
  y = drawDetailRow(page, y, 'Užsiėmimai', data.activityLabel, font, bold);
  y = drawDetailRow(
    page,
    y,
    'Nuolaida',
    schoolDiscountValueLabel(data.discountType, data.discountValue),
    font,
    bold,
  );
  y = drawDetailRow(page, y, 'Galiojimo laikotarpis', `${data.validFrom} - ${data.validUntil}`, font, bold);
  y -= 22;

  y = drawWrapped(page, `1. Šalys susitaria, kad mokiniui ${data.studentName} Sutartyje numatytiems užsiėmimams „${data.activityLabel}“ laikotarpiu nuo ${data.validFrom} iki ${data.validUntil} taikoma ${schoolDiscountTermsLabel(data.discountType, data.discountValue)}.`, {
    x: MARGIN,
    y,
    width: PAGE_W - MARGIN * 2,
    font,
    size: 8.7,
    lineHeight: 12.5,
  });
  y -= 6;
  y = drawWrapped(page, '2. Nuolaida taikoma tik šiame priede nurodytiems užsiėmimams ir galiojimo laikotarpiui. Visos kitos Sutarties sąlygos lieka nepakeistos.', {
    x: MARGIN,
    y,
    width: PAGE_W - MARGIN * 2,
    font,
    size: 8.7,
    lineHeight: 12.5,
  });
  y -= 6;
  y = drawWrapped(page, '3. Šis priedas yra neatskiriama Sutarties dalis ir įsigalioja nuo elektroninio patvirtinimo momento.', {
    x: MARGIN,
    y,
    width: PAGE_W - MARGIN * 2,
    font,
    size: 8.7,
    lineHeight: 12.5,
  });
  if (data.note) {
    y -= 8;
    y = drawWrapped(page, `Pastaba: ${data.note}`, {
      x: MARGIN,
      y,
      width: PAGE_W - MARGIN * 2,
      font,
      size: 8.3,
      lineHeight: 11.5,
    });
  }

  y -= 18;
  page.drawText('ELEKTRONINIO PATVIRTINIMO DUOMENYS', { x: MARGIN, y, size: 8.5, font: bold, color: BLACK });
  y -= 16;
  y = drawWrapped(page, `Patvirtino: ${data.parentName} (${data.parentEmail})`, {
    x: MARGIN,
    y,
    width: PAGE_W - MARGIN * 2,
    font,
    size: 8.2,
    lineHeight: 11,
  });
  y = drawWrapped(page, `Patvirtinimo data ir laikas: ${data.acceptedAt}`, {
    x: MARGIN,
    y,
    width: PAGE_W - MARGIN * 2,
    font,
    size: 8.2,
    lineHeight: 11,
  });
  y = drawWrapped(page, data.acceptanceStatement, {
    x: MARGIN,
    y,
    width: PAGE_W - MARGIN * 2,
    font,
    size: 7.8,
    lineHeight: 10.5,
  });

  const footer = `Priedo sudarymo data: ${data.issueDate}`;
  page.drawText(footer, { x: MARGIN, y: 40, size: 7.8, font, color: BLACK });
  page.drawText('Dokumentas patvirtintas elektroniniu būdu Tutlio sistemoje.', {
    x: MARGIN,
    y: 27,
    size: 7.8,
    font: bold,
    color: BLACK,
  });

  return doc.save();
}
