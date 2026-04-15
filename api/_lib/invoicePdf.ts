import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: string;
  periodStart?: string;
  periodEnd?: string;

  seller: {
    name: string;
    entityType: string;
    companyCode?: string;
    vatCode?: string;
    address?: string;
    activityNumber?: string;
    personalCode?: string;
    contactEmail?: string;
    contactPhone?: string;
  };

  buyer: {
    name: string;
    companyCode?: string;
    vatCode?: string;
    address?: string;
    email?: string;
    phone?: string;
  };

  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];

  totalAmount: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const COL_WIDTH = PAGE_WIDTH - MARGIN * 2;

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const gray = rgb(0.3, 0.3, 0.3);
  const black = rgb(0, 0, 0);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const headerBlue = rgb(0.24, 0.35, 0.59);

  let y = PAGE_HEIGHT - MARGIN;

  const drawText = (text: string, x: number, yPos: number, opts?: {
    size?: number; bold?: boolean; color?: typeof black;
  }) => {
    const f = opts?.bold ? fontBold : font;
    const size = opts?.size || 9;
    page.drawText(text, { x, y: yPos, size, font: f, color: opts?.color || black });
  };

  const drawLine = (x1: number, yPos: number, x2: number) => {
    page.drawLine({
      start: { x: x1, y: yPos },
      end: { x: x2, y: yPos },
      thickness: 0.5,
      color: lightGray,
    });
  };

  // --- Header ---
  drawText('SASKAITA FAKTURA', MARGIN, y, { size: 16, bold: true, color: headerBlue });
  y -= 20;
  drawText(`Nr. ${data.invoiceNumber}`, MARGIN, y, { size: 11, bold: true });
  drawText(`Data: ${data.issueDate}`, MARGIN + 250, y, { size: 9, color: gray });
  y -= 12;

  if (data.periodStart && data.periodEnd) {
    drawText(`Laikotarpis: ${data.periodStart} - ${data.periodEnd}`, MARGIN, y, { size: 9, color: gray });
    y -= 12;
  }

  y -= 8;
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 20;

  // --- Seller / Buyer side by side ---
  const halfWidth = COL_WIDTH / 2 - 10;
  const sellerX = MARGIN;
  const buyerX = MARGIN + halfWidth + 20;

  drawText('PARDAVEJAS / PASLAUGU TEIKEJAS', sellerX, y, { size: 8, bold: true, color: gray });
  drawText('PIRKEJAS / PASLAUGU GAVEJAS', buyerX, y, { size: 8, bold: true, color: gray });
  y -= 14;

  const sellerLines = buildEntityLines(data.seller);
  const buyerLines = buildBuyerLines(data.buyer);
  const maxLines = Math.max(sellerLines.length, buyerLines.length);

  for (let i = 0; i < maxLines; i++) {
    if (sellerLines[i]) drawText(sellerLines[i], sellerX, y, { size: 9 });
    if (buyerLines[i]) drawText(buyerLines[i], buyerX, y, { size: 9 });
    y -= 13;
  }

  y -= 10;
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 20;

  // --- Line items table ---
  const colDesc = MARGIN;
  const colQty = MARGIN + 280;
  const colUnit = MARGIN + 340;
  const colTotal = MARGIN + 420;

  drawText('Paslaugos aprasymas', colDesc, y, { size: 8, bold: true, color: gray });
  drawText('Kiekis', colQty, y, { size: 8, bold: true, color: gray });
  drawText('Vnt. kaina', colUnit, y, { size: 8, bold: true, color: gray });
  drawText('Suma, EUR', colTotal, y, { size: 8, bold: true, color: gray });
  y -= 6;
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 14;

  for (const item of data.lineItems) {
    if (y < MARGIN + 60) break;
    drawText(truncate(item.description, 55), colDesc, y, { size: 9 });
    drawText(String(item.quantity), colQty + 10, y, { size: 9 });
    drawText(formatEur(item.unitPrice), colUnit, y, { size: 9 });
    drawText(formatEur(item.totalPrice), colTotal, y, { size: 9, bold: true });
    y -= 16;
  }

  y -= 4;
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 18;

  // --- Totals ---
  drawText('IS VISO:', colUnit - 30, y, { size: 11, bold: true });
  drawText(`${formatEur(data.totalAmount)} EUR`, colTotal, y, { size: 11, bold: true, color: headerBlue });
  y -= 30;

  // --- Footer ---
  drawLine(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 14;
  drawText('Saskaita suformuota Tutlio platformoje | www.tutlio.lt', MARGIN, y, { size: 7, color: gray });

  return doc.save();
}

function buildEntityLines(seller: InvoicePdfData['seller']): string[] {
  const lines: string[] = [seller.name];
  if (seller.companyCode) lines.push(`Imones kodas: ${seller.companyCode}`);
  if (seller.vatCode) lines.push(`PVM kodas: ${seller.vatCode}`);
  if (seller.address) lines.push(seller.address);
  if (seller.activityNumber) lines.push(`Veiklos Nr.: ${seller.activityNumber}`);
  if (seller.personalCode) lines.push(`Asmens kodas: ${seller.personalCode}`);
  if (seller.contactEmail) lines.push(seller.contactEmail);
  if (seller.contactPhone) lines.push(seller.contactPhone);
  return lines;
}

function buildBuyerLines(buyer: InvoicePdfData['buyer']): string[] {
  const lines: string[] = [buyer.name];
  if (buyer.companyCode) lines.push(`Imones kodas: ${buyer.companyCode}`);
  if (buyer.vatCode) lines.push(`PVM kodas: ${buyer.vatCode}`);
  if (buyer.address) lines.push(buyer.address);
  if (buyer.email) lines.push(buyer.email);
  if (buyer.phone) lines.push(buyer.phone);
  return lines;
}

function formatEur(amount: number): string {
  return amount.toFixed(2);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
}
