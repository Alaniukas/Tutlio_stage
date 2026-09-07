/**
 * Adds USD to the existing EUR tutor-subscription prices in Stripe as
 * multi-currency `currency_options`, so Checkout can bill locales without a
 * supported local currency in USD (see src/lib/localeCurrency.ts) while every
 * price ID, webhook mapping and plan lookup stays exactly as it is.
 *
 * Amounts come from TUTOR_PLANS_USD in src/lib/pricing.ts. Re-running is safe:
 * Stripe replaces the USD option with the same values.
 *
 *   npm run stripe:setup-usd          # live account (STRIPE_SECRET_KEY)
 *   npm run stripe:setup-usd-test     # test account (TEST_STRIPE_SECRET_KEY + TEST_* price IDs)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { TUTOR_PLANS_USD } from '../src/lib/pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function loadEnvFile(name: string) {
  const p = join(projectRoot, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const testMode = process.argv.includes('--test');
const envPrefix = testMode ? 'TEST_' : '';
const cents = (amount: number) => Math.round(amount * 100);

const DEFAULT_YEARLY_PRODUCT_ID = 'prod_U9DYSN7YFtsyBI';
const DEFAULT_SUBSCRIPTION_ONLY_PRODUCT_ID = 'prod_UOWf5Nqxf1wPIg';

interface Target {
  label: string;
  priceEnv: string;
  productEnvs: string[];
  interval: 'month' | 'year';
  unitAmount: number;
}

const TARGETS: Target[] = [
  { label: 'monthly', priceEnv: 'STRIPE_MONTHLY_PRICE_ID', productEnvs: ['STRIPE_MONTHLY_PRODUCT_ID'], interval: 'month', unitAmount: cents(TUTOR_PLANS_USD.monthly.pricePerMonth) },
  { label: 'yearly', priceEnv: 'STRIPE_YEARLY_PRICE_ID', productEnvs: ['STRIPE_YEARLY_PRODUCT_ID'], interval: 'year', unitAmount: cents(TUTOR_PLANS_USD.yearly.pricePerYear) },
  { label: 'subscription_only', priceEnv: 'STRIPE_SUBSCRIPTION_ONLY_PRICE_ID', productEnvs: ['STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID'], interval: 'month', unitAmount: cents(TUTOR_PLANS_USD.subscriptionOnly.pricePerMonth) },
  { label: 'subscription_only_yearly', priceEnv: 'STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID', productEnvs: ['STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID'], interval: 'year', unitAmount: cents(TUTOR_PLANS_USD.subscriptionOnly.pricePerYear) },
];

async function resolvePriceId(stripe: Stripe, target: Target): Promise<string | undefined> {
  const direct = process.env[`${envPrefix}${target.priceEnv}`]?.trim();
  if (direct) return direct;
  const products = target.productEnvs.map((e) => process.env[`${envPrefix}${e}`]?.trim()).filter(Boolean) as string[];
  if (!testMode) {
    if (target.label === 'yearly') products.push(DEFAULT_YEARLY_PRODUCT_ID);
    if (target.label.startsWith('subscription_only')) products.push(DEFAULT_SUBSCRIPTION_ONLY_PRODUCT_ID);
  }
  for (const product of [...new Set(products)]) {
    const prices = await stripe.prices.list({ product, active: true, limit: 20 });
    const match = prices.data.find((p) => p.type === 'recurring' && p.recurring?.interval === target.interval);
    if (match) return match.id;
  }
  return undefined;
}

async function main() {
  const key = process.env[`${envPrefix}STRIPE_SECRET_KEY`];
  if (!key?.startsWith('sk_')) {
    console.error(`${envPrefix}STRIPE_SECRET_KEY missing in .env / .env.local`);
    process.exit(1);
  }
  const mode = key.includes('_test_') ? 'test' : 'live';
  if (testMode && mode !== 'test') {
    console.error('--test was given but the key is not a test key; refusing.');
    process.exit(1);
  }
  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion });
  console.log(`Stripe mode: ${mode}\n`);

  let failures = 0;
  for (const target of TARGETS) {
    const priceId = await resolvePriceId(stripe, target);
    if (!priceId) {
      console.log(`✗ ${target.label}: no EUR price found (set ${envPrefix}${target.priceEnv})`);
      failures += 1;
      continue;
    }
    const before = await stripe.prices.retrieve(priceId, { expand: ['currency_options'] });
    if (before.currency !== 'eur') {
      console.log(`✗ ${target.label}: ${priceId} is ${before.currency}, expected the EUR price`);
      failures += 1;
      continue;
    }
    const existing = before.currency_options?.usd?.unit_amount;
    if (existing === target.unitAmount) {
      console.log(`✓ ${target.label}: ${priceId} already has USD ${(existing / 100).toFixed(2)}`);
      continue;
    }
    const updated = await stripe.prices.update(priceId, {
      currency_options: { usd: { unit_amount: target.unitAmount } },
    } as Stripe.PriceUpdateParams);
    const after = await stripe.prices.retrieve(updated.id, { expand: ['currency_options'] });
    const usdAmount = after.currency_options?.usd?.unit_amount;
    if (usdAmount !== target.unitAmount) {
      console.log(`✗ ${target.label}: ${priceId} USD option not applied`);
      failures += 1;
      continue;
    }
    console.log(`✓ ${target.label}: ${priceId} EUR ${(before.unit_amount ?? 0) / 100} → USD option ${(usdAmount / 100).toFixed(2)} ${existing ? `(was ${(existing / 100).toFixed(2)})` : '(new)'}`);
  }

  if (failures) {
    console.log(`\n${failures} price(s) could not be updated.`);
    process.exit(1);
  }
  console.log('\nAll EUR subscription prices carry a USD option. Checkout with locale in USD_LOCALES will bill USD.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
