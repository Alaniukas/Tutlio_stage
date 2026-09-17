import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateSchoolDiscountAgreementPdf } from '../api/_lib/schoolDiscountAgreementPdf.js';
import { schoolDiscountAcceptanceStatement } from '../src/lib/schoolDiscountAgreement.js';

const agreementNumber = 'NPR-20260917-DEMO01';
const acceptanceStatement = schoolDiscountAcceptanceStatement({
  agreementNumber,
  studentName: 'Jonas Jonaitis',
  activityLabel: 'Matematika 8 kl. - mokytojas Gintaras',
  discountType: 'percent',
  discountValue: 25,
  validFrom: '2026-09-01',
  validUntil: '2027-06-30',
});

const pdf = await generateSchoolDiscountAgreementPdf({
  agreementNumber,
  contractNumber: 'LV-2026-00142',
  issueDate: '2026 m. rugsėjo 17 d.',
  acceptedAt: '2026 m. rugsėjo 17 d. 14:32:18',
  schoolName: 'VšĮ „Laisvi vaikai“',
  schoolCompanyCode: '306698942',
  schoolAddress: 'Ateities g. 10-43, Stasiūnų k., Kaišiadorių r. 56137',
  schoolEmail: 'irminta@laisvivaikai.lt',
  parentName: 'Jonas Jonaitis mokėtojas',
  parentEmail: 'tevai@example.com',
  studentName: 'Jonas Jonaitis',
  activityLabel: 'Matematika 8 kl. - mokytojas Gintaras',
  discountType: 'percent',
  discountValue: 25,
  validFrom: '2026-09-01',
  validUntil: '2027-06-30',
  note: 'Socialinė nuolaida 2026-2027 mokslo metams.',
  acceptanceStatement,
});

const outputDir = resolve('output/pdf');
const outputPath = resolve(outputDir, 'laisvi-vaikai-discount-agreement-preview.pdf');
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, pdf);
process.stdout.write(`${outputPath}\n`);
