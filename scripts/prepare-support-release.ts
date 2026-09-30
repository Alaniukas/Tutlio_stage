import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSupportReleaseManifest,
  parseSupportReleaseTicketIds,
  SUPPORT_RELEASE_PRODUCTION_BRANCH,
  type SupportReleaseManifest,
} from '../api/_lib/inAppSupportReleaseManifest.js';

export const SUPPORT_RELEASE_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SUPPORT_RELEASE_MANIFEST_PATH = resolve(SUPPORT_RELEASE_REPOSITORY_ROOT, 'api', '_lib', 'supportReleaseManifest.ts');

export type PrepareSupportReleaseOptions = {
  ticketIds: string[];
  clear: boolean;
  dryRun: boolean;
};

export function parsePrepareSupportReleaseArgs(args: readonly string[]): PrepareSupportReleaseOptions {
  const ticketIds: string[] = [];
  let clear = false;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--ticket') {
      const id = args[index + 1];
      if (!id || id.startsWith('--')) throw new Error('--ticket requires a full ticket UUID.');
      ticketIds.push(id);
      index += 1;
    } else if (argument === '--clear' && !clear) {
      clear = true;
    } else if (argument === '--dry-run' && !dryRun) {
      dryRun = true;
    } else {
      throw new Error('Unsupported or repeated flag. Use --ticket UUID repeatedly or --clear, optionally with --dry-run.');
    }
  }
  if (clear && ticketIds.length !== 0) throw new Error('--clear cannot be combined with --ticket.');
  if (!clear && ticketIds.length === 0) throw new Error('Select at least one --ticket UUID or use --clear.');
  return { ticketIds: parseSupportReleaseTicketIds(ticketIds), clear, dryRun };
}

export function assertSupportReleaseBranch(branch: string): void {
  if (branch !== SUPPORT_RELEASE_PRODUCTION_BRANCH) {
    throw new Error('Support release manifests must be prepared on the simo-local branch.');
  }
}

export function buildSupportReleaseManifest(options: PrepareSupportReleaseOptions, releaseId: string | null): SupportReleaseManifest {
  if (options.clear ? options.ticketIds.length !== 0 : options.ticketIds.length === 0) {
    throw new Error('Select ticket UUIDs or clear the manifest, exclusively.');
  }
  return parseSupportReleaseManifest({
    version: 1,
    releaseId,
    productionBranch: SUPPORT_RELEASE_PRODUCTION_BRANCH,
    ticketIds: options.ticketIds,
  });
}

export function renderSupportReleaseManifest(input: SupportReleaseManifest): string {
  const manifest = parseSupportReleaseManifest(input);
  return [
    '// Prepared locally by npm run support:prepare-release from explicit ticket UUIDs.',
    "import type { SupportReleaseManifest } from './inAppSupportReleaseManifest.js';",
    '',
    `export const supportReleaseManifest: SupportReleaseManifest = ${JSON.stringify(manifest, null, 2)};`,
    '',
  ].join('\n');
}

/** Only reads Git and writes the single local manifest; it does not release code. */
export function prepareSupportRelease(args: readonly string[]): SupportReleaseManifest {
  const options = parsePrepareSupportReleaseArgs(args);
  let branch: string;
  try {
    branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: SUPPORT_RELEASE_REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    throw new Error('Could not read the repository Git branch.');
  }
  assertSupportReleaseBranch(branch);
  const manifest = buildSupportReleaseManifest(options, options.clear ? null : randomUUID());
  if (!options.dryRun) {
    try {
      writeFileSync(SUPPORT_RELEASE_MANIFEST_PATH, renderSupportReleaseManifest(manifest), 'utf8');
    } catch {
      throw new Error('Could not write the local support release manifest.');
    }
  }
  console.log(`${options.dryRun ? 'Dry run: would prepare' : 'Prepared'} support release manifest for ${manifest.ticketIds.length} ticket(s).`);
  return manifest;
}

export function isSupportReleaseScriptMain(moduleUrl: string, entryPath: string | undefined): boolean {
  if (!entryPath) return false;
  const modulePath = resolve(fileURLToPath(moduleUrl));
  const resolvedEntry = resolve(entryPath);
  return process.platform === 'win32'
    ? modulePath.toLowerCase() === resolvedEntry.toLowerCase()
    : modulePath === resolvedEntry;
}

if (isSupportReleaseScriptMain(import.meta.url, process.argv[1])) {
  try {
    prepareSupportRelease(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not prepare the support release manifest.');
    process.exitCode = 1;
  }
}
