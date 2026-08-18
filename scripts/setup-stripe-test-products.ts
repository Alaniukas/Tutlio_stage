/**
 * Creates or reuses every Stripe Product/Price needed by local test-mode flows.
 *
 * Safety:
 * - Requires TEST_STRIPE_SECRET_KEY with an sk_test_ prefix.
 * - Never reads or writes the live STRIPE_* object IDs.
 * - Idempotent through metadata, so rerunning reuses active fixtures.
 *
 * Run: npm run stripe:setup-test
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { enterpriseEurStripeTiers } from '../src/lib/enterprisePricingEur.js';
import { enterprisePlnStripeTiers } from '../src/lib/enterprisePricingPln.js';
import { TUTOR_PLANS } from '../src/lib/pricing.js';
import { SUBSCRIPTION_PLN } from '../src/lib/subscriptionPricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const fixtureVersion = 'tutlio-local-test-v1';

function loadEnvFile(name: string) {
  const path = join(projectRoot, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

type Market = 'eur' | 'pln';
type Plan = 'monthly' | 'yearly' | 'subscription_only' | 'enterprise';

interface StandardPlanDefinition {
  market: Market;
  plan: Exclude<Plan, 'enterprise'>;
  name: string;
  description: string;
  currency: 'eur' | 'pln';
  unitAmount: number;
  interval: 'month' | 'year';
  productEnv: string;
  priceEnv: string;
}

const cents = (amount: number) => Math.round(amount * 100);

const standardPlans: StandardPlanDefinition[] = [
  {
    market: 'eur',
    plan: 'monthly',
    name: 'Tutlio – monthly tutor plan (TEST)',
    description: 'Test-mode monthly tutor subscription for local Tutlio checkout.',
    currency: 'eur',
    unitAmount: cents(TUTOR_PLANS.monthly.pricePerMonthEur),
    interval: 'month',
    productEnv: 'TEST_STRIPE_MONTHLY_PRODUCT_ID',
    priceEnv: 'TEST_STRIPE_MONTHLY_PRICE_ID',
  },
  {
    market: 'eur',
    plan: 'yearly',
    name: 'Tutlio – yearly tutor plan (TEST)',
    description: 'Test-mode yearly tutor subscription for local Tutlio checkout.',
    currency: 'eur',
    unitAmount: cents(TUTOR_PLANS.yearly.pricePerYearEur),
    interval: 'year',
    productEnv: 'TEST_STRIPE_YEARLY_PRODUCT_ID',
    priceEnv: 'TEST_STRIPE_YEARLY_PRICE_ID',
  },
  {
    market: 'eur',
    plan: 'subscription_only',
    name: 'Tutlio – subscription only (TEST)',
    description: 'Test-mode no-commission tutor subscription for local Tutlio checkout.',
    currency: 'eur',
    unitAmount: cents(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur),
    interval: 'month',
    productEnv: 'TEST_STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID',
    priceEnv: 'TEST_STRIPE_SUBSCRIPTION_ONLY_PRICE_ID',
  },
  {
    market: 'pln',
    plan: 'monthly',
    name: 'Tutlio – plan miesięczny (PL, TEST)',
    description: 'Test-mode monthly tutlio.pl tutor subscription.',
    currency: 'pln',
    unitAmount: cents(SUBSCRIPTION_PLN.monthly),
    interval: 'month',
    productEnv: 'TEST_STRIPE_MONTHLY_PRODUCT_ID_PLN',
    priceEnv: 'TEST_STRIPE_MONTHLY_PRICE_ID_PLN',
  },
  {
    market: 'pln',
    plan: 'yearly',
    name: 'Tutlio – plan roczny (PL, TEST)',
    description: 'Test-mode yearly tutlio.pl tutor subscription.',
    currency: 'pln',
    unitAmount: cents(SUBSCRIPTION_PLN.yearlyTotal),
    interval: 'year',
    productEnv: 'TEST_STRIPE_YEARLY_PRODUCT_ID_PLN',
    priceEnv: 'TEST_STRIPE_YEARLY_PRICE_ID_PLN',
  },
  {
    market: 'pln',
    plan: 'subscription_only',
    name: 'Tutlio – tylko subskrypcja (PL, TEST)',
    description: 'Test-mode no-commission tutlio.pl tutor subscription.',
    currency: 'pln',
    unitAmount: cents(SUBSCRIPTION_PLN.subscriptionOnly),
    interval: 'month',
    productEnv: 'TEST_STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID_PLN',
    priceEnv: 'TEST_STRIPE_SUBSCRIPTION_ONLY_PRICE_ID_PLN',
  },
];

function fixtureMetadata(market: Market, plan: Plan) {
  return { tutlio_fixture: fixtureVersion, market, plan };
}

async function findFixtureProduct(stripe: Stripe, market: Market, plan: Plan) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  return products.data.find(
    (product) =>
      product.metadata.tutlio_fixture === fixtureVersion &&
      product.metadata.market === market &&
      product.metadata.plan === plan,
  );
}

async function ensureProduct(stripe: Stripe, market: Market, plan: Plan, name: string, description: string) {
  const existing = await findFixtureProduct(stripe, market, plan);
  if (existing) return { product: existing, created: false };
  const product = await stripe.products.create({
    name,
    description,
    metadata: fixtureMetadata(market, plan),
  });
  return { product, created: true };
}

async function ensureStandardPlan(stripe: Stripe, definition: StandardPlanDefinition) {
  const { product, created: productCreated } = await ensureProduct(
    stripe,
    definition.market,
    definition.plan,
    definition.name,
    definition.description,
  );
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find(
    (candidate) =>
      candidate.livemode === false &&
      candidate.currency === definition.currency &&
      candidate.unit_amount === definition.unitAmount &&
      candidate.type === 'recurring' &&
      candidate.recurring?.interval === definition.interval,
  );
  let priceCreated = false;
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: definition.currency,
      unit_amount: definition.unitAmount,
      recurring: { interval: definition.interval },
      metadata: fixtureMetadata(definition.market, definition.plan),
    });
    priceCreated = true;
  }
  return { product, price, productCreated, priceCreated };
}

async function ensureNoCommissionYearlyPrice(stripe: Stripe, market: Market, productId: string) {
  const unitAmount = market === 'eur'
    ? cents(TUTOR_PLANS.subscriptionOnly.pricePerYearEur)
    : cents(SUBSCRIPTION_PLN.subscriptionOnlyYearlyTotal);
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find(
    (candidate) =>
      candidate.livemode === false &&
      candidate.currency === market &&
      candidate.unit_amount === unitAmount &&
      candidate.type === 'recurring' &&
      candidate.recurring?.interval === 'year',
  );
  if (existing) return { price: existing, created: false };
  const price = await stripe.prices.create({
    product: productId,
    currency: market,
    unit_amount: unitAmount,
    recurring: { interval: 'year' },
    metadata: {
      ...fixtureMetadata(market, 'subscription_only'),
      billing_period: 'yearly',
    },
  });
  return { price, created: true };
}

async function ensureEnterprisePlan(stripe: Stripe, market: Market) {
  const currency = market;
  const { product, created: productCreated } = await ensureProduct(
    stripe,
    market,
    'enterprise',
    `Tutlio – enterprise licenses (${currency.toUpperCase()}, TEST)`,
    'Test-mode volume-tiered enterprise licenses for local Tutlio checkout.',
  );
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find(
    (candidate) =>
      candidate.livemode === false &&
      candidate.currency === currency &&
      candidate.type === 'recurring' &&
      candidate.recurring?.interval === 'month' &&
      candidate.billing_scheme === 'tiered' &&
      candidate.metadata.tutlio_fixture === fixtureVersion,
  );
  let priceCreated = false;
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency,
      billing_scheme: 'tiered',
      tiers_mode: 'volume',
      recurring: { interval: 'month' },
      tiers: market === 'eur' ? enterpriseEurStripeTiers() : enterprisePlnStripeTiers(),
      metadata: fixtureMetadata(market, 'enterprise'),
    });
    priceCreated = true;
  }
  return { product, price, productCreated, priceCreated };
}

async function main() {
  const key = process.env.TEST_STRIPE_SECRET_KEY?.trim();
  if (!key?.startsWith('sk_test_')) {
    throw new Error('TEST_STRIPE_SECRET_KEY must be an sk_test_ key. Refusing to create Stripe objects.');
  }

  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion });
  const account = await stripe.accounts.retrieve();
  if (account.charges_enabled === undefined) throw new Error('Could not verify the Stripe test account.');

  const output: Record<string, string> = {};
  for (const definition of standardPlans) {
    const result = await ensureStandardPlan(stripe, definition);
    output[definition.productEnv] = result.product.id;
    output[definition.priceEnv] = result.price.id;
    console.log(
      `${definition.market}/${definition.plan}: ${result.productCreated || result.priceCreated ? 'created' : 'reused'} test fixture`,
    );
    if (definition.plan === 'subscription_only') {
      const yearly = await ensureNoCommissionYearlyPrice(stripe, definition.market, result.product.id);
      const suffix = definition.market === 'pln' ? '_PLN' : '';
      output[`TEST_STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID${suffix}`] = yearly.price.id;
      console.log(
        `${definition.market}/subscription_only_yearly: ${yearly.created ? 'created' : 'reused'} test fixture`,
      );
    }
  }

  for (const market of ['eur', 'pln'] as const) {
    const result = await ensureEnterprisePlan(stripe, market);
    const suffix = market === 'pln' ? '_PLN' : '';
    output[`TEST_STRIPE_ENTERPRISE_PRODUCT_ID${suffix}`] = result.product.id;
    output[`TEST_STRIPE_ENTERPRISE_PRICE_ID${suffix}`] = result.price.id;
    console.log(
      `${market}/enterprise: ${result.productCreated || result.priceCreated ? 'created' : 'reused'} test fixture`,
    );
  }

  console.log('\nAdd or replace these entries in .env.local:');
  for (const [name, value] of Object.entries(output)) console.log(`${name}=${value}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
