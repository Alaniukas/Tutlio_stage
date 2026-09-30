import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const fileMocks = vi.hoisted(() => ({ execFileSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const mocked = { ...actual, execFileSync: fileMocks.execFileSync };
  return { ...mocked, default: mocked };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const mocked = { ...actual, writeFileSync: fileMocks.writeFileSync };
  return { ...mocked, default: mocked };
});

import {
  loadSupportReleaseManifest,
  parseSupportReleaseManifest,
  type SupportReleaseManifest,
} from '../../api/_lib/inAppSupportReleaseManifest.js';
import {
  assertSupportReleaseBranch,
  buildSupportReleaseManifest,
  isSupportReleaseScriptMain,
  parsePrepareSupportReleaseArgs,
  prepareSupportRelease,
  renderSupportReleaseManifest,
  SUPPORT_RELEASE_MANIFEST_PATH,
  SUPPORT_RELEASE_REPOSITORY_ROOT,
} from '../../scripts/prepare-support-release.js';

const RELEASE_ID = 'ad7fc99c-14ec-4f4b-b545-971825cc72ac';
const TICKET_ID = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const OTHER_TICKET_ID = '17ee7859-5c8a-4fba-9dbd-9259ccad28f5';
const EMPTY: SupportReleaseManifest = { version: 1, releaseId: null, productionBranch: 'simo-local', ticketIds: [] };
const SELECTED: SupportReleaseManifest = { ...EMPTY, releaseId: RELEASE_ID, ticketIds: [TICKET_ID] };

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('support release manifest', () => {
  it('starts empty and returns independent validated data', () => {
    expect(loadSupportReleaseManifest()).toEqual(EMPTY);
    const result = parseSupportReleaseManifest(SELECTED);
    result.ticketIds.push(OTHER_TICKET_ID);
    expect(SELECTED.ticketIds).toEqual([TICKET_ID]);
  });

  it('canonicalizes UUIDs while keeping distinct full IDs with the same short reference', () => {
    expect(parseSupportReleaseManifest({ ...SELECTED, releaseId: RELEASE_ID.toUpperCase(), ticketIds: [TICKET_ID.toUpperCase(), OTHER_TICKET_ID] }))
      .toEqual({ ...SELECTED, ticketIds: [TICKET_ID, OTHER_TICKET_ID] });
    expect(() => parseSupportReleaseManifest({ ...SELECTED, ticketIds: [TICKET_ID, TICKET_ID.toUpperCase()] })).toThrow(/duplicate/);
  });

  it.each([
    null,
    [],
    { ...SELECTED, version: 2 },
    { ...SELECTED, productionBranch: 'main' },
    { ...SELECTED, productionBranch: 'Simo-local' },
    { ...SELECTED, productionBranch: 'simo-local ' },
    { ...SELECTED, releaseId: null },
    { ...SELECTED, releaseId: 'not-a-uuid' },
    { ...EMPTY, releaseId: RELEASE_ID },
    { ...SELECTED, ticketIds: 'all' },
    { ...SELECTED, ticketIds: ['SUP-17EE7859'] },
    { ...SELECTED, ticketIds: [TICKET_ID.replace(/-/g, '')] },
    { ...SELECTED, ticketIds: [`${TICKET_ID}\n`] },
    { ...SELECTED, ticketIds: [123] },
    { ...SELECTED, ticketIds: [TICKET_ID, TICKET_ID] },
    { ...SELECTED, extra: true },
    { version: 1, productionBranch: 'simo-local', ticketIds: [] },
  ])('rejects malformed or ambiguous selections %#', (value) => {
    expect(() => parseSupportReleaseManifest(value)).toThrow(/Invalid support release manifest/);
  });

  it('allows at most 20 explicit tickets and rejects sparse arrays', () => {
    const ids = Array.from({ length: 20 }, (_, index) => `17ee7859-5c8a-4fba-9dbd-${index.toString(16).padStart(12, '0')}`);
    expect(parseSupportReleaseManifest({ ...SELECTED, ticketIds: ids }).ticketIds).toHaveLength(20);
    expect(() => parseSupportReleaseManifest({ ...SELECTED, ticketIds: [...ids, OTHER_TICKET_ID] })).toThrow(/at most 20/);
    expect(() => parseSupportReleaseManifest({ ...SELECTED, ticketIds: new Array(1) })).toThrow(/full UUID/);
  });

  it('renders a static typed literal containing only the validated selection', () => {
    const source = renderSupportReleaseManifest(SELECTED);
    expect(source).toContain("import type { SupportReleaseManifest } from './inAppSupportReleaseManifest.js';");
    const literal = source.match(/export const supportReleaseManifest: SupportReleaseManifest = ([\s\S]*);\n$/)?.[1];
    expect(literal).toBeTruthy();
    expect(parseSupportReleaseManifest(JSON.parse(literal!))).toEqual(SELECTED);
    expect(() => renderSupportReleaseManifest({ ...SELECTED, ticketIds: ['SUP-17EE7859'] })).toThrow();
  });
});

describe('support release preparation', () => {
  it('accepts repeated explicit ticket flags or clear, optionally as a dry run', () => {
    const selectedOptions = parsePrepareSupportReleaseArgs(['--ticket', TICKET_ID.toUpperCase(), '--dry-run', '--ticket', OTHER_TICKET_ID]);
    expect(selectedOptions).toEqual({ ticketIds: [TICKET_ID, OTHER_TICKET_ID], clear: false, dryRun: true });
    expect(buildSupportReleaseManifest(selectedOptions, RELEASE_ID)).toEqual({ ...SELECTED, ticketIds: [TICKET_ID, OTHER_TICKET_ID] });
    expect(buildSupportReleaseManifest(parsePrepareSupportReleaseArgs(['--clear', '--dry-run']), null)).toEqual(EMPTY);
  });

  it.each([
    [],
    ['--dry-run'],
    ['--ticket'],
    ['--ticket', '--clear'],
    ['--ticket', 'SUP-17EE7859'],
    ['--ticket', TICKET_ID, '--ticket', TICKET_ID.toUpperCase()],
    ['--clear', '--ticket', TICKET_ID],
    ['--ticket', TICKET_ID, '--clear'],
    ['--clear', '--clear'],
    ['--clear', '--dry-run', '--dry-run'],
    [`--ticket=${TICKET_ID}`],
    ['--all'],
    ['--branch', 'main'],
  ])('rejects ambiguous flags %#', (args) => {
    expect(() => parsePrepareSupportReleaseArgs(args)).toThrow();
  });

  it('checks the exact production branch before any write', () => {
    expect(() => assertSupportReleaseBranch('simo-local')).not.toThrow();
    for (const branch of ['main', 'Simo-local', '', 'simo-local ']) {
      expect(() => assertSupportReleaseBranch(branch)).toThrow(/simo-local/);
    }
    fileMocks.execFileSync.mockReturnValue('main\n');
    expect(() => prepareSupportRelease(['--ticket', TICKET_ID])).toThrow(/simo-local/);
    expect(fileMocks.writeFileSync).not.toHaveBeenCalled();
  });

  it('uses the fixed repository and only writes the manifest, with no dry-run writes', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fileMocks.execFileSync.mockReturnValue('simo-local\n');
    const dryRun = prepareSupportRelease(['--ticket', TICKET_ID, '--dry-run']);
    expect(dryRun.ticketIds).toEqual([TICKET_ID]);
    expect(dryRun.releaseId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fileMocks.writeFileSync).not.toHaveBeenCalled();
    expect(fileMocks.execFileSync).toHaveBeenCalledWith('git', ['branch', '--show-current'], {
      cwd: SUPPORT_RELEASE_REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const manifest = prepareSupportRelease(['--ticket', TICKET_ID]);
    expect(fileMocks.writeFileSync).toHaveBeenCalledExactlyOnceWith(SUPPORT_RELEASE_MANIFEST_PATH, renderSupportReleaseManifest(manifest), 'utf8');
    expect(manifest.releaseId).not.toBe(dryRun.releaseId);
    prepareSupportRelease(['--clear']);
    expect(fileMocks.writeFileSync).toHaveBeenLastCalledWith(SUPPORT_RELEASE_MANIFEST_PATH, renderSupportReleaseManifest(EMPTY), 'utf8');
  });

  it('does not treat imports or missing entry paths as script execution', () => {
    const scriptPath = resolve(SUPPORT_RELEASE_REPOSITORY_ROOT, 'scripts', 'prepare-support-release.ts');
    const scriptUrl = pathToFileURL(scriptPath).href;
    expect(isSupportReleaseScriptMain(scriptUrl, scriptPath)).toBe(true);
    expect(isSupportReleaseScriptMain(scriptUrl, undefined)).toBe(false);
    expect(isSupportReleaseScriptMain(scriptUrl, `${scriptPath}.other`)).toBe(false);
    if (process.platform === 'win32') expect(isSupportReleaseScriptMain(scriptUrl, scriptPath.toUpperCase())).toBe(true);
  });
});
