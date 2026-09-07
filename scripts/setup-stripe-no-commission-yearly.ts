/**
 * Creates/reuses the production annual no-commission prices in Stripe.
 * Requires an sk_live_ STRIPE_SECRET_KEY and never modifies monthly prices.
 *
 * Run: npm run stripe:setup-no-commission-yearly
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { TUTOR_PLANS } from '../src/lib/pricing.js';
import { SUBSCRIPTION_PLN } from '../src/lib/subscriptionPricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const DEFAULT_EUR_PRODUCT_ID = 'prod_UOWf5Nqxf1wPIg';

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

loadEnvFile('.env.local');

async function productFromPrice(stripe: Stripe, priceId: string | undefined) {
  if (!priceId) return undefined;
  const price = await stripe.prices.retrieve(priceId);
  return typeof price.product === 'string' ? price.product : price.product.id;
}

async function ensurePlnNoCommissionProduct(stripe: Stripe) {
  const configured = process.env.STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID_PLN?.trim();
  const configuredPrice = process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID_PLN?.trim();
  if (configured) {
    const prices = await stripe.prices.list({ product: configured, active: true, limit: 100 });
    const monthly = prices.data.find(
      (price) =>
        price.currency === 'pln' &&
        price.unit_amount === Math.round(SUBSCRIPTION_PLN.subscriptionOnly * 100) &&
        price.type === 'recurring' &&
        price.recurring?.interval === 'month',
    );
    return { productId: configured, monthlyPriceId: configuredPrice || monthly?.id };
  }
  const fromConfiguredPrice = await productFromPrice(stripe, configuredPrice);
  if (fromConfiguredPrice) return { productId: fromConfiguredPrice, monthlyPriceId: configuredPrice };
  const products = await stripe.products.list({ active: true, limit: 100 });
  const metadataProduct = products.data.find(
    (product) => product.metadata.market === 'pl' && product.metadata.plan === 'subscription_only',
  );
  if (metadataProduct) {
    const prices = await stripe.prices.list({ product: metadataProduct.id, active: true, limit: 100 });
    const monthly = prices.data.find(
      (price) =>
        price.currency === 'pln' &&
        price.unit_amount === Math.round(SUBSCRIPTION_PLN.subscriptionOnly * 100) &&
        price.type === 'recurring' &&
        price.recurring?.interval === 'month',
    );
    if (monthly) return { productId: metadataProduct.id, monthlyPriceId: monthly.id };
  }

  const plnPrices = await stripe.prices.list({ active: true, currency: 'pln', limit: 100 });
  const existingMonthly = plnPrices.data.find(
    (price) =>
      price.unit_amount === Math.round(SUBSCRIPTION_PLN.subscriptionOnly * 100) &&
      price.type === 'recurring' &&
      price.recurring?.interval === 'month',
  );
  if (existingMonthly) {
    const productId = typeof existingMonthly.product === 'string'
      ? existingMonthly.product
      : existingMonthly.product.id;
    return { productId, monthlyPriceId: existingMonthly.id };
  }

  const product = await stripe.products.create({
    name: 'Tutlio – tylko subskrypcja (PL)',
    description: 'Pełny dostęp z płatnościami ręcznymi, bez prowizji.',
    metadata: { market: 'pl', plan: 'subscription_only' },
  });
  const monthly = await stripe.prices.create({
    product: product.id,
    currency: 'pln',
    unit_amount: Math.round(SUBSCRIPTION_PLN.subscriptionOnly * 100),
    recurring: { interval: 'month' },
    metadata: { market: 'pl', plan: 'subscription_only', billing_period: 'monthly' },
  });
  console.log('PLN no-commission monthly product/price: created');
  return { productId: product.id, monthlyPriceId: monthly.id };
}

async function ensureYearlyPrice(
  stripe: Stripe,
  productId: string,
  currency: 'eur' | 'pln',
  unitAmount: number,
) {
  await stripe.products.retrieve(productId);
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find(
    (candidate) =>
      candidate.livemode &&
      candidate.currency === currency &&
      candidate.unit_amount === unitAmount &&
      candidate.type === 'recurring' &&
      candidate.recurring?.interval === 'year',
  );
  if (existing) return { price: existing, created: false };
  const price = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: unitAmount,
    recurring: { interval: 'year' },
    nickname: 'Tutlio no commission yearly – 25% discount',
    metadata: {
      plan: 'subscription_only',
      billing_period: 'yearly',
      market: currency === 'pln' ? 'pl' : 'lt',
    },
  });
  return { price, created: true };
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key?.startsWith('sk_live_')) {
    throw new Error('STRIPE_SECRET_KEY must be an sk_live_ key. Refusing to modify production Stripe.');
  }
  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion });

  const eurProductId =
    process.env.STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID?.trim() ||
    (await productFromPrice(stripe, process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID?.trim())) ||
    DEFAULT_EUR_PRODUCT_ID;
  const eur = await ensureYearlyPrice(
    stripe,
    eurProductId,
    'eur',
    Math.round(TUTOR_PLANS.subscriptionOnly.pricePerYearEur * 100),
  );
  console.log(`EUR no-commission yearly: ${eur.created ? 'created' : 'reused'}`);

  const output: Record<string, string> = {
    STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID: eur.price.id,
  };

  const plnProduct = await ensurePlnNoCommissionProduct(stripe);
  const pln = await ensureYearlyPrice(
    stripe,
    plnProduct.productId,
    'pln',
    Math.round(SUBSCRIPTION_PLN.subscriptionOnlyYearlyTotal * 100),
  );
  output.STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID_PLN = plnProduct.productId;
  if (plnProduct.monthlyPriceId) {
    output.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID_PLN = plnProduct.monthlyPriceId;
  }
  output.STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID_PLN = pln.price.id;
  console.log(`PLN no-commission yearly: ${pln.created ? 'created' : 'reused'}`);

  console.log('\nProduction environment values:');
  for (const [name, value] of Object.entries(output)) console.log(`${name}=${value}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
