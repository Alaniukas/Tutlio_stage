import { PDFDocument, rgb, StandardFonts, type PDFImage, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';

export interface InvoicePdfBranding {
  brandName?: string;
  primaryColor: RGB;
  secondaryColor: RGB;
  logo?: { bytes: Uint8Array; mime: 'png' | 'jpeg' };
}

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

  deductedAmount?: number;
  amountDue?: number;
  paidNote?: string[];

  branding?: InvoicePdfBranding;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const COL_WIDTH = PAGE_WIDTH - MARGIN * 2;
const DESC_COL_MAX_WIDTH = 268;
const LINE_ITEM_FONT_SIZE = 9;
const LINE_ITEM_LINE_HEIGHT = 13;
const MIN_ROW_HEIGHT = 18;

const LT_MAP: Record<string, string> = {
  'ą': 'a', 'č': 'c', 'ę': 'e', 'ė': 'e', 'į': 'i', 'š': 's', 'ų': 'u', 'ū': 'u', 'ž': 'z',
  'Ą': 'A', 'Č': 'C', 'Ę': 'E', 'Ė': 'E', 'Į': 'I', 'Š': 'S', 'Ų': 'U', 'Ū': 'U', 'Ž': 'Z',
};
const LT_RE = new RegExp(`[${Object.keys(LT_MAP).join('')}]`, 'g');

/** Strip Lithuanian diacritics so pdf-lib StandardFonts (WinAnsi) can render the text. */
export function asciify(text: string): string {
  return text.replace(LT_RE, (ch) => LT_MAP[ch] || ch);
}

/** Word-wrap for invoice line descriptions (supports explicit `\n` for date lines). */
export function wrapInvoiceDescription(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  const paragraphs = String(text || '').split('\n');

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(asciify(candidate), fontSize);
      if (width > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
  }

  return out.length > 0 ? out : [''];
}

type DrawCtx = {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  primary: RGB;
  secondary: RGB;
  gray: RGB;
  black: RGB;
  lightGray: RGB;
};

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const defaultPrimary = rgb(0.24, 0.35, 0.59);
  const defaultSecondary = rgb(0.35, 0.45, 0.65);
  const branding = data.branding;
  const primary = branding?.primaryColor ?? defaultPrimary;
  const secondary = branding?.secondaryColor ?? defaultSecondary;

  const ctx: DrawCtx = {
    page,
    font,
    fontBold,
    primary,
    secondary,
    gray: rgb(0.3, 0.3, 0.3),
    black: rgb(0, 0, 0),
    lightGray: rgb(0.85, 0.85, 0.85),
  };

  const headerTop = PAGE_HEIGHT - MARGIN;
  let logoBottom = headerTop;

  if (branding?.logo) {
    const img = await embedInvoiceLogo(doc, branding.logo);
    if (img) {
      const maxW = 120;
      const maxH = 48;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, {
        x: PAGE_WIDTH - MARGIN - w,
        y: headerTop - h,
        width: w,
        height: h,
      });
      logoBottom = headerTop - h;
    }
  }

  let y = headerTop - 16;
  drawText(ctx, 'SASKAITA FAKTURA', MARGIN, y, { size: 16, bold: true, color: primary });
  y -= 22;
  drawText(ctx, `Nr. ${data.invoiceNumber}`, MARGIN, y, { size: 11, bold: true });
  drawText(ctx, `Data: ${data.issueDate}`, MARGIN + 250, y, { size: 9, color: ctx.gray });
  y -= 14;

  if (data.periodStart && data.periodEnd) {
    drawText(ctx, `Laikotarpis: ${data.periodStart} - ${data.periodEnd}`, MARGIN, y, {
      size: 9,
      color: ctx.gray,
    });
    y -= 14;
  }

  if (branding?.brandName) {
    drawText(ctx, branding.brandName, MARGIN, y, { size: 8, color: ctx.gray });
    y -= 14;
  }

  const headerBottom = Math.min(y, logoBottom) - 10;
  page.drawRectangle({
    x: MARGIN,
    y: headerBottom - 2,
    width: COL_WIDTH,
    height: 2,
    color: secondary,
  });
  y = headerBottom - 16;

  // Seller / Buyer
  const halfWidth = COL_WIDTH / 2 - 10;
  const sellerX = MARGIN;
  const buyerX = MARGIN + halfWidth + 20;

  drawText(ctx, 'PARDAVEJAS / PASLAUGU TEIKEJAS', sellerX, y, { size: 8, bold: true, color: ctx.gray });
  drawText(ctx, 'PIRKEJAS / PASLAUGU GAVEJAS', buyerX, y, { size: 8, bold: true, color: ctx.gray });
  y -= 14;

  const sellerLines = buildEntityLines(data.seller);
  const buyerLines = buildBuyerLines(data.buyer);
  const maxLines = Math.max(sellerLines.length, buyerLines.length);

  for (let i = 0; i < maxLines; i++) {
    if (sellerLines[i]) drawText(ctx, sellerLines[i], sellerX, y, { size: 9 });
    if (buyerLines[i]) drawText(ctx, buyerLines[i], buyerX, y, { size: 9 });
    y -= 13;
  }

  y -= 10;
  drawLine(ctx, MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 20;

  const colDesc = MARGIN;
  const colQty = MARGIN + 280;
  const colUnit = MARGIN + 340;
  const colTotal = MARGIN + 420;

  const tableHeaderHeight = 20;
  const tableHeaderBottom = y - tableHeaderHeight;
  page.drawRectangle({
    x: MARGIN,
    y: tableHeaderBottom,
    width: COL_WIDTH,
    height: tableHeaderHeight,
    color: rgb(
      primary.red * 0.12 + 0.88,
      primary.green * 0.12 + 0.88,
      primary.blue * 0.12 + 0.88,
    ),
  });

  const tableHeaderTextY = tableHeaderBottom + 6;
  drawText(ctx, 'Paslaugos aprasymas', colDesc, tableHeaderTextY, {
    size: 8,
    bold: true,
    color: primary,
  });
  drawText(ctx, 'Kiekis', colQty, tableHeaderTextY, { size: 8, bold: true, color: primary });
  drawText(ctx, 'Vnt. kaina', colUnit, tableHeaderTextY, { size: 8, bold: true, color: primary });
  drawText(ctx, 'Suma, EUR', colTotal, tableHeaderTextY, { size: 8, bold: true, color: primary });
  y = tableHeaderBottom - 6;
  drawLine(ctx, MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 12;

  const ensureSpace = (needed: number) => {
    if (y >= MARGIN + needed) return;
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.page = page;
    y = PAGE_HEIGHT - MARGIN - 20;
  };

  for (const item of data.lineItems) {
    const descLines = wrapInvoiceDescription(
      item.description,
      font,
      LINE_ITEM_FONT_SIZE,
      DESC_COL_MAX_WIDTH,
    );
    const rowHeight = Math.max(MIN_ROW_HEIGHT, descLines.length * LINE_ITEM_LINE_HEIGHT);
    ensureSpace(rowHeight + 40);

    for (let i = 0; i < descLines.length; i++) {
      drawText(ctx, descLines[i], colDesc, y - i * LINE_ITEM_LINE_HEIGHT, {
        size: LINE_ITEM_FONT_SIZE,
      });
    }
    drawText(ctx, String(item.quantity), colQty + 10, y, { size: LINE_ITEM_FONT_SIZE });
    drawText(ctx, formatEur(item.unitPrice), colUnit, y, { size: LINE_ITEM_FONT_SIZE });
    drawText(ctx, formatEur(item.totalPrice), colTotal, y, {
      size: LINE_ITEM_FONT_SIZE,
      bold: true,
    });
    y -= rowHeight;
  }

  y -= 4;
  drawLine(ctx, MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 18;

  ensureSpace(80);
  drawText(ctx, 'IS VISO:', colUnit - 30, y, { size: 11, bold: true });
  drawText(ctx, `${formatEur(data.totalAmount)} EUR`, colTotal, y, {
    size: 11,
    bold: true,
    color: primary,
  });
  y -= 18;

  if (data.deductedAmount != null && data.deductedAmount > 0) {
    drawText(ctx, 'Jau apmoketa (isskaityta is jusu lesu):', colDesc + 130, y, {
      size: 9,
      color: ctx.gray,
    });
    drawText(ctx, `-${formatEur(data.deductedAmount)} EUR`, colTotal, y, { size: 9, color: ctx.gray });
    y -= 16;
  }

  if (data.amountDue != null) {
    drawText(ctx, 'MOKETINA SUMA:', colUnit - 30, y, { size: 12, bold: true });
    drawText(ctx, `${formatEur(data.amountDue)} EUR`, colTotal, y, {
      size: 12,
      bold: true,
      color: primary,
    });
    y -= 18;
  }

  if (data.paidNote && data.paidNote.length > 0) {
    y -= 6;
    const [first, ...rest] = data.paidNote;
    drawText(ctx, first, colDesc, y, { size: 10, bold: true, color: rgb(0.1, 0.5, 0.3) });
    y -= 14;
    for (const line of rest) {
      drawText(ctx, line, colDesc, y, { size: 8, color: ctx.gray });
      y -= 12;
    }
  }
  y -= 12;

  drawLine(ctx, MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 14;
  drawText(ctx, 'Saskaita suformuota Tutlio platformoje | www.tutlio.lt', MARGIN, y, {
    size: 7,
    color: ctx.gray,
  });

  return doc.save();
}

async function embedInvoiceLogo(
  doc: PDFDocument,
  logo: { bytes: Uint8Array; mime: 'png' | 'jpeg' },
): Promise<PDFImage | null> {
  try {
    return logo.mime === 'jpeg' ? await doc.embedJpg(logo.bytes) : await doc.embedPng(logo.bytes);
  } catch {
    try {
      return await doc.embedJpg(logo.bytes);
    } catch {
      try {
        return await doc.embedPng(logo.bytes);
      } catch {
        return null;
      }
    }
  }
}

function drawText(
  ctx: DrawCtx,
  text: string,
  x: number,
  yPos: number,
  opts?: { size?: number; bold?: boolean; color?: RGB },
) {
  const f = opts?.bold ? ctx.fontBold : ctx.font;
  const size = opts?.size || 9;
  ctx.page.drawText(asciify(text), {
    x,
    y: yPos,
    size,
    font: f,
    color: opts?.color || ctx.black,
  });
}

function drawLine(ctx: DrawCtx, x1: number, yPos: number, x2: number) {
  ctx.page.drawLine({
    start: { x: x1, y: yPos },
    end: { x: x2, y: yPos },
    thickness: 0.5,
    color: ctx.lightGray,
  });
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
