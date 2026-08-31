import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateAuthEmailTemplates } from '../api/_lib/authEmailTemplates.js';

const check = process.argv.includes('--check');
for (const [name, content] of Object.entries(generateAuthEmailTemplates())) {
  const file = fileURLToPath(new URL(`../supabase/email-templates/${name}`, import.meta.url));
  if (check) {
    if (readFileSync(file, 'utf8') !== content) {
      console.error(`${name} is out of date. Run npm run locales:auth-templates.`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(file, content);
    console.log(`Generated ${name}`);
  }
}
