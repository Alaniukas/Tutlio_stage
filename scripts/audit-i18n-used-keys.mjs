import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');

const keys = new Set();

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    const source = fs.readFileSync(full, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1]);
    for (const match of source.matchAll(/\btHtml\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1]);
  }
}

walk(srcRoot);

const importTs = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { en } = await importTs('src/lib/i18n/en.ts');
const { lt } = await importTs('src/lib/i18n/lt.ts');
const { sharedOrganizationWorkflowTranslations } = await importTs(
  'src/lib/i18n/sharedOrganizationWorkflowTranslations.ts',
);

const legacyLocales = ['pl', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl'];
const legacyDicts = {};
for (const loc of legacyLocales) {
  const mod = await importTs(`src/lib/i18n/${loc}.ts`);
  legacyDicts[loc] = mod[loc.replace('-', '')] ?? mod[loc];
}

const missingEn = [...keys].filter((k) => !(k in en)).sort();
const missingLt = [...keys].filter((k) => !(k in lt)).sort();

console.log(`Used keys in src: ${keys.size}`);
console.log(`Missing in en (${missingEn.length}):`);
console.log(missingEn.join('\n') || '(none)');
console.log(`\nMissing in lt (${missingLt.length}):`);
console.log(missingLt.join('\n') || '(none)');

for (const loc of legacyLocales) {
  const dict = legacyDicts[loc];
  const missing = [...keys].filter((k) => !(k in dict) && !(k in sharedOrganizationWorkflowTranslations)).sort();
  if (missing.length) {
    console.log(`\nMissing in ${loc} excluding shared spread (${missing.length}):`);
    console.log(missing.slice(0, 30).join('\n'));
    if (missing.length > 30) console.log(`... +${missing.length - 30} more`);
  }
}
