/**
 * One-off: trigger auto blog generation (draft + email with Publish link).
 * Usage: npx tsx scripts/trigger-blog-generate-once.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { runBlogAutoGenerate } from '../api/_lib/blogAutoGenerate.js';
import { supabaseServiceRoleClientOptions } from '../api/_lib/supabaseServiceRoleClientOptions.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(name: string) {
  const p = join(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

// Match dev-api-local TLS behavior on Windows / corporate proxies
process.env.TUTLIO_DEV_API_LOCAL ??= '1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appOrigin = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, supabaseServiceRoleClientOptions() as any);

console.log('[trigger-blog] Starting forced generation…');
console.log('[trigger-blog] Email notify:', process.env.BLOG_NOTIFY_EMAILS || 'internal team defaults');
console.log('[trigger-blog] AI provider:', process.env.BLOG_AI_PROVIDER || '(auto)');

const result = await runBlogAutoGenerate(supabase, { force: true, appOrigin });

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
