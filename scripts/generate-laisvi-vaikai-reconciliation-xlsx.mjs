/**
 * Vienkartinė VšĮ „Laisvi vaikai“ mokejimu suderinimo ataskaita buhalterei.
 * Naudoja Supabase (service role) + exceljs.
 *
 * Usage: node scripts/generate-laisvi-vaikai-reconciliation-xlsx.mjs
 */
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const OUT_DIR = join(ROOT, 'docs', 'exports');
const OUT_FILE = join(OUT_DIR, 'Laisvi-vaikai-mokejimu-suderinimas-2026-09-11.xlsx');

const EURO = '#,##0.00 "€"';
const DATE_FMT = 'yyyy-mm-dd';
const FILL_TITLE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
const FILL_SECTION = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
const FILL_WARN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
const FILL_ERR = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
const FILL_OK = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
const BORDER = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
};

/** Buhalteres patvirtinti Swedbank pavedimai (2026-09-11 laiskas). */
const BANK_CONFIRMED = [
  {
    bankDate: '2026-07-29',
    payer: 'Raimonda Širvytė',
    amount: 350,
    student: 'Palaima Jokūbas',
    note: 'Vienas pavedimas €350 = sutarties įmokos €50 + €300',
  },
  {
    bankDate: '2026-07-28',
    payer: 'Gerda Viskontė',
    amount: 300,
    student: 'Viskontas Adrijus',
    note: 'Vienas pavedimas €300',
  },
  {
    bankDate: '2026-07-28',
    payer: 'Edita Palskė',
    amount: 290,
    student: 'Palskė Neda',
    note: 'Mokama už dukterį Nedą: €50 + €240 = €290 (ne Edas)',
  },
  {
    bankDate: '2026-07-28',
    payer: 'Edita Palskė',
    amount: 300,
    student: 'Palskis Edas',
    note: 'Mokama už sūnų Edą: €300',
  },
];

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      if (process.env[key]) continue;
      process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = FILL_TITLE;
    cell.border = BORDER;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 22;
}

function styleDataRow(row, idx, { moneyCols = [] } = {}) {
  row.eachCell((cell, col) => {
    cell.border = BORDER;
    cell.alignment = { vertical: 'top', wrapText: true };
    if (moneyCols.includes(col)) {
      cell.numFmt = EURO;
      cell.alignment = { horizontal: 'right', vertical: 'top' };
    }
  });
  if (idx % 2 === 1) {
    row.eachCell((cell) => {
      if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    });
  }
}

function writeTitle(ws, title, subtitle) {
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF111827' } };
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = subtitle;
  ws.getCell('A2').font = { size: 11, color: { argb: 'FF4B5563' } };
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 20;
}

function addExplanationSheet(workbook) {
  const ws = workbook.addWorksheet('1. Paaiškinimas', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 22 }, { width: 80 }];
  writeTitle(
    ws,
    'VšĮ „Laisvi vaikai“ – mokejimu suderinimas su Stripe',
    `Sugeneruota: ${new Date().toLocaleDateString('lt-LT', { dateStyle: 'long' })} · MB Tutlio`,
  );

  const blocks = [
    ['Svarbiausia', 'Stripe banke NĖRA prarastų €250. Skirtumas – Tutlio finansų suvestinės (ataskaitos) klaida, ne pinigų praradimas.'],
    ['', ''],
    ['Kas nutiko (1)', 'Kai mokykla adminui pažymi įmoką „Apmokėta rankiniu“ (banko pavedimas), bet anksčiau buvo sukurta Stripe mokėjimo nuoroda, Tutlio ataskaitoje mokėjimas vis tiek rodomas kaip „Stripe“.'],
    ['Kas nutiko (2)', 'Kai sutartis archyvuojama, jos jau apmokėtos įmokos nepatenka į finansų suvestinę – atrodo, lyg pinigų nebūtų.'],
    ['', ''],
    ['Per didelė Stripe suma ataskaitoje', '€650 – trys bankiniai mokėjimai + Jokūbo €50 įmoka (buvo Stripe nuoroda, apmokėta banku).'],
    ['Per maža bendra suma ataskaitoje', '€400 – trys archyvuotos sutartys su jau apmokėtomis įmokomis (paslėptos iš suvestinės).'],
    ['Matomas neatitikimas buhalterei', '€650 − €400 = €250 (tiksliai atitinka pastebėtą skirtumą).'],
    ['', ''],
    ['Swedbank patvirtinimas', 'Buhalterė patvirtino: Raimonda Širvytė €350, Gerda Viskontė €300, Edita Palskė €290 + €300 – visi pavedimai teisingi.'],
    ['Edita Palskė', 'Du pavedimai = du vaikai: €290 už Nedą Palskę, €300 už Edą Palskį (ne du mokėjimai už Edą).'],
    ['', ''],
    ['Kiti lapai', '2 – Swedbank patvirtinti · 3 – Klaidingai Stripe · 4 – Paslėpta archyve · 5 – Skirtumo skaičiavimas · 6 – Probleminės dienos'],
    ['Techninis taisymas', 'Tutlio komanda pataisys ataskaitos logiką. DB sumos ir „Apmokėta“ statusai teisingi – keisti nereikia.'],
  ];

  let r = 4;
  for (const [label, text] of blocks) {
    const labelCell = ws.getCell(r, 1);
    const textCell = ws.getCell(r, 2);
    labelCell.value = label;
    textCell.value = text;
    labelCell.font = { bold: !!label };
    labelCell.border = BORDER;
    textCell.border = BORDER;
    textCell.alignment = { wrapText: true, vertical: 'top' };
    if (label === 'Svarbiausia') {
      textCell.fill = FILL_OK;
      textCell.font = { bold: true };
    }
    if (label.includes('Matomas') || label === 'Per didelė Stripe suma ataskaitoje') {
      textCell.fill = FILL_WARN;
    }
    ws.getRow(r).height = text.length > 80 ? 36 : 22;
    r += 1;
  }
}

function addBankConfirmedSheet(workbook) {
  const ws = workbook.addWorksheet('2. Swedbank patvirtinta');
  ws.columns = [
    { width: 14 }, { width: 22 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 14 }, { width: 48 },
  ];
  writeTitle(ws, 'Swedbank pavedimai (patvirtino buhalterė)', 'Visi šie mokėjimai – banko pavedimai, ne Stripe');

  const headers = [
    'Banko data',
    'Mokėtojas',
    'Suma',
    'Mokinys (Tutlio)',
    'Sutartis',
    'Tutlio pažymėta',
    'Pastaba',
  ];
  const hr = ws.addRow(headers);
  styleHeaderRow(hr);

  let total = 0;
  for (const row of BANK_CONFIRMED) {
    total += row.amount;
    const dataRow = ws.addRow([
      row.bankDate,
      row.payer,
      row.amount,
      row.student,
      '', // filled from db map below in main()
      '',
      row.note,
    ]);
    styleDataRow(dataRow, 0, { moneyCols: [3] });
    dataRow.getCell(1).numFmt = DATE_FMT;
  }

  const totalRow = ws.addRow(['', 'Iš viso patvirtinta banku', total, '', '', '', '']);
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).font = { bold: true };
  totalRow.getCell(3).numFmt = EURO;
  totalRow.eachCell((c) => { c.border = BORDER; });
}

function addTableSheet(workbook, name, title, subtitle, headers, rows, { moneyCols = [], highlightCol = null }) {
  const ws = workbook.addWorksheet(name);
  const colCount = headers.length;
  ws.columns = headers.map(() => ({ width: 16 }));
  ws.getColumn(1).width = 20;
  ws.getColumn(headers.length).width = 40;
  writeTitle(ws, title, subtitle);

  const hr = ws.addRow(headers);
  styleHeaderRow(hr);

  rows.forEach((values, idx) => {
    const row = ws.addRow(values);
    styleDataRow(row, idx, { moneyCols });
    if (highlightCol != null) {
      const cell = row.getCell(highlightCol);
      if (String(cell.value || '').includes('KLAIDA')) cell.fill = FILL_ERR;
    }
  });
}

async function fetchData(sb) {
  const { data: installments, error } = await sb
    .from('school_payment_installments')
    .select(`
      installment_number, amount, paid_at, payment_status,
      stripe_payment_intent_id, stripe_checkout_session_id,
      contract:school_contracts!inner(
        contract_number, archived_at, organization_id, signing_status,
        student:students(full_name, payer_name)
      )
    `)
    .eq('contract.organization_id', ORG_ID)
    .eq('payment_status', 'paid');

  if (error) throw new Error(error.message);

  const rows = (installments || []).map((i) => {
    const c = i.contract;
    const s = c?.student;
    const paidDay = i.paid_at
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius' }).format(new Date(i.paid_at))
      : '';
    const hasPi = !!i.stripe_payment_intent_id;
    const hasSession = !!i.stripe_checkout_session_id;
    let tikras = 'Bankas / rankinis';
    let ataskaitoje = 'Bankas / rankinis';
    if (hasPi) {
      tikras = 'Stripe';
      ataskaitoje = 'Stripe';
    } else if (hasSession) {
      tikras = 'Bankas (buvo Stripe nuoroda)';
      ataskaitoje = 'Stripe (KLAIDA)';
    }
    return {
      mokinys: s?.full_name || '',
      moketojas: s?.payer_name || '',
      sutartis: c?.contract_number || '',
      archyvuota: !!c?.archived_at,
      imoka_nr: i.installment_number,
      suma: Number(i.amount),
      tutlio_data: paidDay,
      tikras_budas: tikras,
      tutlio_ataskaitoje: ataskaitoje,
      stripe_pi: i.stripe_payment_intent_id,
    };
  });

  return rows;
}

function aggregateDays(rows) {
  const activeSigned = rows.filter((r) => !r.archyvuota);
  const byDay = new Map();
  for (const r of activeSigned) {
    if (!r.tutlio_data) continue;
    const cur = byDay.get(r.tutlio_data) || {
      viso: 0,
      tikras_stripe: 0,
      klaidingai: 0,
      bankas: 0,
    };
    cur.viso += r.suma;
    if (r.stripe_pi) cur.tikras_stripe += r.suma;
    else if (r.tutlio_ataskaitoje.includes('KLAIDA')) cur.klaidingai += r.suma;
    else cur.bankas += r.suma;
    byDay.set(r.tutlio_data, cur);
  }
  return [...byDay.entries()]
    .map(([diena, v]) => ({
      diena,
      ...v,
      ataskaitoje_stripe: v.tikras_stripe + v.klaidingai,
      skirtumas: v.klaidingai,
    }))
    .filter((d) => d.skirtumas > 0)
    .sort((a, b) => a.diena.localeCompare(b.diena));
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Reikia SUPABASE_URL ir SUPABASE_SERVICE_ROLE_KEY (.env.local)');
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const rows = await fetchData(sb);

  const contractByStudent = new Map();
  for (const r of rows) {
    if (!contractByStudent.has(r.mokinys)) contractByStudent.set(r.mokinys, r.sutartis);
  }

  const mislabeled = rows.filter((r) => r.tutlio_ataskaitoje.includes('KLAIDA'));
  const archivedPaid = rows.filter((r) => r.archyvuota);
  const mislabeledTotal = mislabeled.reduce((s, r) => s + r.suma, 0);
  const archivedTotal = archivedPaid.reduce((s, r) => s + r.suma, 0);
  const realStripe = rows.filter((r) => !r.archyvuota && r.stripe_pi).reduce((s, r) => s + r.suma, 0);
  const days = aggregateDays(rows);

  mkdirSync(OUT_DIR, { recursive: true });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MB Tutlio';
  wb.created = new Date();

  addExplanationSheet(wb);
  addBankConfirmedSheet(wb);

  // Fill contract numbers on bank sheet
  const bankWs = wb.getWorksheet('2. Swedbank patvirtinta');
  for (let i = 0; i < BANK_CONFIRMED.length; i += 1) {
    const rowNum = 5 + i;
    const student = BANK_CONFIRMED[i].student;
    bankWs.getCell(rowNum, 5).value = contractByStudent.get(student) || '—';
    const tutlioDates = rows
      .filter((r) => r.mokinys === student && r.tikras_budas.includes('Bankas'))
      .map((r) => r.tutlio_data)
      .filter(Boolean);
    bankWs.getCell(rowNum, 6).value = tutlioDates.length ? [...new Set(tutlioDates)].join(', ') : '—';
  }

  addTableSheet(
    wb,
    '3. Klaidingai Stripe',
    'Mokėjimai, kuriuos Tutlio ataskaita rodo kaip Stripe, bet pinigai atėjo banku',
    `Iš viso: ${mislabeledTotal.toFixed(2)} € · ${mislabeled.length} įmokos`,
    ['Mokinys', 'Mokėtojas', 'Sutartis', 'Įmoka #', 'Suma', 'Tutlio data', 'Tikras būdas', 'Ataskaitoje'],
    mislabeled.map((r) => [
      r.mokinys,
      r.moketojas,
      r.sutartis,
      r.imoka_nr,
      r.suma,
      r.tutlio_data,
      r.tikras_budas,
      r.tutlio_ataskaitoje,
    ]),
    { moneyCols: [5], highlightCol: 8 },
  );

  addTableSheet(
    wb,
    '4. Paslėpta archyve',
    'Apmokėtos įmokos, kurios nepatenka į Tutlio finansų suvestinę (sutartis archyvuota)',
    `Iš viso: ${archivedTotal.toFixed(2)} € · ${archivedPaid.length} įmokos`,
    ['Mokinys', 'Mokėtojas', 'Sutartis', 'Įmoka #', 'Suma', 'Tutlio data', 'Tikras būdas', 'Ar Stripe'],
    archivedPaid.map((r) => [
      r.mokinys,
      r.moketojas,
      r.sutartis,
      r.imoka_nr,
      r.suma,
      r.tutlio_data,
      r.tikras_budas,
      r.stripe_pi ? 'Taip (tikras Stripe)' : 'Ne',
    ]),
    { moneyCols: [5] },
  );

  const summaryWs = wb.addWorksheet('5. Skirtumo skaičiavimas');
  summaryWs.columns = [{ width: 42 }, { width: 18 }, { width: 50 }];
  writeTitle(summaryWs, '€250 neatitikimo paaiškinimas', 'Skaičiavimas pagal Tutlio DB (aktyvios + archyvuotos sutartys)');
  const summaryRows = [
    ['Tikras Stripe (aktyvios sutartys, su payment_intent)', realStripe, 'Atitinka Stripe banką'],
    ['Klaidingai rodoma kaip Stripe (bankas, liko nuoroda)', mislabeledTotal, 'Per didelė Stripe suma ataskaitoje'],
    ['Paslėpta archyve (jau apmokėta, nėra suvestinėje)', archivedTotal, 'Per maža bendra suma ataskaitoje'],
    ['', '', ''],
    ['Neatitikimas buhalterei (Stripe stulpelis)', mislabeledTotal, ''],
    ['Neatitikimas buhalterei (paslėpti mokėjimai)', -archivedTotal, ''],
    ['NETO matomas skirtumas', mislabeledTotal - archivedTotal, '650 − 400 = 250'],
  ];
  let sr = 4;
  summaryWs.addRow(['Aprašymas', 'Suma', 'Pastaba']).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = FILL_TITLE;
    c.border = BORDER;
  });
  sr += 1;
  for (const [a, b, c] of summaryRows) {
    const row = summaryWs.addRow([a, typeof b === 'number' ? b : b, c]);
    row.eachCell((cell, col) => {
      cell.border = BORDER;
      if (col === 2 && typeof b === 'number') {
        cell.numFmt = EURO;
        cell.alignment = { horizontal: 'right' };
      }
    });
    if (String(a).includes('NETO')) {
      row.getCell(1).font = { bold: true };
      row.getCell(2).font = { bold: true };
      row.getCell(2).fill = FILL_OK;
    }
    sr += 1;
  }

  addTableSheet(
    wb,
    '6. Probleminės dienos',
    'Dienos, kai Tutlio ataskaitos „Stripe“ stulpelis didesnis už tikrą Stripe banką',
    'Skirtumas = suma, klaidingai priskirta Stripe (bankiniai su likusia nuoroda)',
    ['Data (Tutlio)', 'Viso apmokėta', 'Tikras Stripe', 'Klaidingai Stripe', 'Bankas', 'Ataskaitoje Stripe', 'Skirtumas'],
    days.map((d) => [
      d.diena,
      d.viso,
      d.tikras_stripe,
      d.klaidingai,
      d.bankas,
      d.ataskaitoje_stripe,
      d.skirtumas,
    ]),
    { moneyCols: [2, 3, 4, 5, 6, 7] },
  );

  await wb.xlsx.writeFile(OUT_FILE);
  console.log(`OK: ${OUT_FILE}`);
  console.log(`  Klaidingai Stripe: €${mislabeledTotal.toFixed(2)} (${mislabeled.length} įmokos)`);
  console.log(`  Paslėpta archyve: €${archivedTotal.toFixed(2)} (${archivedPaid.length} įmokos)`);
  console.log(`  Neto skirtumas: €${(mislabeledTotal - archivedTotal).toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
