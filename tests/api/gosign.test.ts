import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  serializeSignedContent,
  signContent,
  verifyContent,
  fileDigestBase64,
  initOneSignSignableFields,
  buildInitOneSignEnvelope,
  buildTransactionEnvelope,
  parseInitOneSignResponse,
  parseSigningResultResponse,
  extractXmlElement,
  GoSignError,
} from '../../api/_lib/gosign';
import { normalizePem } from '../../api/_lib/gosignConfig';

describe('gosign — PEM normalization', () => {
  it('extracts the first complete key from a quote-wrapped concatenated value', () => {
    const first =
      '-----BEGIN RSA PRIVATE KEY-----\nFIRST\n-----END RSA PRIVATE KEY-----';
    const malformed =
      `"${first}\nSECOND-WITHOUT-BEGIN\n-----END RSA PRIVATE KEY-----"`;

    expect(normalizePem(malformed)).toBe(first);
  });

  it('converts a base64 DER RSA private key into usable PEM', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const derBase64 = privateKey.export({ type: 'pkcs1', format: 'der' }).toString('base64');
    const normalized = normalizePem(derBase64);
    const normalizedPublic = crypto.createPublicKey(crypto.createPrivateKey(normalized));

    expect(
      normalizedPublic.export({ type: 'spki', format: 'pem' }).toString(),
    ).toBe(publicKey.export({ type: 'spki', format: 'pem' }).toString());
  });
});

/**
 * Golden vector from RC's own docs (response-verification.html): a real
 * InitOneSignResponse signed by GoSign, plus the public key that verifies it.
 * If our serialization or RSA-SHA1 verification is wrong, this fails.
 */
const RC_RESPONSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvMMlz6PVuKly4WKw9kGC
zo33gMY2hLzokoZkQe/5jSOQtDzNt3L2Bt1IJeQv5Ivlpjy+Sz0FZAgMb1T7m5nX
DUN2ZwK2srXC4SzYTK0qD0i+AGfzjeHbGUD2ETBQ+S9js5VpMX5Q957mAyeDWmbA
v3UGQ6CAnAzYQLpoApxhmIgy0Ers/RwtqKZBnFcyeGXqq7ft4HtWH1UnAclxTC7b
YAHH+sKsqpIWvZFGDcct0zeUVnr7KfTQmS3Za505SdEL45Kow2+GoLIdup2+IqPA
hG0uqAEKwxs5/DMCH8U+dGspMll9ltsQrDYw1UTkL6zLnCSw77+3Xu3XwY2vJZ3r
9wIDAQAB
-----END PUBLIC KEY-----`;

const RC_INIT_RESPONSE_XML = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
   <SOAP-ENV:Header/>
   <SOAP-ENV:Body>
      <ns3:InitOneSignResponse xmlns:ns3="http://www.registrucentras.lt/onesignservice">
         <transactionId>445190</transactionId>
         <signingUrl>https://example.com/unisign/ui/445190/282702111d7cced39fd1cbb699d6c1438646a109/main?locale=lt</signingUrl>
         <signature>IdUcXIAb4lafwo2GQWMX+t+tYQ5IeqgXX5pCzo+Lml4cDj9GA3WJp0V1Y1TfMF8CyjgWMhkkdfqBD76xP7lW1jWGD4SnokeZv75Y5BPZcE73qLJ56ynXSq+6fO9NZLpP4TvwZTn9FxyKnvZPLvUj5ZyH3sk0nEmz58w1R3FK/q/SHxC1m4p6nrZd8zLEdw9IJYvowcZicVTmqTJLjqp1CyPU00D5kA4xl1oAWfoO7yb3kmCYshTQnJqSjllFql5FZB4Jh1u61UFMJ+3QuwSRrz/ad5Jq9bVp9TfxeHx7N/p/V0yiFMxNjx0WJaoB52CdeOGxDj+44fs2nKiw4u9xaw==</signature>
      </ns3:InitOneSignResponse>
   </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

describe('gosign — signature-content serialization', () => {
  it('matches the documented OneSign serialized string exactly', () => {
    // Inputs mirror RC's signature.html OneSign example.
    const fields = initOneSignSignableFields({
      clientId: 'client_id',
      signerPersonalCode: 'signer_code',
      responseUrl: 'http://example.com/app',
      signingType: 'Signature',
      file: { fileDigest: '0v5NcpPFHEttzbsxm0urXlc5MIE=', fileName: 'pdf.pdf', content: 'failo_turinys_base64' },
    });
    expect(serializeSignedContent(fields)).toBe(
      '<clientId>client_id</clientId>' +
        '<signerPersonalCode>signer_code</signerPersonalCode>' +
        '<responseUrl>http://example.com/app</responseUrl>' +
        '<signingType>Signature</signingType>' +
        '<fileDigest>0v5NcpPFHEttzbsxm0urXlc5MIE=</fileDigest>' +
        '<fileName>pdf.pdf</fileName>',
    );
  });

  it('skips omitted fields and never includes file content', () => {
    const s = serializeSignedContent(
      initOneSignSignableFields({
        clientId: 'c',
        responseUrl: 'https://x/app',
        signingType: 'Signature',
        file: { fileDigest: 'DIGEST', content: 'BASE64PDF' },
      }),
    );
    expect(s).toBe('<clientId>c</clientId><responseUrl>https://x/app</responseUrl><signingType>Signature</signingType><fileDigest>DIGEST</fileDigest>');
    expect(s).not.toContain('BASE64PDF');
    expect(s).not.toContain('signerPersonalCode');
  });

  it('matches RC live server-side canonicalization (real vector, excludes fileId)', () => {
    // The exact string RC reported generating its signature from during a live
    // InitSigning call. Guards against re-introducing fileId into the signature.
    const s = serializeSignedContent(
      initOneSignSignableFields({
        clientId: 'TUTLIO_PRODID',
        locale: 'lt',
        responseUrl: 'https://tutlio.lt/school-sign/return?token=integration-test',
        position: 'hidden',
        signingType: 'Signature',
        file: { fileId: 'itest-1', fileDigest: 'lvO+3Js5B1C7D/rHW8Y39vidB38=', fileName: 'test.pdf', content: 'x' },
      }),
    );
    expect(s).toBe(
      '<clientId>TUTLIO_PRODID</clientId><locale>lt</locale>' +
        '<responseUrl>https://tutlio.lt/school-sign/return?token=integration-test</responseUrl>' +
        '<position>hidden</position><signingType>Signature</signingType>' +
        '<fileDigest>lvO+3Js5B1C7D/rHW8Y39vidB38=</fileDigest><fileName>test.pdf</fileName>',
    );
    expect(s).not.toContain('itest-1'); // fileId must NOT be signed
  });

  it('renders booleans as literal true/false', () => {
    const s = serializeSignedContent([{ name: 'displayValidity', value: true }, { name: 'x', value: false }]);
    expect(s).toBe('<displayValidity>true</displayValidity><x>false</x>');
  });
});

describe('gosign — fileDigest (SHA1 base64)', () => {
  it('computes the SHA-1 digest of raw bytes, base64-encoded', () => {
    // openssl: printf 'abc' | openssl sha1 -binary | base64  => qZk+NkcGgWq6PiVxeFDCbJzQ2J0=
    expect(fileDigestBase64(Buffer.from('abc'))).toBe('qZk+NkcGgWq6PiVxeFDCbJzQ2J0=');
  });
});

describe('gosign — response content reconstruction (documented representation)', () => {
  it('reconstructs the exact textual representation RC documents for a response', () => {
    // RC's response-verification.html shows this XML converts to this string
    // before verification. Our extraction + serialization must reproduce it
    // byte-for-byte, otherwise real-server signatures would never verify.
    const tx = extractXmlElement(RC_INIT_RESPONSE_XML, 'transactionId');
    const url = extractXmlElement(RC_INIT_RESPONSE_XML, 'signingUrl');
    const reconstructed = serializeSignedContent([
      { name: 'transactionId', value: tx },
      { name: 'signingUrl', value: url },
    ]);
    expect(reconstructed).toBe(
      '<transactionId>445190</transactionId>' +
        '<signingUrl>https://example.com/unisign/ui/445190/282702111d7cced39fd1cbb699d6c1438646a109/main?locale=lt</signingUrl>',
    );
  });
});

describe('gosign — response verification (real matching triple)', () => {
  // NOTE: RC's published response-verification example is ILLUSTRATIVE ONLY — its
  // signature does not correspond to either published public key (verified via
  // openssl: no key/algo/padding/encoding combination validates it). So we prove
  // the full parse+verify path with a locally-generated matching triple, and the
  // guard test below records the doc inconsistency.
  function makeSignedResponse(tx: string, url: string, priv: string): string {
    const content = serializeSignedContent([
      { name: 'transactionId', value: tx },
      { name: 'signingUrl', value: url },
    ]);
    const sig = signContent(content, priv);
    return (
      `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<SOAP-ENV:Body><ns3:InitOneSignResponse xmlns:ns3="http://www.registrucentras.lt/onesignservice">` +
      `<transactionId>${tx}</transactionId><signingUrl>${url}</signingUrl><signature>${sig}</signature>` +
      `</ns3:InitOneSignResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`
    );
  }

  it('parses + verifies a genuinely signed InitOneSignResponse end-to-end', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const priv = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const url = 'https://gosign.test/unisign/ui/999/abcdef/main?locale=lt';
    const parsed = parseInitOneSignResponse(makeSignedResponse('999', url, priv), pub);
    expect(parsed).toEqual({ transactionId: '999', signingUrl: url });
  });

  it('throws on a tampered response (signature no longer matches)', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const priv = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const url = 'https://gosign.test/unisign/ui/999/abcdef/main?locale=lt';
    const tampered = makeSignedResponse('999', url, priv).replace('<transactionId>999<', '<transactionId>1000<');
    expect(() => parseInitOneSignResponse(tampered, pub)).toThrow(GoSignError);
  });

  it('throws when the response is signed by the wrong key', () => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const wrongKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(() => parseInitOneSignResponse(RC_INIT_RESPONSE_XML, wrongKey)).toThrow(GoSignError);
  });

  it('skips verification when no GoSign public key is supplied', () => {
    const parsed = parseInitOneSignResponse(RC_INIT_RESPONSE_XML);
    expect(parsed.transactionId).toBe('445190');
  });

  it('guard: RC published example does not verify with its published key (doc is illustrative)', () => {
    const docContent =
      '<transactionId>445190</transactionId>' +
      '<signingUrl>https://example.com/unisign/ui/445190/282702111d7cced39fd1cbb699d6c1438646a109/main?locale=lt</signingUrl>';
    const docSig =
      'IdUcXIAb4lafwo2GQWMX+t+tYQ5IeqgXX5pCzo+Lml4cDj9GA3WJp0V1Y1TfMF8CyjgWMhkkdfqBD76xP7lW1jWGD4SnokeZv75Y5BPZcE73qLJ56ynXSq+6fO9NZLpP4TvwZTn9FxyKnvZPLvUj5ZyH3sk0nEmz58w1R3FK/q/SHxC1m4p6nrZd8zLEdw9IJYvowcZicVTmqTJLjqp1CyPU00D5kA4xl1oAWfoO7yb3kmCYshTQnJqSjllFql5FZB4Jh1u61UFMJ+3QuwSRrz/ad5Jq9bVp9TfxeHx7N/p/V0yiFMxNjx0WJaoB52CdeOGxDj+44fs2nKiw4u9xaw==';
    expect(verifyContent(docContent, docSig, RC_RESPONSE_PUBLIC_KEY)).toBe(false);
  });
});

describe('gosign — request signing round-trip', () => {
  it('signs a request and verifies it with the matching public key', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const priv = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const content = serializeSignedContent(
      initOneSignSignableFields({
        clientId: 'tutlio',
        responseUrl: 'https://tutlio.lt/school-contract-sign-callback?sig=abc',
        signingType: 'Signature',
        file: { fileDigest: fileDigestBase64(Buffer.from('%PDF-1.7 fake')), fileName: 'Sutartis.pdf', content: 'x' },
      }),
    );
    const sig = signContent(content, priv);
    expect(verifyContent(content, sig, pub)).toBe(true);
  });

  it('embeds a signature and escapes XML in the InitOneSign envelope', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const priv = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const xml = buildInitOneSignEnvelope(
      {
        clientId: 'tutlio',
        responseUrl: 'https://tutlio.lt/cb?a=1&b=2',
        locale: 'lt',
        signingType: 'Signature',
        position: 'relative, -1, 0.5, 0.9, 8cm, 3cm',
        file: { fileId: 'contract-1', fileDigest: 'DG==', fileName: 'Sutartis.pdf', content: 'QkFTRTY0' },
      },
      priv,
    );
    expect(xml).toContain('<ns1:InitOneSignRequest>');
    expect(xml).toContain('<responseUrl>https://tutlio.lt/cb?a=1&amp;b=2</responseUrl>'); // escaped in XML
    expect(xml).toContain('<content>QkFTRTY0</content>');
    expect(xml).toContain('<ns1:signature>');
    expect(extractXmlElement(xml, 'signature')).toBeTruthy();
  });

  it('builds signed SigningResult / SigningCancel envelopes', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const priv = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const poll = buildTransactionEnvelope('SigningResult', { clientId: 'tutlio', transactionId: 445191 }, priv);
    expect(poll).toContain('<ns1:SigningResultRequest>');
    expect(poll).toContain('<transactionId>445191</transactionId>');
    const cancel = buildTransactionEnvelope('SigningCancel', { clientId: 'tutlio', transactionId: '445169' }, priv);
    expect(cancel).toContain('<ns1:SigningCancelRequest>');
  });
});

describe('gosign — SigningResult parsing', () => {
  const SIGNED_XML = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
   <SOAP-ENV:Body>
      <ns3:SigningResultResponse xmlns:ns3="http://www.registrucentras.lt/onesignservice">
         <status>Signed</status>
         <signerCertificate>Q0VSVA==</signerCertificate>
         <signerCertificateTrusted>true</signerCertificateTrusted>
         <file>
            <fileDigest>b7ITt5heY+e6Lm+AXJnYgqBiLos=</fileDigest>
            <fileName>sample-s0812.pdf</fileName>
            <content>U0lHTkVEUERGQllURVM=</content>
         </file>
         <signature>Zm9v</signature>
      </ns3:SigningResultResponse>
   </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;

  it('extracts status, certificate and the signed PDF content (no key ⇒ no verify)', () => {
    const r = parseSigningResultResponse(SIGNED_XML);
    expect(r.status).toBe('Signed');
    expect(r.signerCertificateTrusted).toBe(true);
    expect(r.signedFileName).toBe('sample-s0812.pdf');
    expect(r.signedFileContent).toBe('U0lHTkVEUERGQllURVM=');
    expect(r.signedFileDigest).toBe('b7ITt5heY+e6Lm+AXJnYgqBiLos=');
  });

  it('handles the InProgress status with no file', () => {
    const xml = `<SOAP-ENV:Envelope><SOAP-ENV:Body><ns3:SigningResultResponse xmlns:ns3="x"><status>InProgress</status><file/><signature>Zm9v</signature></ns3:SigningResultResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
    const r = parseSigningResultResponse(xml);
    expect(r.status).toBe('InProgress');
    expect(r.signedFileContent).toBeUndefined();
  });

  it('detects SOAP faults', () => {
    const fault = `<SOAP-ENV:Envelope><SOAP-ENV:Body><SOAP-ENV:Fault><faultstring>Invalid signature</faultstring></SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
    expect(() => parseSigningResultResponse(fault)).toThrow(/Invalid signature/);
  });
});
