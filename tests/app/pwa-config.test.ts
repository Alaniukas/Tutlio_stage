import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA workbox config', () => {
  it('precaches a revisioned SPA shell, not every HTML or lazy JS route', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/globPatterns:\s*\[[^\]]*index\.html/);
    expect(viteConfig).toMatch(/globPatterns:\s*\[[^\]]*\{css,ico,png,svg,woff2\}/);
    expect(viteConfig).not.toMatch(/globPatterns:[^\n]*\{[^}]*js/);
    expect(viteConfig).not.toMatch(/globPatterns:[^\n]*\*\*\/\*\.\{[^}]*html/);
    // revision: null pins index.html forever and causes post-deploy white screens.
    expect(viteConfig).not.toMatch(/additionalManifestEntries[\s\S]*revision:\s*null/);
  });

  it('revalidates visited hashed JavaScript chunks on demand', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/urlPattern:\s*\/\\\/assets\\\/\.\*\\\.js\$\/i/);
    expect(viteConfig).toMatch(/handler:\s*'StaleWhileRevalidate'/);
    expect(viteConfig).toMatch(/cacheName:\s*'app-js'/);
  });
});
