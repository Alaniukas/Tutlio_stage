/**
 * Creates tutlio.pl subscription products + PLN prices in Stripe (test or live per STRIPE_SECRET_KEY).
 * Writes STRIPE_*_PLN env keys — EUR keys in .env are left unchanged.
 * Run: npm run stripe:setup-pln
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { SUBSCRIPTION_PLN } from '../src/lib/subscriptionPricing.js';

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

const plnUnit = (amount: number) => Math.round(amount * 100);

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_')) {
    console.error('STRIPE_SECRET_KEY missing in .env — add your live or test key and re-run.');
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion });
  const mode = key.includes('_test_') ? 'test' : 'live';
  console.log(`Stripe mode: ${mode}\n`);

  const defs = [
    {
      envProduct: 'STRIPE_MONTHLY_PRODUCT_ID_PLN',
      envPrice: 'STRIPE_MONTHLY_PRICE_ID_PLN',
      name: 'Tutlio – plan miesięczny (PL)',
      description: 'Prenumerata miesięczna tutlio.pl – pełny dostęp dla korepetytora.',
      amount: SUBSCRIPTION_PLN.monthly,
      interval: 'month' as const,
      metadata: { plan: 'monthly', market: 'pl' },
    },
    {
      envProduct: 'STRIPE_YEARLY_PRODUCT_ID_PLN',
      envPrice: 'STRIPE_YEARLY_PRICE_ID_PLN',
      name: 'Tutlio – plan roczny (PL)',
      description: `Prenumerata roczna tutlio.pl – ${SUBSCRIPTION_PLN.yearlyTotal} PLN/rok.`,
      amount: SUBSCRIPTION_PLN.yearlyTotal,
      interval: 'year' as const,
      metadata: { plan: 'yearly', market: 'pl' },
    },
    {
      envProduct: 'STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID_PLN',
      envPrice: 'STRIPE_SUBSCRIPTION_ONLY_PRICE_ID_PLN',
      name: 'Tutlio – tylko subskrypcja (PL)',
      description: 'Prenumerata bez prowizji od lekcji – płatności ręczne.',
      amount: SUBSCRIPTION_PLN.subscriptionOnly,
      interval: 'month' as const,
      metadata: { plan: 'subscription_only', market: 'pl' },
    },
  ];

  const created: Record<string, string> = {};

  for (const def of defs) {
    const product = await stripe.products.create({
      name: def.name,
      description: def.description,
      metadata: def.metadata,
    });

    const price = await stripe.prices.create({
      product: product.id,
      currency: 'pln',
      unit_amount: plnUnit(def.amount),
      recurring: { interval: def.interval },
      metadata: def.metadata,
    });

    created[def.envProduct] = product.id;
    created[def.envPrice] = price.id;

    console.log(
      `${def.name}\n  product: ${product.id}\n  price:   ${price.id} (${def.amount} PLN / ${def.interval})\n`,
    );
  }

  const envPath = join(projectRoot, '.env');
  if (existsSync(envPath)) {
    let envText = readFileSync(envPath, 'utf8');
    for (const [k, v] of Object.entries(created)) {
      const re = new RegExp(`^(${k}=).*$`, 'm');
      if (re.test(envText)) {
        envText = envText.replace(re, `$1${v}`);
      } else {
        envText += `\n${k}=${v}`;
      }
    }
    writeFileSync(envPath, envText);
    console.log('Updated .env with PLN product and price IDs (EUR keys unchanged).\n');
  }

  console.log('Add these to Vercel → Project → Settings → Environment Variables (Production):\n');
  for (const [k, v] of Object.entries(created)) {
    console.log(`${k}=${v}`);
  }
  console.log('\nDeploy after saving. tutlio.pl checkout uses these automatically.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
