import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Vercel runs every api/*.ts file as a Node ESM module (package.json
 * "type": "module") and compiles each traced file separately — nothing is
 * bundled. Node ESM refuses relative specifiers without an extension and
 * cannot resolve the Vite "@/…" alias, so a single `from './i18n/locales'`
 * anywhere in a function's runtime import graph makes the whole function die
 * at cold start with FUNCTION_INVOCATION_FAILED (HTTP 500).
 *
 * Vitest, Vite and `tsc --moduleResolution bundler` all resolve those imports
 * happily, which is why this class of bug reaches production unnoticed. On
 * 2026-09-05 it had taken down the crawler-facing renderers for the home,
 * pricing, about, contact, blog and public tutor pages plus sitemap.xml on
 * all three domains. This test walks the runtime import graph of every API
 * function and fails on the first offending specifier.
 *
 * Type-only imports are erased at build time and are therefore ignored.
 */

const ROOT = process.cwd();
const RESOLVABLE_EXTENSIONS = /\.(js|mjs|cjs|ts|tsx|json|css|node)$/;

const IMPORT_RE =
  /(?:^|[\n;])\s*(import|export)\s+([^;]*?)\sfrom\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');
}

function resolveRelative(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates: string[] = [];
  if (/\.js$/.test(specifier)) {
    candidates.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base);
  } else if (RESOLVABLE_EXTENSIONS.test(specifier)) {
    candidates.push(base);
  } else {
    candidates.push(`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), `${base}.js`);
  }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

interface Offence {
  entry: string;
  file: string;
  specifier: string;
  reason: string;
}

function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

/** Runtime import graph of one API entry, collecting unresolvable specifiers. */
function auditEntry(entry: string): Offence[] {
  const offences: Offence[] = [];
  const seen = new Set<string>();
  const stack = [path.resolve(ROOT, entry)];

  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    let source: string;
    try {
      source = stripComments(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }

    let match: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(source))) {
      const specifier = match[3] || match[4];
      const clause = match[2] || '';
      const typeOnly = /^\s*type\s/.test(clause);
      if (typeOnly) continue;

      if (specifier.startsWith('@/')) {
        offences.push({ entry, file: rel(file), specifier, reason: 'Vite alias is not resolvable by Node' });
        continue;
      }
      if (!specifier.startsWith('.')) continue; // bare package import

      if (!RESOLVABLE_EXTENSIONS.test(specifier)) {
        offences.push({ entry, file: rel(file), specifier, reason: 'relative import needs an explicit .js extension' });
      }
      const resolved = resolveRelative(file, specifier);
      if (resolved && !resolved.includes('node_modules')) stack.push(resolved);
    }
  }
  return offences;
}

const API_ENTRIES = readdirSync(path.join(ROOT, 'api'))
  .filter((name) => name.endsWith('.ts') && name !== 'types.ts')
  .map((name) => `api/${name}`)
  .sort();

describe('API functions are loadable as Node ESM on Vercel', () => {
  it('finds the API entries', () => {
    expect(API_ENTRIES.length).toBeGreaterThan(50);
  });

  it('has no extension-less or alias runtime imports anywhere in an API import graph', () => {
    const offences = API_ENTRIES.flatMap(auditEntry);
    const byFile = new Map<string, { specifier: string; reason: string; entries: Set<string> }>();
    for (const o of offences) {
      const key = `${o.file} -> ${o.specifier}`;
      const row = byFile.get(key) || { specifier: o.specifier, reason: o.reason, entries: new Set<string>() };
      row.entries.add(o.entry);
      byFile.set(key, row);
    }
    const report = [...byFile.entries()]
      .map(([key, row]) => `${key}  (${row.reason}; breaks ${[...row.entries].join(', ')})`)
      .join('\n');

    expect(
      byFile.size,
      `These imports crash the listed Vercel functions at cold start (FUNCTION_INVOCATION_FAILED). Add the .js extension or drop the alias:\n${report}`,
    ).toBe(0);
  });

  it('flags the shapes of import that broke production in 2026-09', () => {
    const fixtureFile = path.join(ROOT, 'src', 'lib', 'seoMeta.ts');
    const source = stripComments(readFileSync(fixtureFile, 'utf8'));
    // Sanity check that the regex sees the real import lines this test guards.
    expect(source).toMatch(/from ['"]\.\/i18n\/locales\.js['"]/);
    const unresolved = resolveRelative(fixtureFile, './i18n/does-not-exist.js');
    expect(unresolved).toBeNull();
  });
});
