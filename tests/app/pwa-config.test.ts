import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA workbox config', () => {
  it('precaches only the SPA shell, not every HTML or lazy JS route', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/globPatterns:\s*\[[^\]]*\{css,ico,png,svg,woff2\}/);
    expect(viteConfig).not.toMatch(/globPatterns:[^\n]*\{[^}]*js/);
    expect(viteConfig).not.toMatch(/globPatterns:[^\n]*html/);
    expect(viteConfig).toMatch(/additionalManifestEntries:\s*\[\{\s*url:\s*'index\.html'/);
  });

  it('caches visited hashed JavaScript chunks on demand', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/urlPattern:\s*\/\\\/assets\\\/\.\*\\\.js\$\/i/);
    expect(viteConfig).toMatch(/handler:\s*'CacheFirst'/);
    expect(viteConfig).toMatch(/cacheName:\s*'app-js'/);
  });
});
