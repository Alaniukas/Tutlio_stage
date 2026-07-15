import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA workbox config', () => {
  it('does not precache index.html (prevents stale hashed main-*.js after deploy)', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/globPatterns:\s*\[[^\]]*\{js,css,ico,png,svg,woff2\}/);
    expect(viteConfig).not.toMatch(/globPatterns:[^\n]*html/);
  });
});
