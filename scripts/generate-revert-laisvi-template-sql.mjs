/** Revert Laisvi vaikai template only — inverse of generate-body-replace-chain-sql.mjs */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const REVERT = [
  ['PAPILDOMŲ UŽSIĖMIMŲ', 'PAPILDOMŲ PAMOKŲ'],
  ['UŽSIĖMIMŲ ORGANIZAVIMAS', 'PAMOKŲ ORGANIZAVIMAS'],
  ['UŽSIĖMIMŲ ĮRAŠYMAS', 'PAMOKŲ ĮRAŠYMAS'],
  ['NUOTOLINIŲ PAPILDOMŲ UŽSIĖMIMŲ', 'NUOTOLINIŲ PAPILDOMŲ PAMOKŲ'],
  ['papildomų mokamų užsiėmimų', 'papildomų mokamų pamokų'],
  ['Individualiems užsiėmimams', 'Individualioms pamokoms'],
  ['grupinis užsiėmimas', 'grupinė pamoka'],
  ['papildomus užsiėmimus', 'papildomas pamokas'],
  ['Vieno užsiėmimo kaina', 'Vienos pamokos kaina'],
  ['vieno užsiėmimo kaina', 'vienos pamokos kaina'],
  ['apmokamų užsiėmimų skaičius', 'apmokamų pamokų skaičius'],
  ['mėnesio užsiėmimų skaičiaus', 'mėnesio pamokų skaičiaus'],
  ['Užsiėmimo pavadinimas', 'Pamokos / veiklos pavadinimas'],
  ['Užsiėmimo trukmė', 'Pamokos trukmė'],
  ['Užsiėmimai vyksta', 'Pamokos vyksta'],
  ['tiesioginiame užsiėmime', 'tiesioginėje pamokoje'],
  ['nesuteiktas užsiėmimas', 'nesuteiktas pamokas'],
  ['užsiėmimas yra', 'pamoka yra'],
  ['už tokį užsiėmimą', 'už tokią pamoką'],
  ['UŽSIĖMIMŲ', 'PAMOKŲ'],
  ['užsiėmimų', 'pamokų'],
  ['užsiėmimams', 'pamokoms'],
  ['užsiėmime', 'pamokoje'],
  ['užsiėmimus', 'pamokas'],
  ['užsiėmimą', 'pamoką'],
  ['Užsiėmimai', 'Pamokos'],
  ['užsiėmimo kaina', 'pamokos kaina'],
];

function esc(s) {
  return s.replace(/'/g, "''");
}

let expr = 'body';
for (const [from, to] of REVERT) {
  expr = `replace(${expr}, '${esc(from)}', '${esc(to)}')`;
}

const sql = `UPDATE school_contract_templates SET name = 'Papildomų pamokų sutartis (DOCX)', body = ${expr} WHERE id = 'c3a00000-7e57-4000-8000-0000000000a4';`;

writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '_tmp-revert-laisvi-template.sql'), sql, 'utf8');
console.log(sql.length);
