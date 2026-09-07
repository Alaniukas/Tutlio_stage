/** Read-only audit of literal t()/tHtml() calls with inline parameter objects.
 * Reports lost runtime data; this is not linguistic or complete coverage QA. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { en } from '../src/lib/i18n/en.js';
import { SUPPORTED_LOCALES } from '../src/lib/i18n/locales.js';
import { t } from '../api/_lib/i18n.js';

type Contract = { params: Set<string>; callers: Set<string> };
// Reviewed linguistic variation: these translations contain their own lesson
// noun/counter. Appending the legacy plural label would duplicate it. Count and
// subject are still required, and newly added locales must be reviewed explicitly.
const embeddedLessonNounLocales = new Set([
  'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'dk', 'no', 'th', 'tr', 'zh-hk',
  'it', 'pt', 'ro', 'cs', 'el', 'hu', 'bg', 'hr', 'sk', 'sl', 'hi', 'ko', 'ja',
  'id', 'ar', 'pt-br', 'es-mx', 'fil', 'he', 'uk',
]);
const isReviewedOmission = (key: string, param: string, locale: string) =>
  key === 'em.packageSuccessBody' && param === 'label' && embeddedLessonNounLocales.has(locale);
const contracts = new Map<string, Contract>();
async function scan(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (file !== 'src/lib/i18n') await scan(file);
    } else if (/\.tsx?$/.test(file)) {
      const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && /^(?:t|tHtml)$/.test(node.expression.getText(source))) {
          const index = [0, 1].find(i => {
            const key = node.arguments[i];
            return key && ts.isStringLiteral(key) && Object.hasOwn(en, key.text);
          });
          if (index !== undefined) {
            const key = (node.arguments[index] as ts.StringLiteral).text;
            const argument = node.arguments[index + 1];
            if (argument && ts.isObjectLiteralExpression(argument)) {
              const contract = contracts.get(key) ?? { params: new Set<string>(), callers: new Set<string>() };
              for (const property of argument.properties) {
                if ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
                  (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) contract.params.add(property.name.text);
              }
              contract.callers.add(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
              contracts.set(key, contract);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}
await scan('src');
await scan('api');
const rows: string[] = [];
const reviewedRows: string[] = [];
for (const [key, contract] of [...contracts].sort(([a], [b]) => a.localeCompare(b))) {
  const failures = new Map<string, string[]>();
  for (const locale of SUPPORTED_LOCALES) {
    const value = t(locale, key);
    const omitted = [...contract.params].filter(param => !value.includes(`{${param}}`));
    const missing = omitted.filter(param => !isReviewedOmission(key, param, locale)).sort().join(', ');
    if (omitted.some(param => isReviewedOmission(key, param, locale))) reviewedRows.push(locale);
    if (missing) failures.set(missing, [...(failures.get(missing) ?? []), locale]);
  }
  const summary = [...failures].map(([params, locales]) => `${params}: ${locales.length === SUPPORTED_LOCALES.length ? `all ${SUPPORTED_LOCALES.length}` : locales.join(', ')}`);
  if (failures.size) rows.push(`| ${key} | ${summary.join('; ')} | ${[...contract.callers].join('<br>')} |`);
}
const report = `# Locale runtime argument audit\n\nAudited ${contracts.size} translation keys used in literal calls with inline parameter objects across ${SUPPORTED_LOCALES.length} locales. **${rows.length} keys have unreviewed missing arguments.**\n\nThis is a static check, not a release approval. Dynamic keys, spread parameters and translation aliases are not covered. Dedicated school/admin/legal fallbacks remain outside the tutor/business release scope. Regenerate with \`npm run locales:audit -- docs/LOCALE_ARGUMENT_AUDIT.md\`; CI runs \`npm run locales:audit -- --check\`.\n\n## Reviewed variation\n\n\`em.packageSuccessBody\` embeds the lesson noun/counter in ${reviewedRows.length} locales (${reviewedRows.join(', ')}), so its \`label\` argument is intentionally unused there. Count and subject remain mandatory. This exception is limited to those specific locales and that single parameter.\n\n## Repairs and caller decisions\n\nThe original 61-key inventory was reviewed against actual callers. Names, amounts, counts, cancellation windows, registration and payment deadlines, trial details and schedule times now render. Weekly availability no longer says “every day”. The organization lock notice explains who controls settings. Payment reminders now include complete sentences and an explicit tutor row; organization deadline warnings include the actual deadline.\n\nUnused parameters were removed from complete action labels and messages whose details appear separately. Raw backend errors are deliberately excluded from generic user-facing errors; they were not appended to translations to satisfy this check. Manual package instructions no longer repeat a second heading; amount and organization remain in the existing body/table.\n\n## Unreviewed omissions\n\n${rows.length ? '| Key | Missing arguments: affected locales | Callers |\n| --- | --- | --- |\n' + rows.join('\n') : 'None in the statically covered calls.'}\n`;
const args = process.argv.slice(2);
const output = args.find(arg => !arg.startsWith('--'));
if (output) await writeFile(output, report);
else process.stdout.write(report);
if (args.includes('--check') && rows.length) process.exitCode = 1;
