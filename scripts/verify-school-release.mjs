import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// No production services or real email are used by this verification command.
function filesAt(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesAt(file) : [file.replaceAll('\\', '/')];
  });
}
const tests = filesAt('tests').filter(file => /\.test\.tsx?$/.test(file)
  && /(school|extra.lessons|reminder|materialize-recurring|register-parent|admin-student-account|change-temporary-password|confirm-session-status|session-meeting-link|account-portal|company-class-groups|esm-import-extensions|locale-argument-audit)/.test(file));
const checks = [
  ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=4', ...tests],
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.api.json'],
  ['scripts/test-school-support-sql.mjs'],
  ['scripts/test-admin-provisioning-trigger.mjs'],
  ['scripts/test-school-group-save-sql.mjs'],
  ['scripts/test-school-invoice-delivery-sql.mjs'],
  ['scripts/test-school-session-evidence-sql.mjs'],
  ['node_modules/vite/bin/vite.js', 'build'],
];
for (const args of checks) {
  console.log(`\nChecking ${args[0]}${args[0].includes('vitest') ? ` (${tests.length} suites)` : ''}`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\nSchool release checks passed. Production migration and smoke checks are separate.');
