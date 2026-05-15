import jwt from 'jsonwebtoken';
import { createCipheriv, createHash } from 'crypto';

export const PERLAS_API_URL = 'https://mip-pay.dataop.lt/';

function getProjectId(): number {
  return Number(process.env.PROJECT_ID) || 0;
}

function getApiKey(): string {
  return process.env.PERLASFINANCE_API_KEY || '';
}

export function signPerlasToken(payload: Record<string, unknown>): string {
  return jwt.sign({ projectId: getProjectId(), ...payload }, getApiKey(), { algorithm: 'HS256' });
}

export function verifyPerlasToken(token: string): Record<string, unknown> {
  return jwt.verify(token, getApiKey(), { algorithms: ['HS256'] }) as Record<string, unknown>;
}

/**
 * AES-256-CBC encryption required by PerlasFinance for receiverName / payerCode.
 * Cipher: aes-256-cbc
 * Passphrase: first 64 hex chars of sha256(apiKey)
 * IV: first 32 hex chars of sha256(apiKey)
 */
export function encryptForPerlas(plaintext: string): string {
  const apiKey = getApiKey();
  const hash = createHash('sha256').update(apiKey).digest('hex');
  const passphrase = Buffer.from(hash.slice(0, 64), 'hex'); // 32 bytes
  const iv = Buffer.from(hash.slice(0, 32), 'hex');          // 16 bytes
  const cipher = createCipheriv('aes-256-cbc', passphrase, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}

export function generateTransactionId(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 36);
}
