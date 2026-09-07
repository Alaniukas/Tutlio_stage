/**
 * Loads the optional PerlasFinance browser bridge only after a payer chooses
 * bank payment. Keeping it out of index.html prevents an unused third-party
 * request from competing with public-page rendering and Core Web Vitals.
 */

const PERLAS_PAY_SRC = 'https://mip-pay.dataop.lt/pay.js';
const PERLAS_PAY_SCRIPT_ID = 'tutlio-perlas-pay';

interface PerlasPayBridge {
  init(url: string, token: string): void;
}

declare global {
  interface Window {
    PerlasPay?: PerlasPayBridge;
  }
}

let pendingBridge: Promise<PerlasPayBridge> | null = null;

function loadPerlasPayBridge(): Promise<PerlasPayBridge> {
  if (window.PerlasPay) return Promise.resolve(window.PerlasPay);
  if (pendingBridge) return pendingBridge;

  pendingBridge = new Promise<PerlasPayBridge>((resolve, reject) => {
    const existing = document.getElementById(PERLAS_PAY_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    let timeoutId: number | undefined;

    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
    const onLoad = () => {
      cleanup();
      if (window.PerlasPay) resolve(window.PerlasPay);
      else {
        script.remove();
        reject(new Error('PerlasPay bridge did not initialize'));
      }
    };
    const onError = () => {
      cleanup();
      script.remove();
      reject(new Error('PerlasPay bridge failed to load'));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    timeoutId = window.setTimeout(onError, 8000);

    if (!existing) {
      script.id = PERLAS_PAY_SCRIPT_ID;
      script.src = PERLAS_PAY_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  }).finally(() => {
    pendingBridge = null;
  });

  return pendingBridge;
}

export function buildPerlasPaymentUrl(url: string, token: string): string {
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}pay/${encodeURIComponent(token)}`;
}

/** Uses the bridge when available and safely falls back to a direct redirect. */
export async function startPerlasPayment(
  url: string,
  token: string,
  navigate: (target: string) => void = (target) => window.location.assign(target),
): Promise<void> {
  try {
    const bridge = await loadPerlasPayBridge();
    bridge.init(url, token);
  } catch {
    navigate(buildPerlasPaymentUrl(url, token));
  }
}
