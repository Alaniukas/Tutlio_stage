import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { stripDocxBufferToAnnex } from '../../api/_lib/extraLessonsAnnexDocx';
import { resolveExtraLessonsBundledDocxPath } from '../../api/_lib/extraLessonsPdf';

function docxPlainText(bytes: Buffer): string {
  const zip = new PizZip(bytes);
  const xml = zip.file('word/document.xml')?.asText() || '';
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)/g)].map((m) => m[1]).join('');
}

describe('extra-lessons annex DOCX', () => {
  it('keeps only 1 PRIEDAS from the bundled Laisvi vaikai template', () => {
    const src = readFileSync(resolveExtraLessonsBundledDocxPath());
    const annex = stripDocxBufferToAnnex(src);
    expect(annex).toBeInstanceOf(Buffer);
    const text = docxPlainText(annex as Buffer);
    expect(text).toContain('Sutarties atsisakymo forma');
    expect(text).not.toMatch(/1\s*PRIEDAS/);
    expect(text).toContain('Kam');
    expect(text).toContain('Pareiškimas');
    expect(text).toContain('Parašas');
    expect(text).not.toContain('VšĮ');
    expect(text).not.toContain('Pranešu');
    expect(text).not.toContain('reikalingas tik tada');
    expect(text).not.toContain('Elektroniniu būdu pateikiant');
    expect(text).toContain('info@laisvivaikai.lt');
    expect(text).not.toContain('SUTARTIES DALYKAS');
    expect(text).not.toContain('SUTARTIES ŠALYS');
  });
});
