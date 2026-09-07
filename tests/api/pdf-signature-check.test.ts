import { describe, expect, it } from 'vitest';
import {
  countPdfSignatures,
  extractSignerNames,
  isIncrementalUpdateOf,
  validateUploadedSignedPdf,
} from '../../api/_lib/pdfSignatureCheck';

/** DER commonName attribute: OID 2.5.4.3 + UTF8String value. */
function derCommonName(name: string): Buffer {
  const value = Buffer.from(name, 'utf8');
  return Buffer.concat([Buffer.from([0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, value.length]), value]);
}

/** CMS-shaped blob: long-form DER SEQUENCE (0x30 0x82 …) padded past 1000 bytes. */
function cmsBlob(cnNames: string[]): Buffer {
  const attrs = Buffer.concat(cnNames.map(derCommonName));
  const body = Buffer.concat([attrs, Buffer.alloc(Math.max(0, 1100 - attrs.length))]);
  return Buffer.concat([Buffer.from([0x30, 0x82, (body.length >> 8) & 0xff, body.length & 0xff]), body]);
}

function sigBlock(cnNames: string[]): Buffer {
  return Buffer.from(
    `\n2 0 obj\n<< /Type /Sig /ByteRange [0 100 200 300] /Contents <${cmsBlob(cnNames).toString('hex')}> >>\nendobj\n%%EOF\n`,
    'latin1',
  );
}

const BASE = Buffer.concat([
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Pages >>\nendobj\n', 'latin1'),
  sigBlock(['RCSC IssuingCA', 'MOKYKLOS,DIREKTORE']),
]);

const SIGNED_BY_PARENT = Buffer.concat([BASE, sigBlock(['RCSC IssuingCA', 'SKVARČIENĖ,MARGARITA'])]);

describe('pdfSignatureCheck', () => {
  it('counts one signature per /ByteRange', () => {
    expect(countPdfSignatures(BASE)).toBe(1);
    expect(countPdfSignatures(SIGNED_BY_PARENT)).toBe(2);
  });

  it('accepts a PAdES incremental update with a new CMS signature', () => {
    const verdict = validateUploadedSignedPdf(SIGNED_BY_PARENT, BASE);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.mode).toBe('incremental');
      expect(verdict.addedSignatures).toBe(1);
      expect(verdict.totalSignatures).toBe(2);
      expect(verdict.signerNames).toContain('SKVARČIENĖ,MARGARITA');
    }
  });

  it('accepts a Dokobit-style rewritten PDF that adds a new person signer', () => {
    // Portal rewrote the bytes (not a prefix of BASE) but includes school + parent CNs.
    const rewritten = Buffer.concat([
      Buffer.from('%PDF-1.7\nrewritten-by-dokobit\n', 'latin1'),
      sigBlock(['RCSC IssuingCA', 'MOKYKLOS,DIREKTORE']),
      sigBlock(['SK ID Solutions EID-Q 2024E', 'SKUDŽINSKIENĖ,ASTA']),
    ]);
    const verdict = validateUploadedSignedPdf(rewritten, BASE);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.mode).toBe('dokobit_repackage');
      expect(verdict.totalSignatures).toBe(2);
      expect(verdict.signerNames).toContain('SKUDŽINSKIENĖ,ASTA');
    }
  });

  it('rejects an ADOC/ASiC container (ZIP) as not_pdf', () => {
    const zip = Buffer.from('PKrest-of-container', 'latin1');
    expect(validateUploadedSignedPdf(zip, BASE)).toEqual({ ok: false, reason: 'not_pdf' });
  });

  it('rejects a re-rendered file with no new person signer as not_incremental', () => {
    const samePeopleOnly = Buffer.concat([
      Buffer.from('%PDF-1.7\nDIFFERENT\n', 'latin1'),
      sigBlock(['RCSC IssuingCA', 'MOKYKLOS,DIREKTORE']),
    ]);
    expect(validateUploadedSignedPdf(samePeopleOnly, BASE)).toEqual({ ok: false, reason: 'not_incremental' });
    // The unchanged downloaded file (no new bytes) is also not an update.
    expect(validateUploadedSignedPdf(Buffer.from(BASE), BASE)).toEqual({ ok: false, reason: 'not_incremental' });
  });

  it('rejects an upload whose appended data has no new signature', () => {
    const padded = Buffer.concat([BASE, Buffer.from('\n% appended note, nothing signed\n', 'latin1')]);
    expect(validateUploadedSignedPdf(padded, BASE)).toEqual({ ok: false, reason: 'no_new_signature' });
  });

  it('rejects a forged tail that name-drops /ByteRange without a real CMS blob', () => {
    const forged = Buffer.concat([BASE, Buffer.from('\n% /ByteRange [0 1 2 3]\n%%EOF\n', 'latin1')]);
    expect(validateUploadedSignedPdf(forged, BASE)).toEqual({ ok: false, reason: 'no_new_signature' });

    // Even with a /Contents hex string, a short / non-SEQUENCE blob is not a CMS signature.
    const shortBlob = Buffer.concat([
      BASE,
      Buffer.from('\n<< /Type /Sig /ByteRange [0 1 2 3] /Contents <deadbeef> >>\n', 'latin1'),
    ]);
    expect(validateUploadedSignedPdf(shortBlob, BASE)).toEqual({ ok: false, reason: 'no_new_signature' });
  });

  it('reports signer names from the newly appended signature only', () => {
    const verdict = validateUploadedSignedPdf(SIGNED_BY_PARENT, BASE);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.signerNames).toContain('SKVARČIENĖ,MARGARITA');
      expect(verdict.signerNames).not.toContain('MOKYKLOS,DIREKTORE');
    }
  });

  it('orders person names (SURNAME,NAME) before CA names', () => {
    const names = extractSignerNames(SIGNED_BY_PARENT);
    expect(names[0]).toContain(',');
    expect(names).toContain('RCSC IssuingCA');
    expect(names).toContain('SKVARČIENĖ,MARGARITA');
  });

  it('isIncrementalUpdateOf is strict about the prefix', () => {
    expect(isIncrementalUpdateOf(SIGNED_BY_PARENT, BASE)).toBe(true);
    expect(isIncrementalUpdateOf(BASE, SIGNED_BY_PARENT)).toBe(false);
  });
});
