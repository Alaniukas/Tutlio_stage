import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { resolveInvoiceFontPath, type InvoicePdfBranding } from './invoicePdf.js';

export type SchoolMonthlyInvoicePdfLine = {
  studentName: string;
  activity: string;
  quantity: number;
  unitPriceEur: number;
  originalAmountEur: number;
  discountLabel?: string | null;
  discountAmountEur?: number;
  amountEur: number;
};

export type SchoolMonthlyInvoicePdfData = {
  preview?: boolean;
  invoiceNumber: string;
  issueDate: string;
  periodLabel: string;
  studentName: string;
  grade?: string | null;
  dueDate?: string | null;
  seller: {
    name: string;
    companyCode?: string | null;
    address?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    bankName?: string | null;
    iban?: string | null;
  };
  buyer: {
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  lines: SchoolMonthlyInvoicePdfLine[];
  subtotalEur: number;
  discountAmountEur: number;
  totalEur: number;
  discountNote?: string | null;
  issuedByName?: string | null;
  branding?: InvoicePdfBranding | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const TABLE_W = PAGE_W - MARGIN * 2;
const FONT_SIZE = 7.4;
const ROW_LINE = 10;
const COLS = [75, 142, 43, 54, 54, 67, 60] as const;

const eur = (value: number) => `${Number(value || 0).toFixed(2).replace('.', ',')} €`;

function ltInteger(value: number): string {
  const ones = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni'];
  const teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika', 'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];
  const tens = ['', '', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 'aštuoniasdešimt', 'devyniasdešimt'];
  const underThousand = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      const h = Math.floor(n / 100);
      parts.push(h === 1 ? 'šimtas' : `${ones[h]} šimtai`);
      n %= 100;
    }
    if (n >= 20) {
      parts.push(tens[Math.floor(n / 10)]);
      n %= 10;
    } else if (n >= 10) {
      parts.push(teens[n - 10]);
      n = 0;
    }
    if (n > 0) parts.push(ones[n]);
    return parts.join(' ');
  };
  if (value === 0) return 'nulis';
  const parts: string[] = [];
  const thousands = Math.floor(value / 1000);
  if (thousands > 0) {
    if (thousands === 1) parts.push('vienas tūkstantis');
    else {
      const last = thousands % 10;
      const suffix = last === 1 && thousands % 100 !== 11 ? 'tūkstantis'
        : last >= 2 && last <= 9 && !(thousands % 100 >= 11 && thousands % 100 <= 19) ? 'tūkstančiai'
          : 'tūkstančių';
      parts.push(`${underThousand(thousands)} ${suffix}`);
    }
  }
  if (value % 1000) parts.push(underThousand(value % 1000));
  return parts.join(' ');
}

export function amountInLithuanianWords(value: number): string {
  const centsTotal = Math.max(0, Math.round(Number(value || 0) * 100));
  const euros = Math.floor(centsTotal / 100);
  const cents = centsTotal % 100;
  const lastTwo = euros % 100;
  const last = euros % 10;
  const euroWord = lastTwo >= 11 && lastTwo <= 19 ? 'eurų' : last === 1 ? 'euras' : last >= 2 && last <= 9 ? 'eurai' : 'eurų';
  return `${ltInteger(euros)} ${euroWord} ${String(cents).padStart(2, '0')} ct`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function cellText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  font: PDFFont,
  size = FONT_SIZE,
  center = false,
) {
  const lines = wrap(text, font, size, width - 8).slice(0, Math.max(1, Math.floor((height - 6) / ROW_LINE)));
  const startY = y + height - 4 - size;
  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: center ? x + Math.max(4, (width - lineWidth) / 2) : x + 4,
      y: startY - index * ROW_LINE,
      size,
      font,
      color: rgb(0.08, 0.1, 0.12),
    });
  });
}

function drawCell(page: PDFPage, x: number, y: number, width: number, height: number) {
  page.drawRectangle({ x, y, width, height, borderColor: rgb(0.12, 0.14, 0.16), borderWidth: 0.65 });
}

function laisviVaikaiInvoiceLogoCandidates(): string[] {
  const here = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  return [
    join(here, 'templates', 'laisvi-vaikai-invoice-logo.png'),
    join(process.cwd(), 'api', '_lib', 'templates', 'laisvi-vaikai-invoice-logo.png'),
    join(here, '..', 'templates', 'laisvi-vaikai-invoice-logo.png'),
  ];
}

export function resolveLaisviVaikaiInvoiceLogoPath(): string {
  const candidates = laisviVaikaiInvoiceLogoCandidates();
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Laisvi vaikai invoice logo missing. Tried: ${candidates.join(' | ')}`);
  return found;
}

async function embedLogo(
  doc: PDFDocument,
  sellerName: string,
  branding?: InvoicePdfBranding | null,
): Promise<PDFImage | null> {
  if (/laisvi\s+vaikai/i.test(sellerName)) {
    return doc.embedPng(new Uint8Array(readFileSync(resolveLaisviVaikaiInvoiceLogoPath())));
  }
  if (!branding?.logo) return null;
  try {
    return branding.logo.mime === 'jpeg'
      ? await doc.embedJpg(branding.logo.bytes)
      : await doc.embedPng(branding.logo.bytes);
  } catch {
    return null;
  }
}

/** Invoice layout based on the PAM sample supplied by VšĮ „Laisvi vaikai“. */
export async function generateSchoolMonthlyInvoicePdf(data: SchoolMonthlyInvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(new Uint8Array(readFileSync(resolveInvoiceFontPath('regular'))), { subset: true });
  const bold = await doc.embedFont(new Uint8Array(readFileSync(resolveInvoiceFontPath('bold'))), { subset: true });
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const black = rgb(0, 0, 0);

  if (data.preview) {
    const previewText = 'PERŽIŪRA - SĄSKAITA DAR NEIŠSIŲSTA';
    const previewWidth = bold.widthOfTextAtSize(previewText, 8);
    page.drawText(previewText, {
      x: (PAGE_W - previewWidth) / 2,
      y: PAGE_H - 24,
      size: 8,
      font: bold,
      color: black,
    });
  }

  let y = PAGE_H - 52;
  const sellerX = 337;
  page.drawText('PIRKĖJAS', { x: MARGIN, y, size: 9, font, color: black });
  page.drawText('PARDAVĖJAS', { x: sellerX, y, size: 9, font, color: black });
  y -= 18;
  page.drawText(data.buyer.name || data.studentName, { x: MARGIN, y, size: 10, font: bold, color: black });
  page.drawText(data.seller.name, { x: sellerX, y, size: 10, font: bold, color: black });

  const buyerLines = [
    data.buyer.phone ? `Tel.: ${data.buyer.phone}` : '',
    data.buyer.email ? `El. paštas: ${data.buyer.email}` : '',
  ].filter(Boolean);
  let infoY = y - 36;
  buyerLines.forEach((line) => { page.drawText(line, { x: MARGIN, y: infoY, size: 8.5, font, color: black }); infoY -= 12; });
  infoY = y - 20;
  if (data.seller.companyCode) {
    page.drawText(`Įmonės kodas ${data.seller.companyCode}`, { x: sellerX, y: infoY, size: 8.3, font, color: black });
    infoY -= 12;
  }
  if (data.seller.address) {
    wrap(`Adresas: ${data.seller.address}`, font, 8.3, PAGE_W - sellerX - MARGIN).forEach((line) => {
      page.drawText(line, { x: sellerX, y: infoY, size: 8.3, font, color: black });
      infoY -= 11;
    });
  }
  if (data.seller.iban) {
    infoY -= 3;
    page.drawText(`A. S. ${data.seller.iban}`, { x: sellerX, y: infoY, size: 8.5, font: bold, color: black });
    infoY -= 12;
  }
  if (data.seller.bankName) {
    page.drawText(data.seller.bankName, { x: sellerX, y: infoY, size: 8.3, font, color: black });
  }

  const logo = await embedLogo(doc, data.seller.name, data.branding);
  if (logo) {
    const scale = Math.min(135 / logo.width, 92 / logo.height, 1);
    page.drawImage(logo, { x: MARGIN + 9, y: y - 150, width: logo.width * scale, height: logo.height * scale });
  } else {
    page.drawText(data.branding?.brandName || data.seller.name, { x: MARGIN + 22, y: y - 75, size: 11, font: bold, color: black });
  }

  page.drawText('Dokumento data:', { x: sellerX, y: y - 116, size: 8.5, font, color: black });
  page.drawText(data.issueDate, { x: sellerX + 77, y: y - 116, size: 8.5, font, color: black });
  let titleY = y - 142;
  const center = (text: string, size: number, useBold = false) => {
    const chosen = useBold ? bold : font;
    const width = chosen.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (PAGE_W - width) / 2, y: titleY, size, font: chosen, color: black });
    titleY -= size + 5;
  };
  center('SĄSKAITA FAKTŪRA', 12);
  center('UŽ SUTEIKTAS PASLAUGAS', 12);
  center(data.invoiceNumber.startsWith('PAM') ? data.invoiceNumber.replace(/^PAM[- ]?/, 'PAM NR. ') : `PAM NR. ${data.invoiceNumber}`, 10, true);
  center('(NR. BŪTINA įrašyti į bankinio pavedimo mokėjimo paskirtį)', 8);

  y = titleY - 9;
  const detailsW = 288;
  const detailsH = 42;
  const detailsLabelW = 87;
  const detailsRowH = 14;
  page.drawRectangle({ x: MARGIN, y: y - detailsH, width: detailsW, height: detailsH, borderColor: black, borderWidth: 0.65 });
  page.drawLine({ start: { x: MARGIN + detailsLabelW, y }, end: { x: MARGIN + detailsLabelW, y: y - detailsH }, thickness: 0.65, color: black });
  for (let row = 1; row < 3; row += 1) {
    page.drawLine({
      start: { x: MARGIN, y: y - row * detailsRowH },
      end: { x: MARGIN + detailsW, y: y - row * detailsRowH },
      thickness: 0.65,
      color: black,
    });
  }
  const detailRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'Paslaugų laikotarpis:', value: data.periodLabel },
    { label: 'Vaikas', value: data.studentName, bold: true },
    { label: 'Klasė', value: data.grade || '-' },
  ];
  detailRows.forEach((row, index) => {
    const baseline = y - index * detailsRowH - 10.5;
    const labelWidth = font.widthOfTextAtSize(row.label, 8.2);
    page.drawText(row.label, {
      x: MARGIN + detailsLabelW - labelWidth - 4,
      y: baseline,
      size: 8.2,
      font,
      color: black,
    });
    page.drawText(row.value, {
      x: MARGIN + detailsLabelW + 4,
      y: baseline,
      size: 8.2,
      font: row.bold ? bold : font,
      color: black,
    });
  });
  y -= detailsH + 14;

  const headers = ['Mokinys', 'Užsiėmimas', 'Pamokų sk.', 'Kaina', 'Suma', 'Nuolaida', 'Mokėti'];
  let x = MARGIN;
  const headerH = 30;
  headers.forEach((header, index) => {
    drawCell(page, x, y - headerH, COLS[index], headerH);
    cellText(page, header, x, y - headerH, COLS[index], headerH, bold, 7.1, true);
    x += COLS[index];
  });
  y -= headerH;

  for (const line of data.lines) {
    const activityLines = wrap(line.activity, font, FONT_SIZE, COLS[1] - 8).length;
    const rowH = Math.max(28, activityLines * ROW_LINE + 9);
    if (y - rowH < 145) break;
    const discountText = line.discountAmountEur
      ? `${line.discountLabel || ''}\n-${eur(line.discountAmountEur)}`.trim()
      : '-';
    const values = [
      line.studentName,
      line.activity,
      String(line.quantity),
      eur(line.unitPriceEur),
      eur(line.originalAmountEur),
      discountText,
      eur(line.amountEur),
    ];
    x = MARGIN;
    values.forEach((value, index) => {
      drawCell(page, x, y - rowH, COLS[index], rowH);
      cellText(page, value, x, y - rowH, COLS[index], rowH, index === 6 ? bold : font, FONT_SIZE, index >= 2);
      x += COLS[index];
    });
    y -= rowH;
  }

  y -= 17;
  const summaryX = 348;
  page.drawText('Pradinė suma:', { x: summaryX, y, size: 8.5, font, color: black });
  page.drawText(eur(data.subtotalEur), { x: 485, y, size: 8.5, font, color: black });
  y -= 16;
  page.drawText('Nuolaida:', { x: summaryX, y, size: 8.5, font, color: black });
  page.drawText(`-${eur(data.discountAmountEur)}`, { x: 485, y, size: 8.5, font, color: black });
  y -= 19;
  page.drawText('MOKĖTI:', { x: summaryX, y, size: 10, font: bold, color: black });
  page.drawText(eur(data.totalEur), { x: 485, y, size: 10, font: bold, color: black });
  y -= 22;
  page.drawText(`Suma žodžiais: ${amountInLithuanianWords(data.totalEur)}`, { x: MARGIN + 155, y, size: 8.5, font, color: black });

  if (data.discountNote) {
    y -= 24;
    const noteLines = wrap(`Nuolaidos pastaba: ${data.discountNote}`, font, 8, TABLE_W);
    noteLines.forEach((line) => { page.drawText(line, { x: MARGIN, y, size: 8, font, color: black }); y -= 11; });
  }
  if (data.dueDate) {
    y -= 7;
    page.drawText(`Apmokėti iki: ${data.dueDate}`, { x: MARGIN, y, size: 8.5, font: bold, color: black });
  }

  const paymentPurpose = 'Mokėjimo paskirtyje prašome nurodyti sąskaitos faktūros numerį.';
  page.drawText(paymentPurpose, { x: MARGIN, y: 112, size: 8.5, font, color: black });
  page.drawLine({
    start: { x: MARGIN, y: 110.5 },
    end: { x: MARGIN + font.widthOfTextAtSize(paymentPurpose, 8.5), y: 110.5 },
    thickness: 0.45,
    color: black,
  });
  page.drawText(`Sąskaitą išrašė: ${data.issuedByName || data.seller.name}`, { x: MARGIN, y: 68, size: 8.2, font, color: black });
  const contact = data.seller.contactEmail || data.seller.contactPhone;
  if (contact) {
    page.drawText('Pastebėjus netikslumų ar kilus klausimams dėl sąskaitos apmokėjimo prašome kreiptis el. paštu:', {
      x: MARGIN,
      y: 51,
      size: 7.5,
      font,
      color: black,
    });
    page.drawText(contact, { x: MARGIN, y: 37, size: 8, font, color: black });
  }

  return doc.save();
}
