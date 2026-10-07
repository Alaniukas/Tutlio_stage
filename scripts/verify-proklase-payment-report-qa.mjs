// Verify files downloaded by the real payments page against the Demo-only seed.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const output = new URL('../outputs/payment-report-qa-20261007/', import.meta.url);
function parseCsv(value) {
  const records = [];
  let row = [], cell = '', quoted = false;
  for (let n = 0; n < value.length; n++) {
    const char = value[n];
    if (char === '"') {
      if (quoted && value[n + 1] === '"') { cell += '"'; n++; }
      else quoted = !quoted;
    } else if (!quoted && char === ';') { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\r' || char === '\n')) {
      if (char === '\r' && value[n + 1] === '\n') n++;
      row.push(cell); records.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (row.length || cell) { row.push(cell); records.push(row); }
  assert.equal(quoted, false, 'CSV quoting must be balanced');
  return records;
}
function normalize(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value === null || value === undefined ? '' : String(value);
}
async function inspectPair(name, expectedCount) {
  const buffer = readFileSync(new URL(`${name}.csv`, output));
  assert.equal(buffer.subarray(0, 3).toString('hex'), 'efbbbf', 'Lithuanian CSV needs a UTF-8 BOM');
  const csv = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(csv.length, expectedCount + 1, 'All filtered rows must be exported');
  assert(csv.every(row => row.length === 21), 'Every row must have 21 columns');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(new URL(`${name}.xlsx`, output).pathname.replace(/^\/(\w:)/, '$1'));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, csv.length);
  assert.equal(sheet.columnCount, 21);
  assert.equal(sheet.views[0].ySplit, 1);
  assert.equal(sheet.views[0].xSplit, 2);
  assert(sheet.autoFilter, 'Excel must contain column filters');
  const values = [];
  sheet.eachRow((row, index) => {
    const cells = Array.from({ length: 21 }, (_, column) => row.getCell(column + 1).value);
    values.push(cells);
    cells.forEach((value, column) => {
      const expected = csv[index - 1][column].replace(/^'(?=\+)/, '');
      assert.equal(normalize(value), expected, `${name} row ${index}, column ${column + 1} differs between CSV and XLSX`);
    });
    if (index > 1) {
      assert.equal(typeof cells[8], 'number', 'Money must stay numeric in Excel');
      for (const column of [14, 15, 16]) assert.equal(typeof cells[column], 'number', 'Counts must stay numeric');
      assert(row.height >= 32, 'Wrapped names and contacts need enough height');
      for (const column of [10, 11, 13, 18, 20]) {
        if (csv[index - 1][column] === '') assert.equal(cells[column], null, 'Missing dates must be truly blank cells');
        if (typeof cells[column] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cells[column])) assert.fail('A single date was exported as text');
        const format = row.getCell(column + 1).numFmt;
        if (cells[column] instanceof Date) assert.equal(format, 'yyyy-mm-dd', 'Real dates need a date format');
        else assert.notEqual(format, 'yyyy-mm-dd', 'Blank and multi-student text must not inherit a date format');
      }
    }
  });
  return { csv: csv.slice(1), rows: values.slice(1), summary: { name, rows: expectedCount, columns: 21, parity: true } };
}

const results = [];
const monthly = await inspectPair('01-monthly', 9);
results.push(monthly.summary);
const monthlyByInvoice = new Map(monthly.rows.map(row => [normalize(row[0]), row]));
assert.deepEqual([...monthlyByInvoice.keys()].sort(), ['', ...[3,4,5,6,7,8,9,12].map(n => `DEMO-MOK-2026-${String(n).padStart(3,'0')}`)].sort());
const paidTotal = monthly.rows.filter(row => row[12] === 'Apmokėta').reduce((sum,row) => sum + row[8], 0);
const outstanding = monthly.rows.filter(row => ['Išrašyta','Laukia apmokėjimo'].includes(row[12])).reduce((sum,row) => sum + row[8], 0);
assert.equal(paidTotal, 170);
assert.equal(outstanding, 185);
const mantas = monthlyByInvoice.get('DEMO-MOK-2026-003');
assert.equal(mantas[1], 'Demo Mantas Žilinskas');
assert.equal(mantas[4], '+370 600 01001');
assert.equal(mantas[7], 4);
assert.equal(normalize(mantas[13]), '2026-09-08');
assert.equal(mantas[14], 6);
assert.equal(mantas[15], 2);
assert.equal(mantas[16], 1);
assert.equal(mantas[17], 'Taip');
assert.equal(normalize(mantas[18]), '2026-09-05');
assert.equal(normalize(mantas[20]), '2026-09-10');
assert.equal(monthlyByInvoice.get('DEMO-MOK-2026-004')[6], 'Bandomoji pamoka');
assert.equal(monthlyByInvoice.get('DEMO-MOK-2026-004')[7], null);
assert.equal(monthlyByInvoice.get('DEMO-MOK-2026-006')[12], 'Atšaukta');
assert.equal(monthlyByInvoice.get('DEMO-MOK-2026-007')[12], 'Grąžinta');
const family = monthlyByInvoice.get('DEMO-MOK-2026-009');
assert.equal(family[6], 'Keli mokėjimo tipai');
assert.equal(family[14], 8);
assert(String(family[13]).includes('Demo Mantas Žilinskas: 2026-09-08'));
assert(String(family[13]).includes('Demo Nojus Žilinskas: 2026-10-03'));
assert(String(family[20]).includes('Demo Nojus Žilinskas: —'));

if (existsSync(new URL('04-pagination.csv', output)) && existsSync(new URL('04-pagination.xlsx', output))) {
  const pagination = await inspectPair('04-pagination', 55);
  assert.deepEqual(pagination.rows.map(row => row[0]).sort(), Array.from({length:55},(_,i)=>`DEMO-PUSL-2026-${String(i+1).padStart(3,'0')}`));
  assert.equal(pagination.rows.reduce((sum,row)=>sum+row[8],0),1375);
  assert(pagination.rows.every(row=>row[2]==='Demo Mokėtojas; su kabutėmis "QA"'));
  results.push(pagination.summary);
}
if (existsSync(new URL('03-trials.csv', output)) && existsSync(new URL('03-trials.xlsx', output))) {
  const trials = await inspectPair('03-trials',1);
  assert.equal(trials.rows[0][0],'DEMO-MOK-2026-004');
  assert.equal(trials.rows[0][8],10);
  results.push(trials.summary);
}
writeFileSync(new URL('verification.json',output),JSON.stringify({ organization:'Pro Klasė QA Demo',monthlyPaid:paidTotal,monthlyOutstanding:outstanding,checks:results },null,2));
console.log(JSON.stringify({monthlyPaid:paidTotal,monthlyOutstanding:outstanding,checks:results},null,2));
