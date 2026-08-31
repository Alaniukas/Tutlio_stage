import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function audit(source: string) {
  const directory = mkdtempSync(join(tmpdir(), 'tutlio-locale-audit-'));
  try {
    mkdirSync(join(directory, 'src'));
    mkdirSync(join(directory, 'api'));
    writeFileSync(join(directory, 'src', 'fixture.ts'), source);
    return spawnSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('scripts/audit-locale-arguments.ts'), '--check'], {
      cwd: directory, encoding: 'utf8', timeout: 20_000,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('locale audit release gate', () => {
  it('fails CI when a caller value is dropped, including a new parameter on a reviewed message', () => {
    const result = audit(`t('common.login', { student: 'Ada' });
      t(locale, 'em.packageSuccessBody', { count: 5, subject: 'Maths', label: 'lessons', deadline: 'tomorrow' });`);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toContain('2 keys have unreviewed missing arguments');
    expect(result.stdout).toContain('common.login');
    expect(result.stdout).toContain('deadline: all 36');
  }, 25_000);

  it('accepts only the reviewed lesson-noun variation alongside complete contracts', () => {
    const result = audit(`t('cal.studentGrade', { name: 'Ada', grade: 8 });
      t(locale, 'em.packageSuccessBody', { count: 5, subject: 'Maths', label: 'lessons' });`);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('0 keys have unreviewed missing arguments');
  }, 25_000);
});
