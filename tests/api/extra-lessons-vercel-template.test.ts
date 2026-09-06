import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { extraLessonsBundledDocxCandidates } from '../../api/_lib/extraLessonsPdf';

describe('extra-lessons Vercel DOCX packaging', () => {
  it('includes the templates folder without brace globs so the bundled DOCX ships to serverless', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      functions: Record<string, { includeFiles?: string }>;
    };
    for (const entry of [
      'api/extra-lessons-contract-offer.ts',
      'api/extra-lessons-contract-accept.ts',
      'api/extra-lessons-contract-withdraw.ts',
    ]) {
      const include = vercel.functions[entry]?.includeFiles || '';
      expect(include, entry).toBe('api/_lib/templates/**');
      expect(include).not.toContain('{');
    }
    expect(extraLessonsBundledDocxCandidates().some((path) => existsSync(path))).toBe(true);
  });
});
