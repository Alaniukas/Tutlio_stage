import { afterEach, describe, expect, it, vi } from 'vitest';

const SCRIPT_SELECTOR = '#tutlio-perlas-pay';

afterEach(() => {
  delete window.PerlasPay;
  document.querySelector(SCRIPT_SELECTOR)?.remove();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('PerlasPay lazy loader', () => {
  it('uses an already available bridge without injecting a script', async () => {
    const init = vi.fn();
    window.PerlasPay = { init };
    const { startPerlasPayment } = await import('@/lib/perlasPay');

    await startPerlasPayment('https://pay.example/', 'token-1');

    expect(init).toHaveBeenCalledWith('https://pay.example/', 'token-1');
    expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull();
  });

  it('injects the bridge only on demand and initializes after it loads', async () => {
    const { startPerlasPayment } = await import('@/lib/perlasPay');
    expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull();

    const init = vi.fn();
    const payment = startPerlasPayment('https://pay.example/', 'token-2');
    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
    expect(script?.src).toBe('https://mip-pay.dataop.lt/pay.js');
    expect(script?.async).toBe(true);

    window.PerlasPay = { init };
    script?.dispatchEvent(new Event('load'));
    await payment;

    expect(init).toHaveBeenCalledWith('https://pay.example/', 'token-2');
  });

  it('shares one in-flight script between concurrent payment attempts', async () => {
    const { startPerlasPayment } = await import('@/lib/perlasPay');
    const init = vi.fn();

    const first = startPerlasPayment('https://pay.example/', 'first');
    const second = startPerlasPayment('https://pay.example/', 'second');
    expect(document.querySelectorAll(SCRIPT_SELECTOR)).toHaveLength(1);

    window.PerlasPay = { init };
    document.querySelector(SCRIPT_SELECTOR)?.dispatchEvent(new Event('load'));
    await Promise.all([first, second]);

    expect(init).toHaveBeenNthCalledWith(1, 'https://pay.example/', 'first');
    expect(init).toHaveBeenNthCalledWith(2, 'https://pay.example/', 'second');
  });

  it('removes a failed script and falls back to an encoded direct URL', async () => {
    const navigate = vi.fn();
    const { startPerlasPayment } = await import('@/lib/perlasPay');

    const payment = startPerlasPayment('https://pay.example', 'token / 4', navigate);
    document.querySelector(SCRIPT_SELECTOR)?.dispatchEvent(new Event('error'));
    await payment;

    expect(document.querySelector(SCRIPT_SELECTOR)).toBeNull();
    expect(navigate).toHaveBeenCalledWith('https://pay.example/pay/token%20%2F%204');
  });

  it('builds the same direct URL whether the API base has a trailing slash or not', async () => {
    const { buildPerlasPaymentUrl } = await import('@/lib/perlasPay');

    expect(buildPerlasPaymentUrl('https://pay.example/', 'abc')).toBe('https://pay.example/pay/abc');
    expect(buildPerlasPaymentUrl('https://pay.example', 'abc')).toBe('https://pay.example/pay/abc');
  });
});
