import { randomBytes } from 'node:crypto';

/** Readable temp password without ambiguous characters (0/O, 1/l/I). */
const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[bytes[i]! % TEMP_PASSWORD_CHARS.length];
  }
  return out;
}
