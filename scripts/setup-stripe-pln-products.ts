/**
 * Creates tutlio.pl subscription products + PLN prices in Stripe (test or live per STRIPE_SECRET_KEY).
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
    console.error('STRIPE_SECRET_KEY missing in .env');
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion });
  const mode = key.includes('_test_') ? 'test' : 'live';
  console.log(`Stripe mode: ${mode}`);

  const defs = [
    {
      envProduct: 'STRIPE_MONTHLY_PRODUCT_ID',
      envPrice: 'STRIPE_MONTHLY_PRICE_ID',
      name: 'Tutlio ΓÇô plan miesi─Öczny (PL)',
      description: 'Prenumerata miesi─Öczna tutlio.pl ΓÇô pe┼ény dost─Öp dla korepetytora.',
      amount: SUBSCRIPTION_PLN.monthly,
      interval: 'month' as const,
      metadata: { plan: 'monthly', market: 'pl' },
    },
    {
      envProduct: 'STRIPE_YEARLY_PRODUCT_ID',
      envPrice: 'STRIPE_YEARLY_PRICE_ID',
      name: 'Tutlio ΓÇô plan roczny (PL)',
      description: `Prenumerata roczna tutlio.pl ΓÇô ${SUBSCRIPTION_PLN.yearlyTotal} PLN/rok.`,
      amount: SUBSCRIPTION_PLN.yearlyTotal,
      interval: 'year' as const,
      metadata: { plan: 'yearly', market: 'pl' },
    },
    {
      envProduct: 'STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID',
      envPrice: 'STRIPE_SUBSCRIPTION_ONLY_PRICE_ID',
      name: 'Tutlio ΓÇô tylko subskrypcja (PL)',
      description: 'Prenumerata bez prowizji od lekcji ΓÇô p┼éatno┼¢ci r─Öczne.',
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
      `\n${def.name}\n  product: ${product.id}\n  price:   ${price.id} (${def.amount} PLN / ${def.interval})`,
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
    console.log('\nUpdated .env with product and price IDs.');
  }

  console.log('\nAdd the same IDs to Vercel (Production) when deploying tutlio.pl.');
  console.log('Restart dev API after changing .env: npm run dev');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
