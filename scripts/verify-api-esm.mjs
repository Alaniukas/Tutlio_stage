#!/usr/bin/env node
/**
 * Prove that every Vercel function in api/ loads as Node ESM in its compiled
 * form — the same shape Vercel produces: each TypeScript file transpiled on
 * its own, import specifiers left exactly as written, package.json
 * "type": "module". A relative import without ".js" or a Vite "@/…" alias
 * anywhere in a function's import graph makes Node throw
 * ERR_MODULE_NOT_FOUND here, exactly as it makes the deployed function die
 * with FUNCTION_INVOCATION_FAILED.
 *
 * tests/api/esm-import-extensions.test.ts catches the same class of bug by
 * scanning source text; this script is the runtime proof. Run it before a
 * production deploy:
 *
 *   node scripts/verify-api-esm.mjs
 *
 * Exit code 1 when any function fails to resolve its imports. Functions that
 * resolve but throw while initialising (for example a client that needs an
 * environment variable) are listed separately and do not fail the run.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === 'node_modules') continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const entryPoints = [...walk(path.join(ROOT, 'api')), ...walk(path.join(ROOT, 'src'))];
const out = mkdtempSync(path.join(tmpdir(), 'tutlio-api-esm-'));

await build({
  entryPoints,
  outdir: out,
  outbase: ROOT,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  bundle: false,
  sourcemap: false,
  logLevel: 'error',
  jsx: 'automatic',
});

writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'module' }));
// Bare imports (stripe, @supabase/supabase-js, …) resolve through the real node_modules.
try {
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(out, 'node_modules'), 'junction');
} catch {
  cpSync(path.join(ROOT, 'node_modules'), path.join(out, 'node_modules'), { recursive: true });
}
// Function bundles ship the JSON/template files they read at runtime.
for (const extra of ['api/_lib/templates', 'api/_lib/fonts']) {
  const src = path.join(ROOT, extra);
  try { statSync(src); mkdirSync(path.join(out, extra), { recursive: true }); cpSync(src, path.join(out, extra), { recursive: true }); } catch { /* optional */ }
}

// Vercel provides these at runtime; supply placeholders so module-level client
// construction does not mask import resolution problems.
const placeholders = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'placeholder',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder',
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  RESEND_API_KEY: 're_placeholder',
  OPENAI_API_KEY: 'sk-placeholder',
};
for (const [k, v] of Object.entries(placeholders)) if (!process.env[k]) process.env[k] = v;

const functions = readdirSync(path.join(out, 'api')).filter((f) => f.endsWith('.js') && f !== 'types.js').sort();
const unresolved = [];
const initErrors = [];
for (const file of functions) {
  try {
    await import(pathToFileURL(path.join(out, 'api', file)).href);
  } catch (error) {
    const message = String(error && error.message || error);
    const code = error && error.code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_UNSUPPORTED_DIR_IMPORT' || /Cannot find (module|package)/.test(message)) {
      unresolved.push(`${file}: ${message.split('\n')[0]}`);
    } else {
      initErrors.push(`${file}: ${message.split('\n')[0].slice(0, 160)}`);
    }
  }
}

rmSync(out, { recursive: true, force: true });

console.log(`Compiled ${entryPoints.length} files, imported ${functions.length} API functions as Node ESM.`);
if (initErrors.length) {
  console.log(`\n${initErrors.length} function(s) resolved every import but threw while initialising (needs real env at runtime, not an import problem):`);
  for (const line of initErrors) console.log(`  · ${line}`);
}
if (unresolved.length) {
  console.log(`\n${unresolved.length} function(s) FAILED to resolve an import — these would return 500 FUNCTION_INVOCATION_FAILED on Vercel:`);
  for (const line of unresolved) console.log(`  ✗ ${line}`);
  process.exit(1);
}
console.log('\nAll API functions resolve their imports under Node ESM.');
