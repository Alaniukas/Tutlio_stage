/**
 * Offline technical validation of a parent-uploaded signed contract PDF
 * (the Smart-ID / Dokobit path, where signing happens outside GoSign).
 *
 * PAdES requires every added signature to be appended as an incremental
 * update — otherwise the earlier (school) signature would be invalidated. That
 * gives us three cheap, deterministic checks with no external service:
 *   1. the file is a PDF at all;
 *   2. it starts with the exact bytes of the PDF the parent was given to sign
 *      (same contract, school signature untouched, not re-rendered/ADOC);
 *   3. it contains more signatures than the input did (a new one was added).
 */

/** Each PDF signature dictionary carries exactly one /ByteRange entry. */
export function countPdfSignatures(bytes: Buffer): number {
  let count = 0;
  let from = 0;
  const needle = Buffer.from('/ByteRange');
  while (true) {
    const at = bytes.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

export function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** True when `candidate` is `base` plus appended data (PAdES incremental update). */
export function isIncrementalUpdateOf(candidate: Buffer, base: Buffer): boolean {
  if (candidate.length <= base.length) return false;
  return candidate.subarray(0, base.length).equals(base);
}

/**
 * Best-effort signer names from the embedded CMS blobs: hex-decode every
 * /Contents <…> string and scan the DER for commonName (OID 2.5.4.3) values.
 * Display metadata only — never used as a validation gate.
 */
export function extractSignerNames(bytes: Buffer): string[] {
  const names = new Set<string>();
  const text = bytes.toString('latin1');
  const contentsRe = /\/Contents\s*<([0-9A-Fa-f\s]+)>/g;
  for (const match of text.matchAll(contentsRe)) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length < 8 || hex.length % 2 !== 0) continue;
    let der: Buffer;
    try {
      der = Buffer.from(hex, 'hex');
    } catch {
      continue;
    }
    for (const name of scanDerForCommonNames(der)) names.add(name);
  }
  // Lithuanian qualified certs put persons as "SURNAME,NAME" — surface those
  // first so callers can show a human over CA names like "RCSC IssuingCA".
  return [...names].sort((a, b) => Number(b.includes(',')) - Number(a.includes(',')));
}

function scanDerForCommonNames(der: Buffer): string[] {
  const out: string[] = [];
  const oid = Buffer.from([0x06, 0x03, 0x55, 0x04, 0x03]); // OID 2.5.4.3 commonName
  let from = 0;
  while (true) {
    const at = der.indexOf(oid, from);
    if (at === -1) return out;
    from = at + oid.length;
    let i = from;
    const tag = der[i];
    if (tag !== 0x0c && tag !== 0x13) continue; // UTF8String | PrintableString
    i += 1;
    let len = der[i];
    if (len === undefined) continue;
    i += 1;
    if (len & 0x80) {
      const lenBytes = len & 0x7f;
      if (lenBytes < 1 || lenBytes > 2 || i + lenBytes > der.length) continue;
      len = 0;
      for (let b = 0; b < lenBytes; b += 1) len = (len << 8) | der[i + b];
      i += lenBytes;
    }
    if (len < 2 || len > 120 || i + len > der.length) continue;
    const value = der.subarray(i, i + len).toString('utf8').trim();
    if (value && !/[\u0000-\u001f\u007f]/u.test(value)) out.push(value);
  }
}

/**
 * The appended (incremental-update) region must contain an actual CMS blob,
 * not merely the text "/ByteRange": a /Contents hex string of ≥1000 bytes
 * whose DER starts with a long-form SEQUENCE (0x30 0x82 …) — how every real
 * PKCS#7/CMS signature begins. Blocks "append a /ByteRange comment" uploads.
 */
function tailHasCmsSignature(tail: Buffer): boolean {
  const text = tail.toString('latin1');
  for (const match of text.matchAll(/\/Contents\s*<([0-9A-Fa-f\s]+)>/g)) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length < 2000 || hex.length % 2 !== 0) continue;
    if (hex.slice(0, 4).toLowerCase() === '3082') return true;
  }
  return false;
}

export type UploadedPdfValidation =
  | { ok: true; addedSignatures: number; totalSignatures: number; signerNames: string[] }
  | { ok: false; reason: 'not_pdf' | 'not_incremental' | 'no_new_signature' };

export function validateUploadedSignedPdf(uploaded: Buffer, base: Buffer): UploadedPdfValidation {
  if (!isPdf(uploaded)) return { ok: false, reason: 'not_pdf' };
  if (!isIncrementalUpdateOf(uploaded, base)) return { ok: false, reason: 'not_incremental' };
  const tail = uploaded.subarray(base.length);
  const addedSignatures = countPdfSignatures(tail);
  if (addedSignatures < 1 || !tailHasCmsSignature(tail)) return { ok: false, reason: 'no_new_signature' };
  return {
    ok: true,
    addedSignatures,
    totalSignatures: countPdfSignatures(uploaded),
    signerNames: extractSignerNames(tail),
  };
}
