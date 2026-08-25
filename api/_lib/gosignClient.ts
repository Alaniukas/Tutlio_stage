/**
 * GoSign OneSign transport — composes the pure builders/parsers in gosign.ts
 * with the environment config and does the actual SOAP-over-HTTP calls.
 *
 * Signing flow (one signer per transaction):
 *   1. initOneSign(pdf) → { transactionId, signingUrl }; redirect the browser to
 *      signingUrl.
 *   2. after the browser returns to our responseUrl, poll getSigningResult until
 *      status leaves "InProgress"; on "Signed" the signed PDF comes back inline.
 */
import {
  ONESIGN_NS,
  buildInitOneSignEnvelope,
  buildTransactionEnvelope,
  parseInitOneSignResponse,
  parseSigningResultResponse,
  GoSignError,
  type InitOneSignParams,
  type InitOneSignResponse,
  type SigningResultResponse,
} from './gosign.js';
import { getGoSignConfig, goSignNotConfiguredMessage } from './gosignConfig.js';

/**
 * SOAPAction header value — RC's WSDL defines a DISTINCT action per operation
 * (…/InitSigning, …/SigningResult, …/SigningCancel). `GOSIGN_SOAP_ACTION`, if
 * set, overrides for all operations (rarely needed).
 */
function soapActionFor(operation: string, override: string): string {
  return override || `${ONESIGN_NS}/${operation}`;
}

/** InitOneSign params with clientId/locale/position supplied from config. */
export type InitOneSignInput = Omit<InitOneSignParams, 'clientId'>;

/**
 * InitSigning carries the whole PDF inline and RC's latency spikes past 30 s at
 * times (schools saw sporadic "timed out"), so it gets a longer budget than the
 * small status/cancel calls. Endpoints doing InitSigning must set a Vercel
 * maxDuration comfortably above RETRY_WINDOW_MS + INIT_SIGNING_TIMEOUT_MS.
 */
export const INIT_SIGNING_TIMEOUT_MS = 60_000;
/** A transient failure is only retried when the first attempt died this fast. */
export const RETRY_WINDOW_MS = 10_000;

/**
 * True for failures where the request almost certainly never produced a GoSign
 * transaction: transport-level errors and empty-bodied HTTP errors (gateway
 * hiccups). Timeouts are excluded — the transaction may exist AND a retry would
 * double the caller's wall-clock — as are SOAP faults (RC did answer).
 */
export function isTransientGoSignFailure(err: unknown): boolean {
  if (!(err instanceof GoSignError)) return false;
  if (err.message.includes('timed out')) return false;
  if (err.message.startsWith('GoSign request failed:')) return true;
  return err.message.includes('with empty body');
}

async function postSoapOnce(
  endpoint: string,
  soapAction: string,
  xml: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"${soapAction}"`,
      },
      body: xml,
      signal: controller.signal,
    });
    const text = await resp.text();
    // SOAP faults come back as 500 WITH a body — let the parser surface those.
    // Only a truly empty error response is unrecoverable here.
    if (!resp.ok && resp.status !== 202 && !text) {
      throw new GoSignError(`GoSign HTTP ${resp.status} with empty body`, { status: resp.status });
    }
    return text;
  } catch (err) {
    if (err instanceof GoSignError) throw err;
    const reason = (err as Error)?.name === 'AbortError' ? 'timed out' : (err as Error)?.message;
    throw new GoSignError(`GoSign request failed: ${reason}`, err);
  } finally {
    clearTimeout(timer);
  }
}

async function postSoap(
  endpoint: string,
  soapAction: string,
  xml: string,
  { timeoutMs = 30_000, retryTransient = false }: { timeoutMs?: number; retryTransient?: boolean } = {},
): Promise<string> {
  const startedAt = Date.now();
  try {
    return await postSoapOnce(endpoint, soapAction, xml, timeoutMs);
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    if (retryTransient && elapsed < RETRY_WINDOW_MS && isTransientGoSignFailure(err)) {
      console.warn(`[gosign] transient failure after ${elapsed}ms — retrying once:`, (err as Error).message);
      return await postSoapOnce(endpoint, soapAction, xml, timeoutMs);
    }
    throw err;
  }
}

/** Initiate a OneSign transaction and return the signing URL to redirect to. */
export async function initOneSign(input: InitOneSignInput): Promise<InitOneSignResponse> {
  const cfg = getGoSignConfig();
  if (!cfg) throw new GoSignError(goSignNotConfiguredMessage());

  const params: InitOneSignParams = {
    ...input,
    clientId: cfg.clientId,
    locale: input.locale ?? cfg.locale,
    position: input.position ?? cfg.signaturePosition,
  };
  const xml = buildInitOneSignEnvelope(params, cfg.privateKeyPem);
  const respXml = await postSoap(cfg.onesignEndpoint, soapActionFor('InitSigning', cfg.soapAction), xml, {
    timeoutMs: INIT_SIGNING_TIMEOUT_MS,
    retryTransient: true,
  });
  if (!cfg.responsePublicKeyPem) {
    console.warn('[gosign] response verification skipped — GOSIGN_RESPONSE_PUBLIC_KEY not set');
  }
  return parseInitOneSignResponse(respXml, cfg.responsePublicKeyPem);
}

/** Fetch the current status (and, when Signed, the signed PDF) of a transaction. */
export async function getSigningResult(
  transactionId: string | number,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {},
): Promise<SigningResultResponse> {
  const cfg = getGoSignConfig();
  if (!cfg) throw new GoSignError(goSignNotConfiguredMessage());
  const xml = buildTransactionEnvelope('SigningResult', { clientId: cfg.clientId, transactionId }, cfg.privateKeyPem);
  const respXml = await postSoap(
    cfg.onesignEndpoint,
    soapActionFor('SigningResult', cfg.soapAction),
    xml,
    { timeoutMs },
  );
  return parseSigningResultResponse(respXml, cfg.responsePublicKeyPem);
}

/**
 * Poll SigningResult until the transaction leaves "InProgress" (or attempts run
 * out). GoSign finalizes signing asynchronously, so right after the browser
 * returns the status is often still InProgress.
 */
export async function pollSigningResult(
  transactionId: string | number,
  { attempts = 6, delayMs = 1500, timeoutMs }: { attempts?: number; delayMs?: number; timeoutMs?: number } = {},
): Promise<SigningResultResponse> {
  let last: SigningResultResponse | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await getSigningResult(transactionId, timeoutMs != null ? { timeoutMs } : {});
    if (last.status !== 'InProgress') return last;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return last as SigningResultResponse;
}

/** Cancel an in-progress transaction (best-effort; GoSign replies 202). */
export async function cancelSigning(transactionId: string | number): Promise<void> {
  const cfg = getGoSignConfig();
  if (!cfg) throw new GoSignError(goSignNotConfiguredMessage());
  const xml = buildTransactionEnvelope('SigningCancel', { clientId: cfg.clientId, transactionId }, cfg.privateKeyPem);
  await postSoap(cfg.onesignEndpoint, soapActionFor('SigningCancel', cfg.soapAction), xml);
}
