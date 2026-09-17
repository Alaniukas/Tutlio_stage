import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateSchoolMonthlyInvoicePdf } from '../api/_lib/schoolMonthlyInvoicePdf.js';

const pdf = await generateSchoolMonthlyInvoicePdf({
  preview: true,
  invoiceNumber: 'PAM-PERŽIŪRA',
  issueDate: '2026-09-17',
  periodLabel: 'rugsėjis 2026',
  studentName: 'Jonas Jonaitis',
  grade: '8',
  dueDate: '2026-10-08',
  seller: {
    name: 'VšĮ „Laisvi vaikai“',
    companyCode: '306698942',
    address: 'Ateities g. 10-43, Stasiūnų k., Kaišiadorių r. 56137',
    contactEmail: 'irminta@laisvivaikai.lt',
    bankName: 'Swedbank, AB',
    iban: 'LT467300010185024788',
  },
  buyer: {
    name: 'Jonas Jonaitis mokėtojas',
    email: 'tevai@example.com',
    phone: '+370 612 21694',
  },
  lines: [
    {
      studentName: 'Jonas Jonaitis',
      activity: 'Matematika 8 kl. - mokytojas Gintaras',
      quantity: 8,
      unitPriceEur: 6,
      originalAmountEur: 48,
      discountLabel: '25 %',
      discountAmountEur: 12,
      amountEur: 36,
    },
    {
      studentName: 'Jonas Jonaitis',
      activity: 'Lietuvių k. - mokytoja Alina',
      quantity: 3,
      unitPriceEur: 6,
      originalAmountEur: 18,
      discountLabel: '100 %',
      discountAmountEur: 18,
      amountEur: 0,
    },
  ],
  subtotalEur: 66,
  discountAmountEur: 30,
  totalEur: 36,
  discountNote: 'Socialinė nuolaida taikoma visiems 2026-2027 mokslo metams.',
  issuedByName: 'direktorės pavaduotoja ugdymui Irminta Maleckienė',
  branding: { brandName: 'VšĮ „Laisvi vaikai“' },
});

const outputDir = resolve('output/pdf');
const outputPath = resolve(outputDir, 'laisvi-vaikai-monthly-invoice-discount-preview.pdf');
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, pdf);
process.stdout.write(`${outputPath}\n`);
