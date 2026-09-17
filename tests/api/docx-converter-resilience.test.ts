import { afterEach, expect, it, vi } from 'vitest';
import { convertWithDocxConverterService } from '../../api/_lib/docxConverter';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('uses a cancellable deadline and validates PDF bytes', async () => {
  vi.stubEnv('DOCX_CONVERTER_URL', 'https://converter.example');
  vi.stubEnv('DOCX_CONVERTER_API_KEY', 'test');
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ pdfBase64: Buffer.from('%PDF-1.7\ntest').toString('base64') }),
  });
  vi.stubGlobal('fetch', fetch);

  expect((await convertWithDocxConverterService(Buffer.from('docx'))).toString()).toContain('%PDF-');
  expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ pdfBase64: Buffer.from('broken').toString('base64') }),
  });
  await expect(convertWithDocxConverterService(Buffer.from('docx'))).rejects.toThrow('invalid PDF');
});

it('retries busy converter responses using Retry-After', async () => {
  vi.useFakeTimers();
  vi.stubEnv('DOCX_CONVERTER_URL', 'https://converter.example');
  vi.stubEnv('DOCX_CONVERTER_API_KEY', 'test');
  const fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '1' : null) },
      json: async () => ({ error: 'Converter busy' }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pdfBase64: Buffer.from('%PDF-1.7\nok').toString('base64') }),
    });
  vi.stubGlobal('fetch', fetch);

  const pending = convertWithDocxConverterService(Buffer.from('docx'));
  await vi.advanceTimersByTimeAsync(1000);
  expect((await pending).toString()).toContain('%PDF-');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('aborts a hung conversion within one total caller budget', async () => {
  vi.useFakeTimers();
  vi.stubEnv('DOCX_CONVERTER_URL', 'https://converter.example');
  vi.stubEnv('DOCX_CONVERTER_API_KEY', 'test');
  const fetch = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));
  vi.stubGlobal('fetch', fetch);

  const pending = expect(convertWithDocxConverterService(Buffer.from('docx'), { timeoutMs: 1000 }))
    .rejects.toThrow('timed out after 1000ms');
  await vi.advanceTimersByTimeAsync(1000);
  await pending;
  expect(fetch).toHaveBeenCalledTimes(1);
});
