import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Set PLAYWRIGHT_MODULE to a bundled runtime when Playwright is not installed
// locally. BROWSER_CHANNEL=msedge uses the installed Windows browser.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INVOICE_QA_URL || 'http://127.0.0.1:3076';
const output = path.resolve('artifacts/invoice-privacy-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
const results = [];
try {
  for (const org of ['pro', 'company', 'school']) {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 1100 } });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
      const errors = [];
      const external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) external.push(request.url()); });
      page.on('dialog', dialog => dialog.accept());
      await page.goto(`${base}/invoices?org=${org}`, { waitUntil: 'networkidle' });
      await page.getByText('TUTOR-SF-001', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/finance', 'Legacy invoices route must redirect to tutor finance');
      const finance = await page.locator('main').innerText();
      for (const privateValue of ['CLIENT-SF-001', 'Privatus klientas QA', '10.40', 'OTHER-TUTOR-SF-002', '999']) {
        assert(!finance.includes(privateValue), `Private value appeared on ${org}: ${privateValue}`);
      }
      assert.equal(await page.getByTitle('Atsisiųsti PDF').count(), 1, 'Only the own invoice PDF action must be present');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Finance page overflows horizontally');
      await page.screenshot({ path: path.join(output, `${org}-${mobile ? 'mobile' : 'desktop'}-finance.png`), fullPage: true });
      const download = page.waitForEvent('download');
      await page.getByTitle('Atsisiųsti PDF').click();
      assert.equal((await download).suggestedFilename(), 'TUTOR-SF-001.pdf');
      await page.getByRole('button', { name: 'Išrašyti S.F. įmonei', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await page.screenshot({ path: path.join(output, `${org}-${mobile ? 'mobile' : 'desktop'}-create.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Peržiūrėti pamokas', exact: true }).click();
      await dialog.getByRole('button', { name: 'Generuoti S.F.', exact: true }).waitFor();
      assert.equal(await dialog.getByRole('alert').count(), 0, 'Customer invoice must not block tutor invoice preview');
      const preview = await dialog.innerText();
      const fixture = await page.evaluate(() => window.invoicePrivacyQA);
      assert(preview.includes(fixture.organization.name), 'Invoice buyer must be the current organization');
      assert(preview.includes('€60.00'), 'Three completed tutor lessons must total €60');
      for (const privateValue of ['CLIENT-SF-001', 'Privatus klientas QA', '10.40', 'OTHER-TUTOR-SF-002', '999']) assert(!preview.includes(privateValue));
      await page.screenshot({ path: path.join(output, `${org}-${mobile ? 'mobile' : 'desktop'}-preview.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Generuoti S.F.', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      const requests = await page.evaluate(() => window.invoicePrivacyQA.requests);
      const generation = requests.find(r => r.url === '/api/generate-invoice' && !r.body.precheckOnly);
      assert(generation, 'Tutor invoice generation must be submitted');
      assert.equal(generation.body.isOrgTutor, true);
      assert.deepEqual(generation.body.sessionIds, ['lesson-0', 'lesson-1', 'lesson-2']);
      assert(!requests.some(r => r.url.includes('invoice-pdf') && !r.url.includes('id=own-pay')));
      assert.deepEqual(errors, [], 'No browser rendering errors');
      assert.deepEqual(external, [], 'Fixture must never contact production or external services');
      results.push({ organization: org, viewport: mobile ? 'mobile' : 'desktop', checks: ['private invoices hidden', 'legacy route redirected', 'own PDF downloaded', 'preview buyer correct', 'client invoice does not block creation', 'own invoice submitted', 'no horizontal overflow', 'no browser errors', 'no external requests'] });
      console.log(`PASS ${org} ${mobile ? 'mobile' : 'desktop'}`);
      await context.close();
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
    await page.goto(`${base}/finance?org=${org}&scenario=empty`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByTitle('Atsisiųsti PDF').count(), 0, 'Client-only data must have no PDF actions');
    const emptyList = await page.locator('main').innerText();
    for (const privateValue of ['CLIENT-SF-001', 'Privatus klientas QA', '10.40', 'OTHER-TUTOR-SF-002', '999']) assert(!emptyList.includes(privateValue));
    assert.equal(await page.getByText('TUTOR-SF-001', { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(output, `${org}-client-only-empty.png`), fullPage: true });
    await page.goto(`${base}/finance?org=${org}&scenario=duplicate`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Išrašyti S.F. įmonei', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Peržiūrėti pamokas', exact: true }).click();
    const alert = page.getByRole('dialog').getByRole('alert');
    await alert.waitFor();
    assert((await alert.innerText()).includes('TUTOR-SF-001'), 'Own duplicate must still be blocked');
    assert(!(await alert.innerText()).includes('CLIENT-SF-001'), 'Duplicate warning must not disclose customer invoice');
    await page.screenshot({ path: path.join(output, `${org}-duplicate.png`), fullPage: true });
    results.push({ organization: org, checks: ['client-only list empty', 'own duplicate blocked without client disclosure'] });
    await context.close();
  }
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 1100 } });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
    await page.goto(`${base}/finance?org=school&scenario=regenerate`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Išrašyti S.F. įmonei', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'Peržiūrėti pamokas', exact: true }).click();
    const regenerate = modal.getByRole('button', { name: 'Pergeneruoti sąskaitą', exact: true });
    await regenerate.waitFor();
    assert((await modal.innerText()).includes('TUTOR-SF-001'), 'Preview must identify the invoice being replaced');
    assert((await modal.innerText()).includes('€60.00'), 'Preview must include every current lesson');
    await page.screenshot({ path: path.join(output, `school-${mobile ? 'mobile' : 'desktop'}-regenerate.png`), fullPage: true });
    page.once('dialog', async dialog => {
      assert.equal(dialog.type(), 'confirm');
      assert(dialog.message().includes('Ar tikrai norite pergeneruoti?'));
      assert(dialog.message().includes('TUTOR-SF-001'));
      await dialog.dismiss();
    });
    await regenerate.click();
    assert.equal(await page.evaluate(() => window.invoicePrivacyQA.requests.filter(r => r.url === '/api/generate-invoice' && !r.body.precheckOnly).length), 0,
      'Dismissing confirmation must not generate an invoice');
    page.once('dialog', dialog => dialog.accept());
    await regenerate.click();
    await modal.waitFor({ state: 'hidden' });
    const request = await page.evaluate(() => window.invoicePrivacyQA.requests.find(r => r.url === '/api/generate-invoice' && !r.body.precheckOnly));
    assert.deepEqual(request.body.regeneration.invoiceIds, ['old-unpaid']);
    assert.equal(request.body.regeneration.token, 'synthetic-confirmation');
    assert.deepEqual(request.body.sessionIds, ['lesson-0', 'lesson-1', 'lesson-2']);
    results.push({ organization: 'school', viewport: mobile ? 'mobile' : 'desktop', checks: ['regeneration preview includes current lessons', 'native confirmation identifies prior invoice', 'cancel creates nothing', 'confirmation submits replacement'] });
    await context.close();
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ mode: 'real components, synthetic backend/auth fixtures', results }, null, 2));
  console.log(`Visual privacy checks passed. Evidence: ${output}`);
} finally { await browser.close(); }
