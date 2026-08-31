import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');

/**
 * Vercel NFT does not pack extensionless relative imports under src/lib when
 * an API function pulls that graph in. Production then 500s with
 * ERR_MODULE_NOT_FOUND for /var/task/src/lib/<name>.
 */
describe('API-reachable src/lib ESM imports use .js', () => {
  const files: Array<[string, string]> = [
    ['src/lib/schoolJoinNoShow.ts', "from './attendance.js'"],
    ['src/lib/extraLessonsContract.ts', "from './extraLessonsLegalBody.js'"],
    ['src/lib/extraLessonsParentPortal.ts', "from './extraLessonsContract.js'"],
    ['src/lib/schoolClassGroups.ts', "from './schoolStudentEnrollment.js'"],
    ['src/lib/featurePages.ts', "from './productFeatureCatalog.js'"],
    ['src/lib/supportPageSuggestions.ts', "from './productFeatureCatalog.js'"],
  ];

  for (const [rel, needle] of files) {
    it(`${rel} traces ${needle}`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).toContain(needle);
      expect(src).not.toMatch(/from '\.\/[A-Za-z0-9_-]+'/);
    });
  }
});
