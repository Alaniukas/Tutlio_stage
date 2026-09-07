import { createPrivateKey } from 'node:crypto';

/**
 * GoSign.lt environment configuration.
 *
 * Set these per Vercel environment — TEST credentials on Preview/Development,
 * PROD credentials on Production (RC issues a separate key pair + endpoint per
 * environment). RC provides `GOSIGN_CLIENT_ID`, `GOSIGN_ONESIGN_ENDPOINT` and
 * `GOSIGN_RESPONSE_PUBLIC_KEY` during onboarding; `GOSIGN_PRIVATE_KEY` is ours
 * (its matching public key is registered with RC).
 *
 * Private/public keys are PEM. Env stores usually keep them with literal "\n";
 * we normalize those back to real newlines.
 */
export interface GoSignConfig {
  clientId: string;
  privateKeyPem: string;
  onesignEndpoint: string;
  /** GoSign's public key for response verification; may be absent pre-onboarding. */
  responsePublicKeyPem?: string;
  /** GoSign UI language ("lt" | "en"). */
  locale: string;
  /** Default signature visualization placement (see GoSign Position element). */
  signaturePosition: string;
  /** SOAPAction header value (RC confirms; empty is accepted by most stacks). */
  soapAction: string;
}

/**
 * Registru centras publishes this production response-verification key in the
 * official GoSign integration documentation. It is public (not a credential)
 * and is pinned here so production never silently accepts an unverified SOAP
 * response when an environment override is absent.
 *
 * Source: https://github.com/registrucentras/gosign-api-integration/blob/master/docs/keys/php_prod.key
 */
export const GOSIGN_OFFICIAL_PROD_RESPONSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA9l+OCK6T9jnn4e/kNQVP
oyePlH+GhK6Ik1gEW+OH71gpdXbjWatw9pBE2eeSOovQkSmjlsbh5WzSzkr5ywK/
BEoco+ns6fugIwjypAmRc2JJo1CUW2GGQnEF+ociysjNbpGLDqweawL+UzK+JL+M
nxOyRBw9JJZDj+fQvErpVk0mec3TUTEUlbjJd5WbwbtRXE4DooZFVgccbamg10la
0E4b9/DgSUJXRliOw5Cn1rXC/nn9aYSjsx89DeTRHZmKqPWCsmI6k+WTzhh/Kpdw
5xfPcgj3T7Hav0xXBTM2QR3XSyGg/EfYqvsV2FLTxDaDvVEBMc1pMX00ihsBTgoh
dQIDAQAB
-----END PUBLIC KEY-----`;

export function normalizePem(raw: string | undefined): string {
  const normalized = (raw || '').replace(/\\n/g, '\n').trim();
  const completePem = normalized.match(
    /-----BEGIN ([A-Z ]+KEY)-----[\s\S]*?-----END \1-----/,
  );
  if (completePem?.[0]) return completePem[0].trim();

  const compactBase64 = normalized.replace(/\s/g, '');
  if (compactBase64 && /^[A-Za-z0-9+/]+={0,2}$/.test(compactBase64)) {
    const der = Buffer.from(compactBase64, 'base64');
    for (const type of ['pkcs1', 'pkcs8'] as const) {
      try {
        return createPrivateKey({ key: der, format: 'der', type })
          .export({ format: 'pem', type: 'pkcs1' })
          .toString()
          .trim();
      } catch {
        // Try the other common RSA private-key container.
      }
    }
  }

  return normalized;
}

function envStr(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Resolve the GoSign config, or `null` if the essential credentials are absent.
 * Endpoints/UI use this to feature-detect whether e-signing is wired up yet.
 */
export function getGoSignConfig(): GoSignConfig | null {
  const clientId = envStr('GOSIGN_CLIENT_ID');
  const privateKeyPem = normalizePem(process.env.GOSIGN_PRIVATE_KEY);
  const onesignEndpoint = envStr('GOSIGN_ONESIGN_ENDPOINT');
  if (!clientId || !privateKeyPem || !onesignEndpoint) return null;

  return {
    clientId,
    privateKeyPem,
    onesignEndpoint,
    responsePublicKeyPem:
      normalizePem(process.env.GOSIGN_RESPONSE_PUBLIC_KEY) || GOSIGN_OFFICIAL_PROD_RESPONSE_PUBLIC_KEY,
    locale: envStr('GOSIGN_LOCALE') || 'lt',
    // Last page, horizontally centred, near the bottom, 8cm × 3cm. Override once
    // the school confirms where signature blocks live in their template.
    signaturePosition: envStr('GOSIGN_SIGNATURE_POSITION') || 'relative, -1, 0.5, 0.88, 8cm, 3cm',
    soapAction: process.env.GOSIGN_SOAP_ACTION ?? '',
  };
}

export type SignerRole = 'school' | 'parent_primary' | 'parent_secondary' | 'teacher';

/**
 * Visible signature placement per signer — a row of stamps in the top-left
 * corner (school, then parent 1, then parent 2). Absolute coords on page 1
 * (A4 = 21cm wide): three 6cm-wide stamps at x = 0.8 / 7.2 / 13.6 cm, y = 0.8cm
 * from the top. Override any of them via env once tuned against a real render;
 * the signature is a valid PAdES signature regardless of where the stamp sits.
 */
export function signaturePositionForRole(role: SignerRole): string {
  const perRole: Record<SignerRole, string> = {
    school: 'GOSIGN_POS_SCHOOL',
    parent_primary: 'GOSIGN_POS_PARENT1',
    parent_secondary: 'GOSIGN_POS_PARENT2',
    teacher: 'GOSIGN_POS_TEACHER',
  };
  const override = envStr(perRole[role]);
  if (override) return override;

  const defaults: Record<SignerRole, string> = {
    school: 'absolute, 1, 0.8cm, 0.8cm, 6cm, 2.4cm',
    parent_primary: 'absolute, 1, 7.2cm, 0.8cm, 6cm, 2.4cm',
    parent_secondary: 'absolute, 1, 13.6cm, 0.8cm, 6cm, 2.4cm',
    teacher: 'absolute, 1, 7.2cm, 0.8cm, 6cm, 2.4cm',
  };
  return defaults[role];
}

export function isGoSignConfigured(): boolean {
  return getGoSignConfig() !== null;
}

export function goSignNotConfiguredMessage(): string {
  return 'GoSign e-signing not configured (set GOSIGN_CLIENT_ID, GOSIGN_PRIVATE_KEY, GOSIGN_ONESIGN_ENDPOINT)';
}
