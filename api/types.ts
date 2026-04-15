import type { IncomingMessage, ServerResponse } from 'http';

export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  body: any;
}

export interface VercelResponse extends ServerResponse {
  status(statusCode: number): VercelResponse;
  json(body: unknown): void;
  send(body: unknown): void;
  redirect(url: string | number, statusCode?: number): void;
}
