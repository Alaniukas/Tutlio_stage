/**
 * Replace visible "pamok*" wording with "užsiėmim*" in extra-lessons DOCX + legal body fallback.
 * Preserves {{placeholder}} keys like {{pamokos_trukme_min}}.
 *
 * Usage: node scripts/patch-extra-lessons-docx-terminology.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCX_PATHS = [
  join(ROOT, 'docs', 'legal', 'extra-lessons-laisvi-vaikai.docx'),
  join(ROOT, 'api', '_lib', 'templates', 'extra-lessons-laisvi-vaikai.docx'),
];
const LEGAL_BODY_TS = join(ROOT, 'src', 'lib', 'extraLessonsLegalBody.ts');
const WORK = join(ROOT, 'tmp', 'docx-patch-work');

/** Longest-first phrase replacements (visible text only). */
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
  ['pamokos', 'užsiėmimai'],
  ['pamoka', 'užsiėmimas'],
];

function protectPlaceholders(text) {
  const saved = [];
  const protectedText = text.replace(/\{\{[^}]+\}\}/g, (m) => {
    saved.push(m);
    return `__PH${saved.length - 1}__`;
  });
  return { protectedText, saved };
}

function unprotectPlaceholders(text, saved) {
  return text.replace(/__PH(\d+)__/g, (_, i) => saved[Number(i)] ?? '');
}

export function patchExtraLessonsTerminology(text) {
  const { protectedText, saved } = protectPlaceholders(text);
  let out = protectedText;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  out = unprotectPlaceholders(out, saved);
  return out;
}

function walkXmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkXmlFiles(p, out);
    else if (/\.xml$/i.test(name)) out.push(p);
  }
  return out;
}

function unzipDocx(docxPath, destDir) {
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(docxPath);
  zip.extractAllTo(destDir, true);
}

function zipDocx(sourceDir, docxPath) {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir, '');
  zip.writeZip(docxPath);
}

function patchDocxFile(docxPath) {
  if (!existsSync(docxPath)) {
    console.warn('Skip missing', docxPath);
    return false;
  }
  const workDir = join(WORK, docxPath.replace(/[:\\/]/g, '_'));
  unzipDocx(docxPath, workDir);
  let changed = 0;
  for (const xmlPath of walkXmlFiles(workDir)) {
    const before = readFileSync(xmlPath, 'utf8');
    const after = patchExtraLessonsTerminology(before);
    if (after !== before) {
      writeFileSync(xmlPath, after, 'utf8');
      changed++;
    }
  }
  zipDocx(workDir, docxPath);
  const verify = readFileSync(join(workDir, 'word', 'document.xml'), 'utf8');
  const left = (verify.match(/pamok/gi) || []).filter((m) => !/\{\{[^}]*pamok/i.test(verify)).length;
  console.log('Patched', docxPath, `(${changed} xml files); remaining pamok in document (excl placeholders):`, left);
  return true;
}

function patchLegalBodyTs() {
  if (!existsSync(LEGAL_BODY_TS)) return;
  let src = readFileSync(LEGAL_BODY_TS, 'utf8');
  const marker = 'export const EXTRA_LESSONS_LEGAL_BODY = "';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('EXTRA_LESSONS_LEGAL_BODY not found');
  let i = start + marker.length;
  let body = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1];
      if (next === 'n') body += '\n';
      else if (next === 'r') body += '\r';
      else if (next === 't') body += '\t';
      else if (next === '"') body += '"';
      else if (next === '\\') body += '\\';
      else body += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    body += ch;
    i += 1;
  }
  const patched = patchExtraLessonsTerminology(body);
  const escaped = patched
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  src = `${src.slice(0, start)}${marker}${escaped}";${src.slice(i + 1).replace(/^;/, '')}`;
  writeFileSync(LEGAL_BODY_TS, src, 'utf8');
  const left = (patched.match(/pamok/gi) || []).length;
  console.log('Patched', LEGAL_BODY_TS, '; remaining pamok:', left);
}

function main() {
  const seen = new Set();
  for (const p of DOCX_PATHS) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
  try {
    patchDocxFile(p);
  } catch (err) {
    console.warn('Failed to patch', p, err?.message || err);
  }
  }
  patchLegalBodyTs();
  console.log('Done.');
}

main();
