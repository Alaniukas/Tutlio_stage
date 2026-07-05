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

function normalizePem(raw: string | undefined): string {
  return (raw || '').replace(/\\n/g, '\n').trim();
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
    responsePublicKeyPem: normalizePem(process.env.GOSIGN_RESPONSE_PUBLIC_KEY) || undefined,
    locale: envStr('GOSIGN_LOCALE') || 'lt',
    // Last page, horizontally centred, near the bottom, 8cm × 3cm. Override once
    // the school confirms where signature blocks live in their template.
    signaturePosition: envStr('GOSIGN_SIGNATURE_POSITION') || 'relative, -1, 0.5, 0.88, 8cm, 3cm',
    soapAction: process.env.GOSIGN_SOAP_ACTION ?? '',
  };
}

export type SignerRole = 'school' | 'parent_primary' | 'parent_secondary';

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
  };
  const override = envStr(perRole[role]);
  if (override) return override;

  const defaults: Record<SignerRole, string> = {
    school: 'absolute, 1, 0.8cm, 0.8cm, 6cm, 2.4cm',
    parent_primary: 'absolute, 1, 7.2cm, 0.8cm, 6cm, 2.4cm',
    parent_secondary: 'absolute, 1, 13.6cm, 0.8cm, 6cm, 2.4cm',
  };
  return defaults[role];
}

export function isGoSignConfigured(): boolean {
  return getGoSignConfig() !== null;
}

export function goSignNotConfiguredMessage(): string {
  return 'GoSign e-signing not configured (set GOSIGN_CLIENT_ID, GOSIGN_PRIVATE_KEY, GOSIGN_ONESIGN_ENDPOINT)';
}
