import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REPLACEMENTS = [
  ['PAPILDOMŲ PAMOKŲ', 'PAPILDOMŲ UŽSIĖMIMŲ'],
  ['PAMOKŲ ORGANIZAVIMAS', 'UŽSIĖMIMŲ ORGANIZAVIMAS'],
  ['PAMOKŲ ĮRAŠYMAS', 'UŽSIĖMIMŲ ĮRAŠYMAS'],
  ['NUOTOLINIŲ PAPILDOMŲ PAMOKŲ', 'NUOTOLINIŲ PAPILDOMŲ UŽSIĖMIMŲ'],
  ['papildomų mokamų pamokų', 'papildomų mokamų užsiėmimų'],
  ['Individualioms pamokoms', 'Individualiems užsiėmimams'],
  ['grupinė pamoka', 'grupinis užsiėmimas'],
  ['papildomas pamokas', 'papildomus užsiėmimus'],
  ['Vienos pamokos kaina', 'Vieno užsiėmimo kaina'],
  ['vienos pamokos kaina', 'vieno užsiėmimo kaina'],
  ['apmokamų pamokų skaičius', 'apmokamų užsiėmimų skaičius'],
  ['mėnesio pamokų skaičiaus', 'mėnesio užsiėmimų skaičiaus'],
  ['Pamokos / veiklos pavadinimas', 'Užsiėmimo pavadinimas'],
  ['Pamokos trukmė', 'Užsiėmimo trukmė'],
  ['Pamokos vyksta', 'Užsiėmimai vyksta'],
  ['tiesioginėje pamokoje', 'tiesioginiame užsiėmime'],
  ['nesuteiktas pamokas', 'nesuteiktas užsiėmimas'],
  ['pamoka yra', 'užsiėmimas yra'],
  ['už tokią pamoką', 'už tokį užsiėmimą'],
  ['PAMOKŲ', 'UŽSIĖMIMŲ'],
  ['pamokų', 'užsiėmimų'],
  ['pamokoms', 'užsiėmimams'],
  ['pamokoje', 'užsiėmime'],
  ['pamokas', 'užsiėmimus'],
  ['pamoką', 'užsiėmimą'],
  ['Pamokos', 'Užsiėmimai'],
  ['pamokos kaina', 'užsiėmimo kaina'],
];

function esc(s) {
  return s.replace(/'/g, "''");
}

let expr = 'body';
for (const [from, to] of REPLACEMENTS) {
  expr = `replace(${expr}, '${esc(from)}', '${esc(to)}')`;
}

const sql = `UPDATE school_contract_templates
SET body = ${expr}
WHERE id = 'c3a00000-7e57-4000-8000-0000000000a3';`;

writeFileSync(join(ROOT, 'scripts/_tmp-body-replace-chain.sql'), sql, 'utf8');
console.log('sql len', sql.length);
