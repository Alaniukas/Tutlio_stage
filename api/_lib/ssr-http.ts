import type { VercelRequest, VercelResponse } from '../types';

export function isSsrMethod(method: string | undefined): boolean {
  return method === 'GET' || method === 'HEAD';
}

export function rejectSsrMethod(res: VercelResponse): void {
  res.status(405).send('Method not allowed');
}

export function sendSsrHtml(
  req: VercelRequest,
  res: VercelResponse,
  html: string,
  headers: Record<string, string | number>,
): void {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  res.status(200).send(html);
}
