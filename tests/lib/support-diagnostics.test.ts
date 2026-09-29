import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSupportDiagnostics,
  getSupportDiagnostics,
  installSupportDiagnostics,
} from '@/lib/supportDiagnostics';

let uninstall: (() => void) | null = null;
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = window.fetch;
  window.history.replaceState({}, '', '/company/students');
  clearSupportDiagnostics();
  document.body.innerHTML = '';
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  window.fetch = originalFetch;
  clearSupportDiagnostics();
  document.body.innerHTML = '';
});

describe('support diagnostics', () => {
  it('keeps route and click context without collecting form values or sensitive URLs', () => {
    uninstall = installSupportDiagnostics();
    window.history.pushState({}, '', '/company/students/123e4567-e89b-12d3-a456-426614174000?token=secret');

    const button = document.createElement('button');
    button.textContent = 'Delete Jane Smith';
    button.dataset.supportAction = 'student.delete.open';
    const input = document.createElement('input');
    input.value = 'private student note';
    document.body.append(button, input);
    button.click();
    input.click();

    const save = document.createElement('button');
    save.textContent = 'Išsaugoti';
    document.body.append(save);
    save.click();

    const dynamic = document.createElement('button');
    dynamic.textContent = 'Save Jane Smith';
    dynamic.dataset.supportAction = 'student.delete.123';
    document.body.append(dynamic);
    dynamic.click();

    const link = document.createElement('a');
    link.href = '/school/finance?invoice=hidden';
    link.textContent = 'Sensitive customer name';
    link.addEventListener('click', (event) => event.preventDefault());
    document.body.append(link);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(getSupportDiagnostics()).toEqual([
      expect.objectContaining({ type: 'navigation', path: '/company/students' }),
      expect.objectContaining({ type: 'navigation', path: '/company/students/:detail' }),
      expect.objectContaining({ type: 'click', control: 'button', action: 'student.delete.open' }),
      expect.objectContaining({ type: 'click', control: 'button', action: 'save' }),
      expect.objectContaining({ type: 'click', control: 'button' }),
      expect.objectContaining({ type: 'click', control: 'link', targetPath: '/school/finance' }),
    ]);
    expect(getSupportDiagnostics()[4]).not.toHaveProperty('action');
    expect(JSON.stringify(getSupportDiagnostics())).not.toMatch(/secret|Jane Smith|private student note|hidden|Sensitive customer name|123e4567/i);
  });

  it('records only same-origin API failures and preserves fetch responses and errors', async () => {
    const failure = new Response('private server error', {
      status: 500,
      headers: { 'x-vercel-id': 'iad1::abc123', 'date': 'Tue, 29 Sep 2026 12:00:00 GMT' },
    });
    const networkError = new Error('private network detail');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(new Response('external error', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockRejectedValueOnce(networkError);
    window.fetch = fetchMock as typeof fetch;
    uninstall = installSupportDiagnostics();

    const returned = await window.fetch('/api/pay-session?invoice=private', {
      method: 'POST',
      body: JSON.stringify({ card: 'secret' }),
    });
    expect(returned).toBe(failure);
    await window.fetch('https://other.example/api/pay-session?token=secret');
    await window.fetch('/api/healthy');
    await expect(window.fetch('/api/pay-session?token=private', { method: 'PATCH' })).rejects.toBe(networkError);

    const failures = getSupportDiagnostics().filter((event) => event.type === 'api_failure');
    expect(failures).toEqual([
      expect.objectContaining({ endpoint: '/api/pay-session', method: 'POST', status: 500, vercelId: 'iad1::abc123', at: '2026-09-29T12:00:00.000Z' }),
      expect.objectContaining({ endpoint: '/api/pay-session', method: 'PATCH', status: 0 }),
    ]);
    expect(JSON.stringify(failures)).not.toMatch(/private|secret|card|server error|network detail/);
  });

  it('does not let support chat activity displace the product issue history', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })) as typeof fetch;
    uninstall = installSupportDiagnostics();
    window.history.pushState({}, '', '/student/support');
    await window.fetch('/api/in-app-support-assist', { method: 'POST' });
    await window.fetch('/api/support-chat', { method: 'POST' });

    expect(getSupportDiagnostics()).toEqual([
      expect.objectContaining({ type: 'navigation', path: '/company/students' }),
    ]);
  });
});
