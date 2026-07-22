/**
 * GoSign.lt (Registrų centras) e-signing client.
 *
 * GoSign is a SOAP web service secured with asymmetric cryptography:
 *   - we sign every outgoing request with OUR RSA private key (RSA-SHA1);
 *   - GoSign signs every response, which we verify with THEIR public key.
 *
 * We use the **OneSign** service (one document per transaction; GoSign's
 * methods are Mobile-ID, LT ID, ID card and USB tokens — NO Smart-ID). A two-party
 * contract is signed as two sequential OneSign transactions on the same
 * evolving PDF: the school signs the original, then the parent signs the
 * school-signed PDF.
 *
 * Docs: https://registrucentras.github.io/gosign-api-integration/
 *
 * This module is intentionally free of any Supabase / HTTP-framework coupling so
 * that the fiddly serialization + crypto can be unit-tested against RC's own
 * documented test vectors (see tests/api/gosign.test.ts).
 */
import crypto from 'node:crypto';

export const ONESIGN_NS = 'http://www.registrucentras.lt/onesignservice';

export type GoSignInfrastructure = 'Stationary' | 'Mobile' | 'RasPerson' | 'RasCompany';
export type GoSignSigningType = 'Signature' | 'SignatureWithTimestamp' | 'SignatureWithTimestampOCSP';
export type GoSignStatus = 'InProgress' | 'Signed' | 'Canceled';

export class GoSignError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'GoSignError';
  }
}

/** An ordered signable field. `undefined`/`null` values are skipped entirely. */
export type SignedField = { name: string; value: string | number | boolean | null | undefined };

/**
 * Build the textual representation that gets RSA-signed, per the GoSign
 * "Signature elementas" rules:
 *   - concatenate every present leaf element as `<name>value</name>`, in the
 *     order defined by the OneSign/MultiSign spec;
 *   - complex types (clientInfo, file, …) contribute no wrapper tags — only
 *     their leaf children appear;
 *   - omitted elements are skipped;
 *   - the file `content` element is NEVER included (only its `fileDigest` is);
 *   - booleans render as the literal "true" / "false";
 *   - values are RAW (not XML-escaped) — the signature is computed over the
 *     decoded values, matching RC's PHP reference implementation.
 */
export function serializeSignedContent(fields: SignedField[]): string {
  let out = '';
  for (const { name, value } of fields) {
    if (value === undefined || value === null) continue;
    const v = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    out += `<${name}>${v}</${name}>`;
  }
  return out;
}

/** Sign UTF-8 content with our RSA private key using SHA1+RSA; return base64. */
export function signContent(content: string, privateKeyPem: string): string {
  return crypto.sign('RSA-SHA1', Buffer.from(content, 'utf8'), privateKeyPem).toString('base64');
}

/** Verify a base64 RSA-SHA1 signature over UTF-8 content with a PEM public key. */
export function verifyContent(content: string, signatureBase64: string, publicKeyPem: string): boolean {
  try {
    return crypto.verify(
      'RSA-SHA1',
      Buffer.from(content, 'utf8'),
      publicKeyPem,
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

/** SHA-1 digest of raw file bytes, base64-encoded — the GoSign `fileDigest`. */
export function fileDigestBase64(fileBytes: Buffer | Uint8Array): string {
  return crypto.createHash('sha1').update(Buffer.from(fileBytes)).digest('base64');
}

function xmlEscape(value: string | number | boolean): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── OneSign: InitSigning ─────────────────────────────────────────────────────

export interface OneSignFile {
  /** Client-side document id (max 128). */
  fileId?: string;
  /** SHA-1 of the raw PDF bytes, base64 (see fileDigestBase64). */
  fileDigest: string;
  /** Must end with ".pdf". Omit to hide the file name in the GoSign UI. */
  fileName?: string;
  /** Base64 PDF content — sent to GoSign but excluded from the signature. */
  content: string;
}

export interface InitOneSignParams {
  clientId: string;
  /** Restrict who may sign by personal code; omit to allow anyone. */
  signerPersonalCode?: string;
  /** GoSign UI language: "lt" | "en". */
  locale?: string;
  /** Page the browser returns to after signing (required). */
  responseUrl: string;
  remoteAddress?: string;
  /**
   * Allowed signing methods; empty ⇒ any method GoSign offers. NOTE: GoSign
   * does NOT support Smart-ID at all — its methods are Mobile-ID (temporarily
   * extended), LT ID, ID card and USB tokens.
   */
  acceptableInfrastructure?: GoSignInfrastructure[];
  /** Signature metadata (reason/location/contact). */
  reason?: string;
  location?: string;
  contact?: string;
  /** Visual placement, e.g. "relative, -1, 0.5, 0.9, 8cm, 3cm" or "hidden". */
  position?: string;
  displayValidity?: boolean;
  signatureImageUrl?: string;
  backgroundImageUrl?: string;
  mobileSigningText?: string;
  signingType: GoSignSigningType;
  file: OneSignFile;
}

/**
 * The ordered signable leaves of an InitOneSign request — the single source of
 * truth shared by the signature-content builder and the XML builder, so the two
 * can never drift. Order follows the OneSign spec exactly.
 */
export function initOneSignSignableFields(p: InitOneSignParams): SignedField[] {
  const fields: SignedField[] = [
    { name: 'clientId', value: p.clientId },
    { name: 'signerPersonalCode', value: p.signerPersonalCode },
    { name: 'locale', value: p.locale },
    { name: 'responseUrl', value: p.responseUrl },
    { name: 'remoteAddress', value: p.remoteAddress },
  ];
  for (const infra of p.acceptableInfrastructure ?? []) {
    fields.push({ name: 'acceptableInfrastructure', value: infra });
  }
  fields.push(
    { name: 'reason', value: p.reason },
    { name: 'location', value: p.location },
    { name: 'contact', value: p.contact },
    { name: 'position', value: p.position },
    { name: 'displayValidity', value: p.displayValidity },
    { name: 'signatureImageUrl', value: p.signatureImageUrl },
    { name: 'backgroundImageUrl', value: p.backgroundImageUrl },
    { name: 'mobileSigningText', value: p.mobileSigningText },
    { name: 'signingType', value: p.signingType },
    // OneSign signs fileDigest + fileName only — NOT fileId and NOT content.
    // (Confirmed against RC's live server-side canonicalization; fileId is a
    // MultiSign-only signed field.)
    { name: 'fileDigest', value: p.file.fileDigest },
    { name: 'fileName', value: p.file.fileName },
  );
  return fields;
}

function leafXml(fields: SignedField[]): string {
  let out = '';
  for (const { name, value } of fields) {
    if (value === undefined || value === null) continue;
    const v = typeof value === 'boolean' ? (value ? 'true' : 'false') : xmlEscape(value);
    out += `<${name}>${v}</${name}>`;
  }
  return out;
}

/** Build the full SOAP envelope for InitOneSign, signed with our private key. */
export function buildInitOneSignEnvelope(p: InitOneSignParams, privateKeyPem: string): string {
  const signature = signContent(serializeSignedContent(initOneSignSignableFields(p)), privateKeyPem);

  const clientInfoFields: SignedField[] = [
    { name: 'clientId', value: p.clientId },
    { name: 'signerPersonalCode', value: p.signerPersonalCode },
    { name: 'locale', value: p.locale },
    { name: 'responseUrl', value: p.responseUrl },
    { name: 'remoteAddress', value: p.remoteAddress },
  ];
  for (const infra of p.acceptableInfrastructure ?? []) {
    clientInfoFields.push({ name: 'acceptableInfrastructure', value: infra });
  }

  const metaXml = leafXml([
    { name: 'reason', value: p.reason },
    { name: 'location', value: p.location },
    { name: 'contact', value: p.contact },
  ]);
  const displayXml = leafXml([
    { name: 'position', value: p.position },
    { name: 'displayValidity', value: p.displayValidity },
    { name: 'signatureImageUrl', value: p.signatureImageUrl },
    { name: 'backgroundImageUrl', value: p.backgroundImageUrl },
  ]);
  const fileXml =
    leafXml([
      { name: 'fileId', value: p.file.fileId },
      { name: 'fileDigest', value: p.file.fileDigest },
      { name: 'fileName', value: p.file.fileName },
    ]) + `<content>${p.file.content}</content>`;

  return (
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${ONESIGN_NS}">` +
    `<SOAP-ENV:Body><ns1:InitOneSignRequest>` +
    `<ns1:clientInfo>${leafXml(clientInfoFields)}</ns1:clientInfo>` +
    (metaXml ? `<ns1:signatureMetadata>${metaXml}</ns1:signatureMetadata>` : '') +
    (displayXml ? `<ns1:signatureDisplayProperties>${displayXml}</ns1:signatureDisplayProperties>` : '') +
    (p.mobileSigningText ? `<ns1:mobileSigningText>${xmlEscape(p.mobileSigningText)}</ns1:mobileSigningText>` : '') +
    `<ns1:signingType>${p.signingType}</ns1:signingType>` +
    `<ns1:file>${fileXml}</ns1:file>` +
    `<ns1:signature>${signature}</ns1:signature>` +
    `</ns1:InitOneSignRequest></SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

/** Build a signed SOAP envelope for SigningResult (poll) or SigningCancel. */
export function buildTransactionEnvelope(
  operation: 'SigningResult' | 'SigningCancel',
  params: { clientId: string; transactionId: string | number },
  privateKeyPem: string,
): string {
  const fields: SignedField[] = [
    { name: 'clientId', value: params.clientId },
    { name: 'transactionId', value: params.transactionId },
  ];
  const signature = signContent(serializeSignedContent(fields), privateKeyPem);
  const el = operation === 'SigningResult' ? 'SigningResultRequest' : 'SigningCancelRequest';
  return (
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${ONESIGN_NS}">` +
    `<SOAP-ENV:Body><ns1:${el}>` +
    `<clientId>${xmlEscape(params.clientId)}</clientId>` +
    `<transactionId>${xmlEscape(params.transactionId)}</transactionId>` +
    `<signature>${signature}</signature>` +
    `</ns1:${el}></SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

// ── Response parsing + verification ──────────────────────────────────────────

/** Extract the inner text of the first `<localName>…</localName>` (any prefix). */
export function extractXmlElement(xml: string, localName: string): string | undefined {
  const re = new RegExp(`<(?:[\\w.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`);
  const m = xml.match(re);
  return m ? m[1] : undefined;
}

function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function assertNoSoapFault(xml: string): void {
  if (/<(?:[\w.-]+:)?Fault[>\s]/.test(xml)) {
    const fault =
      extractXmlElement(xml, 'faultstring') ?? extractXmlElement(xml, 'faultcode') ?? 'Unknown SOAP fault';
    throw new GoSignError(`GoSign SOAP fault: ${xmlUnescape(fault)}`, xml);
  }
}

export interface InitOneSignResponse {
  transactionId: string;
  signingUrl: string;
}

/**
 * Parse + verify an InitOneSignResponse. The signature covers
 * `<transactionId>…</transactionId><signingUrl>…</signingUrl>` (content rules as
 * for requests). `gosignPublicKeyPem` is undefined ⇒ verification is skipped
 * (used before RC provides their key; logs a warning at the call site).
 */
export function parseInitOneSignResponse(xml: string, gosignPublicKeyPem?: string): InitOneSignResponse {
  assertNoSoapFault(xml);
  const transactionId = extractXmlElement(xml, 'transactionId');
  const signingUrl = extractXmlElement(xml, 'signingUrl');
  const signature = extractXmlElement(xml, 'signature');
  if (!transactionId || !signingUrl) {
    throw new GoSignError('InitOneSign response missing transactionId/signingUrl', xml);
  }
  if (gosignPublicKeyPem) {
    const content = serializeSignedContent([
      { name: 'transactionId', value: xmlUnescape(transactionId) },
      { name: 'signingUrl', value: xmlUnescape(signingUrl) },
    ]);
    if (!signature || !verifyContent(content, signature, gosignPublicKeyPem)) {
      throw new GoSignError('InitOneSign response signature verification failed', xml);
    }
  }
  return { transactionId: xmlUnescape(transactionId), signingUrl: xmlUnescape(signingUrl) };
}

export interface SigningResultResponse {
  status: GoSignStatus;
  signerCertificate?: string;
  signerCertificateTrusted?: boolean;
  /** Base64 PDF of the signed document (OneSign returns it inline). */
  signedFileContent?: string;
  signedFileName?: string;
  signedFileDigest?: string;
}

/**
 * Parse + verify a SigningResult response. Verified content follows the same
 * rules (status, signerCertificate, signerCertificateTrusted, then the file's
 * leaves — fileDigest, fileName — with `content` excluded).
 *
 * NOTE: the exact field order for the SigningResult signature is asserted during
 * live test-environment integration; until then verification is best-effort and
 * a mismatch is surfaced (not silently swallowed).
 */
export function parseSigningResultResponse(xml: string, gosignPublicKeyPem?: string): SigningResultResponse {
  assertNoSoapFault(xml);
  const status = extractXmlElement(xml, 'status') as GoSignStatus | undefined;
  if (!status) throw new GoSignError('SigningResult response missing status', xml);

  const signerCertificate = extractXmlElement(xml, 'signerCertificate');
  const trustedRaw = extractXmlElement(xml, 'signerCertificateTrusted');
  const fileBlock = extractXmlElement(xml, 'file') ?? '';
  const signedFileDigest = extractXmlElement(fileBlock, 'fileDigest');
  const signedFileName = extractXmlElement(fileBlock, 'fileName');
  const signedFileContent = extractXmlElement(fileBlock, 'content');

  const result: SigningResultResponse = {
    status,
    signerCertificate: signerCertificate ? xmlUnescape(signerCertificate) : undefined,
    signerCertificateTrusted: trustedRaw === undefined ? undefined : trustedRaw.trim() === 'true',
    signedFileContent: signedFileContent ?? undefined,
    signedFileName: signedFileName ? xmlUnescape(signedFileName) : undefined,
    signedFileDigest: signedFileDigest ? xmlUnescape(signedFileDigest) : undefined,
  };

  if (gosignPublicKeyPem) {
    const signature = extractXmlElement(xml, 'signature');
    const content = serializeSignedContent([
      { name: 'status', value: status },
      { name: 'signerCertificate', value: result.signerCertificate },
      { name: 'signerCertificateTrusted', value: result.signerCertificateTrusted },
      { name: 'fileDigest', value: result.signedFileDigest },
      { name: 'fileName', value: result.signedFileName },
    ]);
    if (!signature || !verifyContent(content, signature, gosignPublicKeyPem)) {
      throw new GoSignError('SigningResult response signature verification failed', xml);
    }
  }
  return result;
}
