/**
 * Auto-match Laisvi vaikai class groups to Google Drive "(recurring)" folders
 * by normalized name, then upsert school_recording_drive_folders.
 *
 * Usage:
 *   node scripts/sync-lv-recording-drive-folders.mjs           # only unmapped groups
 *   node scripts/sync-lv-recording-drive-folders.mjs --dry-run   # preview
 *   node scripts/sync-lv-recording-drive-folders.mjs --force     # remap all matches
 *
 * Requires: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env / .env.local
 * Google: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 or _google_setup/server/service-account.json
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import jwt from 'jsonwebtoken';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LAISVI_VAIKIAI_ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function loadEnv() {
  return {
    ...loadEnvFile(join(ROOT, '.env')),
    ...loadEnvFile(join(ROOT, '.env.local')),
    ...process.env,
  };
}

function parseCredentials(env) {
  const base64 = String(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
  const fallbackPath = join(ROOT, '_google_setup/server/service-account.json');
  const rawJson = base64
    ? Buffer.from(base64, 'base64').toString('utf8')
    : existsSync(fallbackPath)
      ? readFileSync(fallbackPath, 'utf8')
      : String(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawJson) {
    throw new Error('Missing Google credentials (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 or _google_setup/server/service-account.json)');
  }
  const parsed = JSON.parse(rawJson);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Google service account JSON is missing client_email or private_key');
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
    token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
  };
}

async function driveAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: credentials.client_email,
      scope: DRIVE_SCOPE,
      aud: credentials.token_uri,
      iat: now,
      exp: now + 3600,
    },
    credentials.private_key,
    { algorithm: 'RS256' },
  );
  const response = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || 'Google Drive authentication failed');
  }
  return payload.access_token;
}

async function listDriveFolders(token) {
  const folders = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'nextPageToken,files(id,name)',
      pageSize: '200',
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(payload));
    folders.push(...(payload.files || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return folders;
}

/** Tutlio group name ↔ Drive folder "… (recurring)" */
function normalizeRecordingFolderName(value) {
  return String(value || '')
    .replace(/\s*\(recurring\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildFolderIndex(folders) {
  const byKey = new Map();
  for (const folder of folders) {
    const key = normalizeRecordingFolderName(folder.name);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(folder);
    byKey.set(key, list);
  }
  return byKey;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env / .env.local');
  }

  const credentials = parseCredentials(env);
  const token = await driveAccessToken(credentials);
  const driveFolders = await listDriveFolders(token);
  const folderIndex = buildFolderIndex(driveFolders);

  const supabase = createClient(supabaseUrl, serviceKey);
  const [{ data: groups, error: groupsError }, { data: mappings, error: mapError }] = await Promise.all([
    supabase
      .from('school_class_groups')
      .select('id, name')
      .eq('organization_id', LAISVI_VAIKIAI_ORG_ID)
      .order('name'),
    supabase
      .from('school_recording_drive_folders')
      .select('group_id, drive_folder_id, drive_folder_name')
      .eq('organization_id', LAISVI_VAIKIAI_ORG_ID),
  ]);
  if (groupsError) throw groupsError;
  if (mapError) throw mapError;

  const mappingByGroup = new Map((mappings || []).map((row) => [row.group_id, row]));
  const usedFolderIds = new Set((mappings || []).map((row) => row.drive_folder_id));

  const results = { linked: [], skipped: [], unmatched: [], ambiguous: [], errors: [] };

  for (const group of groups || []) {
    const existing = mappingByGroup.get(group.id);
    if (existing && !force) {
      results.skipped.push({ group: group.name, folderId: existing.drive_folder_id });
      continue;
    }

    const key = normalizeRecordingFolderName(group.name);
    const candidates = folderIndex.get(key) || [];
    if (candidates.length === 0) {
      results.unmatched.push(group.name);
      continue;
    }
    if (candidates.length > 1) {
      results.ambiguous.push({
        group: group.name,
        folders: candidates.map((f) => f.name),
      });
      continue;
    }

    const folder = candidates[0];
    if (usedFolderIds.has(folder.id) && existing?.drive_folder_id !== folder.id) {
      results.errors.push(`${group.name}: folder ${folder.id} already used by another group`);
      continue;
    }

    const row = {
      group_id: group.id,
      organization_id: LAISVI_VAIKIAI_ORG_ID,
      drive_folder_id: folder.id,
      drive_folder_name: folder.name,
      updated_at: new Date().toISOString(),
    };

    if (dryRun) {
      results.linked.push({ group: group.name, folder: folder.name, folderId: folder.id, dryRun: true });
      continue;
    }

    const { error } = await supabase
      .from('school_recording_drive_folders')
      .upsert(row, { onConflict: 'group_id' });
    if (error) {
      results.errors.push(`${group.name}: ${error.message}`);
      continue;
    }
    usedFolderIds.add(folder.id);
    results.linked.push({ group: group.name, folder: folder.name, folderId: folder.id });
  }

  const matchedKeys = new Set((groups || []).map((g) => normalizeRecordingFolderName(g.name)));
  const orphanFolders = driveFolders.filter(
    (f) => normalizeRecordingFolderName(f.name) && !matchedKeys.has(normalizeRecordingFolderName(f.name)),
  );

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : force ? 'force' : 'unmapped-only',
    driveFolders: driveFolders.length,
    tutlioGroups: (groups || []).length,
    alreadyMapped: results.skipped.length,
    linked: results.linked.length,
    unmatchedGroups: results.unmatched,
    ambiguous: results.ambiguous,
    errors: results.errors,
    orphanDriveFolders: orphanFolders.slice(0, 15).map((f) => f.name),
    linkedDetails: results.linked,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
