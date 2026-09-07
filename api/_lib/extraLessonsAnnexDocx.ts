import PizZip from 'pizzip';
import {
  EXTRA_LESSONS_WITHDRAWAL_FORM_TITLE,
  extraLessonsWithdrawalFormSubmitNote,
} from '../../src/lib/extraLessonsContract.js';

function paragraphPlainText(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

export function isExtraLessonsAnnexHeading(text: string): boolean {
  return /(?:^|\s)1\s*PRIEDAS\b/i.test(String(text || '').replace(/\s+/g, ' ').trim());
}

export function isWithdrawalFormEsignFootnote(text: string): boolean {
  const n = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return n.includes('elektroniniu būdu pateikiant') && n.includes('elektroninis parašas');
}

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceFirstTextRun(pXml: string, next: string): string {
  const open = pXml.match(/<w:t\b[^>]*>/);
  if (!open || open.index == null) return pXml;
  const start = open.index + open[0].length;
  const end = pXml.indexOf('</w:t>', start);
  if (end < 0) return pXml;
  const head = pXml.slice(0, start) + xmlText(next);
  let tail = pXml.slice(end);
  tail = tail.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g, '');
  return head + tail;
}

function clearCellText(tcXml: string): string {
  return tcXml.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g, (full) => {
    const openMatch = full.match(/^<w:t\b[^>]*>/);
    let open = openMatch ? openMatch[0] : '<w:t>';
    if (!/xml:space="preserve"/.test(open)) {
      open = open.replace('<w:t', '<w:t xml:space="preserve"');
    }
    return `${open}</w:t>`;
  });
}

function blankAnnexValueCells(bodyInner: string): string {
  return bodyInner.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tbl) => (
    tbl.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (tr) => {
      const cells = [...tr.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)];
      if (cells.length < 2) return tr;
      let out = tr;
      for (let i = 1; i < cells.length; i++) {
        out = out.replace(cells[i][0], clearCellText(cells[i][0]));
      }
      return out;
    })
  ));
}

function prepareStandaloneAnnexBody(bodyInner: string): string {
  let headingDone = false;
  const retitled = bodyInner.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (pXml) => {
    const text = paragraphPlainText(pXml);
    if (isWithdrawalFormEsignFootnote(text)) return '';
    if (!headingDone && isExtraLessonsAnnexHeading(text)) {
      headingDone = true;
      return replaceFirstTextRun(pXml, EXTRA_LESSONS_WITHDRAWAL_FORM_TITLE);
    }
    return pXml;
  });
  return blankAnnexValueCells(retitled);
}

function submitNoteParagraph(note: string): string {
  return `<w:p><w:pPr><w:spacing w:before="360"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${xmlText(note)}</w:t></w:r></w:p>`;
}

/**
 * Keep only the withdrawal annex from a filled extra-lessons DOCX, retitle it
 * as a standalone blank form, drop the Tutlio e-signature footnote, and add
 * the "send this request to the school" note.
 */
export function stripDocxBufferToAnnex(
  docxBytes: ArrayBuffer | Uint8Array | Buffer,
  opts?: { submitNote?: string | null },
): Buffer | null {
  const zip = new PizZip(docxBytes);
  const file = zip.file('word/document.xml');
  if (!file) return null;
  const xml = file.asText();
  const bodyOpen = xml.match(/<w:body\b[^>]*>/);
  const bodyClose = xml.lastIndexOf('</w:body>');
  if (!bodyOpen || bodyOpen.index == null || bodyClose < 0) return null;
  const bodyStart = bodyOpen.index + bodyOpen[0].length;
  const bodyInner = xml.slice(bodyStart, bodyClose);
  const paraRe = /<w:p\b[\s\S]*?<\/w:p>/g;
  let annexAt = -1;
  for (const match of bodyInner.matchAll(paraRe)) {
    if (match.index == null) continue;
    if (isExtraLessonsAnnexHeading(paragraphPlainText(match[0]))) {
      annexAt = match.index;
      break;
    }
  }
  if (annexAt < 0) return null;
  let kept = prepareStandaloneAnnexBody(bodyInner.slice(annexAt));
  if (!kept.includes(xmlText(EXTRA_LESSONS_WITHDRAWAL_FORM_TITLE))) return null;
  const note = String(opts?.submitNote ?? extraLessonsWithdrawalFormSubmitNote()).trim();
  if (note) {
    const para = submitNoteParagraph(note);
    kept = /<w:sectPr\b/.test(kept) ? kept.replace(/<w:sectPr\b/, `${para}<w:sectPr`) : `${kept}${para}`;
  }
  const next = `${xml.slice(0, bodyStart)}${kept}${xml.slice(bodyClose)}`;
  zip.file('word/document.xml', next);
  return Buffer.from(zip.generate({ type: 'uint8array' }));
}
