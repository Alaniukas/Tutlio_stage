import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INVOICE_INTEGRITY_QA_URL || 'http://127.0.0.1:3077';
const output = path.resolve('artifacts/invoice-integrity-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
const results = [];
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (/^https?:/.test(route.request().url()) && !route.request().url().startsWith(base)) {
        external.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    const card = () => page.getByRole('checkbox', { name: 'SF-001', exact: true }).first().locator('xpath=../..');
    await card().getByText('Išrašyta', { exact: true }).waitFor();
    await card().getByRole('button', { name: 'Pažymėti kaip apmokėtą' }).click();
    await card().getByText('Apmokėta', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await card().getByText('Apmokėta', { exact: true }).waitFor();
    await card().getByRole('button', { name: 'Keisti numerį SF-001' }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByLabel('Naujas sąskaitos numeris').inputValue(), 'DOMSMA-001');
    await page.screenshot({ path: path.join(output, `${width}-number-dialog.png`), fullPage: true });
    await dialog.getByRole('button', { name: 'Išsaugoti', exact: true }).click();
    await page.getByRole('checkbox', { name: 'DOMSMA-001', exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    const renamed = page.getByRole('checkbox', { name: 'DOMSMA-001', exact: true }).locator('xpath=../..');
    await renamed.getByText('Apmokėta', { exact: true }).waitFor();
    const download = page.waitForEvent('download');
    await renamed.getByRole('button', { name: 'Atsisiųsti PDF' }).click();
    assert.equal((await download).suggestedFilename(), 'DOMSMA-001.pdf');
    const badge = await renamed.getByText('Apmokėta', { exact: true }).boundingBox();
    for (const button of await renamed.getByRole('button').all()) {
      const box = await button.boundingBox();
      assert(!(box.x < badge.x + badge.width && box.x + box.width > badge.x
        && box.y < badge.y + badge.height && box.y + box.height > badge.y), 'Action overlaps the payment status');
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Invoice list overflows horizontally');
    await page.screenshot({ path: path.join(output, `${width}-saved.png`), fullPage: true });
    await page.getByRole('button', { name: 'Korepetitoriai', exact: true }).click();
    await page.getByText('Dominykas Smaliukas', { exact: true }).waitFor();
    await page.getByText('Dominykas Smaliukas', { exact: true }).locator('xpath=../..')
      .getByRole('button', { name: 'Išrašyti S.F.', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Peržiūrėti pamokas', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Generuoti S.F.', exact: true }).waitFor();
    const preview = await page.getByRole('dialog').innerText();
    assert(!preview.includes('Testinis mokinys 0'), 'An already billed lesson appears in preview');
    assert(preview.includes('€38.00'), 'Preview must include only two €14 lessons and the €10 correction');
    await page.screenshot({ path: path.join(output, `${width}-unbilled-preview.png`), fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Generuoti S.F.', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const fixture = await page.evaluate(() => window.invoiceIntegrityQA);
    const submitted = fixture.requests.filter(row => row.url === '/api/generate-invoice' && !row.body.precheckOnly).at(-1).body;
    assert.deepEqual(submitted.sessionIds, ['lesson-1', 'lesson-2']);
    assert.equal(submitted.periodStart, '2026-09-01'); assert.equal(submitted.periodEnd, '2026-09-30');
    assert(fixture.tables.sessions.every(row => row.paid === false), 'Tutor invoice operations changed student payments');
    await page.goto(`${base}/?failure=yes`, { waitUntil: 'networkidle' });
    const other = page.getByRole('checkbox', { name: 'SF-001', exact: true }).locator('xpath=../..');
    await other.getByRole('button', { name: 'Pažymėti kaip apmokėtą' }).click();
    await page.getByText('Nepavyko išsaugoti', { exact: true }).waitFor();
    assert.equal(await other.getByText('Išrašyta', { exact: true }).count(), 1);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    results.push({ width, paidAfterReload: true, correctedAfterReload: true, pdfFilename: 'DOMSMA-001.pdf',
      onlyUnbilledLessons: true, failureStaysIssued: true, studentPaymentsUntouched: true });
    await context.close();
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
