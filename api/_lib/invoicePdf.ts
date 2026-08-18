import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFImage, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';

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
    bankName?: string;
    iban?: string;
    taxExemptionNote?: string;
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

  isVatInvoice?: boolean;
  invoiceNumberLabel?: string;
  layout?: 'default' | 'pvm_education';
  notes?: string[];
  lessonDetails?: { subject: string; price: number; datetime: string }[];
  hidePlatformFooter?: boolean;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const COL_WIDTH = PAGE_WIDTH - MARGIN * 2;
const DESC_COL_MAX_WIDTH = 268;
const LINE_ITEM_FONT_SIZE = 9;
const LINE_ITEM_LINE_HEIGHT = 13;
const MIN_ROW_HEIGHT = 18;

const FONT_FILES = {
  regular: 'NotoSans-Regular.ttf',
  bold: 'NotoSans-Bold.ttf',
} as const;

/** Candidate roots — Vercel serverless should use process.cwd(); local/tsx often uses import.meta.url. */
export function invoiceFontCandidateDirs(): string[] {
  const dirs: string[] = [];
  const cwd = process.cwd();
  dirs.push(join(cwd, 'api', '_lib', 'fonts'));
  dirs.push(join(cwd, 'fonts'));
  try {
    dirs.push(join(dirname(fileURLToPath(import.meta.url)), 'fonts'));
  } catch {
    /* ignore */
  }
  return dirs;
}

export function resolveInvoiceFontPath(weight: 'regular' | 'bold'): string {
  const fileName = FONT_FILES[weight];
  for (const dir of invoiceFontCandidateDirs()) {
    const full = join(dir, fileName);
    if (existsSync(full)) return full;
  }
  throw new Error(
    `Invoice PDF font missing: ${fileName}. Tried: ${invoiceFontCandidateDirs().join(' | ')}. ` +
      'Ensure api/_lib/fonts/*.ttf are committed and listed in vercel.json includeFiles.',
  );
}

let cachedRegular: Uint8Array | null = null;
let cachedBold: Uint8Array | null = null;

function loadInvoiceFontBytes(weight: 'regular' | 'bold'): Uint8Array {
  if (weight === 'bold') {
    if (!cachedBold) {
      cachedBold = new Uint8Array(readFileSync(resolveInvoiceFontPath('bold')));
    }
    return cachedBold;
  }
  if (!cachedRegular) {
    cachedRegular = new Uint8Array(readFileSync(resolveInvoiceFontPath('regular')));
  }
  return cachedRegular;
}

const LT_MAP: Record<string, string> = {
  'ą': 'a', 'č': 'c', 'ę': 'e', 'ė': 'e', 'į': 'i', 'š': 's', 'ų': 'u', 'ū': 'u', 'ž': 'z',
  'Ą': 'A', 'Č': 'C', 'Ę': 'E', 'Ė': 'E', 'Į': 'I', 'Š': 'S', 'Ų': 'U', 'Ū': 'U', 'Ž': 'Z',
};
const LT_RE = new RegExp(`[${Object.keys(LT_MAP).join('')}]`, 'g');

export function asciify(text: string): string {
  return text.replace(LT_RE, (ch) => LT_MAP[ch] || ch);
}

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
      const width = font.widthOfTextAtSize(candidate, fontSize);
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
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(loadInvoiceFontBytes('regular'), { subset: true });
  const fontBold = await doc.embedFont(loadInvoiceFontBytes('bold'), { subset: true });
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const defaultPrimary = rgb(0.24, 0.35, 0.59);
  const defaultSecondary = rgb(0.35, 0.45, 0.65);
  const branding = data.branding;
  const primary = branding?.primaryColor ?? defaultPrimary;
  const secondary = branding?.secondaryColor ?? defaultSecondary;
  const isPvmLayout = data.layout === 'pvm_education';
  const isVatInvoice = data.isVatInvoice === true || isPvmLayout || !!data.seller.vatCode;
  const title = isVatInvoice ? 'PVM SĄSKAITA FAKTŪRA' : 'SĄSKAITA FAKTŪRA';
  const numberLabel = data.invoiceNumberLabel || `Nr. ${data.invoiceNumber}`;

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
  drawText(ctx, title, MARGIN, y, { size: 16, bold: true, color: primary });
  y -= 22;
  drawText(ctx, numberLabel, MARGIN, y, { size: 11, bold: true });
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

  const halfWidth = COL_WIDTH / 2 - 10;
  const sellerX = MARGIN;
  const buyerX = MARGIN + halfWidth + 20;

  drawText(ctx, 'PARDAVĖJAS / PASLAUGŲ TEIKĖJAS', sellerX, y, { size: 8, bold: true, color: ctx.gray });
  drawText(ctx, 'PIRKĖJAS / PASLAUGŲ GAVĖJAS', buyerX, y, { size: 8, bold: true, color: ctx.gray });
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
  const headerFill = rgb(
    primary.red * 0.12 + 0.88,
    primary.green * 0.12 + 0.88,
    primary.blue * 0.12 + 0.88,
  );

  const ensureSpace = (needed: number) => {
    if (y >= MARGIN + needed) return;
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.page = page;
    y = PAGE_HEIGHT - MARGIN - 20;
  };

  const drawTableHeaderBar = (labels: { text: string; x: number }[]) => {
    const tableHeaderHeight = 20;
    const tableHeaderBottom = y - tableHeaderHeight;
    page.drawRectangle({
      x: MARGIN,
      y: tableHeaderBottom,
      width: COL_WIDTH,
      height: tableHeaderHeight,
      color: headerFill,
    });
    const tableHeaderTextY = tableHeaderBottom + 6;
    for (const label of labels) {
      drawText(ctx, label.text, label.x, tableHeaderTextY, { size: 8, bold: true, color: primary });
    }
    y = tableHeaderBottom - 6;
    drawLine(ctx, MARGIN, y, PAGE_WIDTH - MARGIN);
    y -= 12;
  };

  if (isPvmLayout) {
    drawTableHeaderBar([
      { text: 'Eil. Nr.', x: colDesc },
      { text: 'Prekės ar paslaugos pavadinimas', x: colDesc + 50 },
      { text: 'Suma, EUR', x: colTotal },
    ]);
    ensureSpace(40);
    drawText(ctx, '1', colDesc, y, { size: LINE_ITEM_FONT_SIZE });
    drawText(ctx, 'Mokymo paslaugos', colDesc + 50, y, { size: LINE_ITEM_FONT_SIZE });
    drawText(ctx, formatEur(data.totalAmount), colTotal, y, { size: LINE_ITEM_FONT_SIZE, bold: true });
    y -= MIN_ROW_HEIGHT;
  } else {
    drawTableHeaderBar([
      { text: 'Paslaugos aprašymas', x: colDesc },
      { text: 'Kiekis', x: colQty },
      { text: 'Vnt. kaina', x: colUnit },
      { text: 'Suma, EUR', x: colTotal },
    ]);

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
  }

  y -= 4;
  drawLine(ctx, MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 18;

  const taxExemptionNote = data.seller.taxExemptionNote?.trim();
  ensureSpace(taxExemptionNote ? 98 : 80);
  drawText(ctx, 'IŠ VISO:', colUnit - 30, y, { size: 11, bold: true });
  const totalAmountText = `${formatEur(data.totalAmount)} EUR`;
  drawText(ctx, totalAmountText, colTotal, y, {
    size: 11,
    bold: true,
    color: primary,
  });
  y -= 18;

  if (taxExemptionNote) {
    const noteSize = 8;
    const noteWidth = ctx.font.widthOfTextAtSize(taxExemptionNote, noteSize);
    const totalAmountRight = colTotal + ctx.fontBold.widthOfTextAtSize(totalAmountText, 11);
    drawText(ctx, taxExemptionNote, Math.max(MARGIN, totalAmountRight - noteWidth), y, {
      size: noteSize,
      color: ctx.black,
    });
    y -= 16;
  }

  if (data.deductedAmount != null && data.deductedAmount > 0) {
    drawText(ctx, 'Jau apmokėta (išskaityta iš jūsų lėšų):', colDesc + 130, y, {
      size: 9,
      color: ctx.gray,
    });
    drawText(ctx, `-${formatEur(data.deductedAmount)} EUR`, colTotal, y, { size: 9, color: ctx.gray });
    y -= 16;
  }

  if (data.amountDue != null) {
    drawText(ctx, 'MOKĖTINA SUMA:', colUnit - 30, y, { size: 12, bold: true });
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

  if (isPvmLayout && data.lessonDetails && data.lessonDetails.length > 0) {
    ensureSpace(50);
    drawText(ctx, 'Pamokų detalizacija', MARGIN, y, { size: 10, bold: true });
    y -= 16;
    drawTableHeaderBar([
      { text: 'Pamoka', x: colDesc },
      { text: 'Kaina', x: colUnit },
      { text: 'Data', x: colTotal - 10 },
    ]);
    for (const lesson of data.lessonDetails) {
      ensureSpace(24);
      drawText(ctx, lesson.subject, colDesc, y, { size: LINE_ITEM_FONT_SIZE });
      drawText(ctx, `${formatEur(lesson.price)} Eur`, colUnit, y, { size: LINE_ITEM_FONT_SIZE });
      drawText(ctx, lesson.datetime, colTotal - 10, y, { size: LINE_ITEM_FONT_SIZE });
      y -= MIN_ROW_HEIGHT;
    }
    y -= 8;
  }

  if (data.notes && data.notes.length > 0) {
    for (const note of data.notes) {
      const noteLines = wrapInvoiceDescription(note, font, 8, COL_WIDTH);
      ensureSpace(noteLines.length * 12 + 8);
      for (const line of noteLines) {
        drawText(ctx, line, MARGIN, y, { size: 8, color: ctx.gray });
        y -= 12;
      }
      y -= 4;
    }
  }

  if (!data.hidePlatformFooter && !isPvmLayout) {
    drawLine(ctx, MARGIN, y, PAGE_WIDTH - MARGIN);
    y -= 14;
    drawText(ctx, 'Sąskaita suformuota Tutlio platformoje | www.tutlio.lt', MARGIN, y, {
      size: 7,
      color: ctx.gray,
    });
  }

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
  ctx.page.drawText(String(text ?? ''), {
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
  if (seller.companyCode) lines.push(`Įmonės kodas: ${seller.companyCode}`);
  if (seller.vatCode) lines.push(`PVM kodas: ${seller.vatCode}`);
  if (seller.address) lines.push(seller.address);
  if (seller.activityNumber) lines.push(`Veiklos Nr.: ${seller.activityNumber}`);
  if (seller.personalCode) lines.push(`Asmens kodas: ${seller.personalCode}`);
  if (seller.contactEmail) lines.push(seller.contactEmail);
  if (seller.contactPhone) lines.push(seller.contactPhone);
  if (seller.bankName) lines.push(`Bankas: ${seller.bankName}`);
  if (seller.iban) lines.push(`Sąskaita: ${seller.iban}`);
  return lines;
}

function buildBuyerLines(buyer: InvoicePdfData['buyer']): string[] {
  const lines: string[] = [buyer.name];
  if (buyer.companyCode) lines.push(`Įmonės kodas: ${buyer.companyCode}`);
  if (buyer.vatCode) lines.push(`PVM kodas: ${buyer.vatCode}`);
  if (buyer.address) lines.push(buyer.address);
  if (buyer.email) lines.push(buyer.email);
  if (buyer.phone) lines.push(buyer.phone);
  return lines;
}

function formatEur(n: number): string {
  return n.toFixed(2).replace('.', ',');
}
