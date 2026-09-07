/**
 * Creates tutlio.lt enterprise graduated license price in EUR.
 * Run: npm run stripe:setup-enterprise
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { enterpriseEurTierDefs, enterpriseEurStripeTiers } from '../src/lib/enterprisePricingEur.js';

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

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_')) {
    console.error('STRIPE_SECRET_KEY missing in .env');
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: '2023-10-16' as Stripe.LatestApiVersion });
  const mode = key.includes('_test_') ? 'test' : 'live';
  console.log(`Stripe mode: ${mode}\n`);

  const product = await stripe.products.create({
    name: 'Tutlio Enterprise – korepetitorių licencijos',
    description: 'Graduated monthly license pricing for tutlio.lt schools and teams.',
    metadata: { market: 'lt', plan: 'enterprise' },
  });

  const tierDefs = enterpriseEurTierDefs();
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    billing_scheme: 'tiered',
    tiers_mode: 'volume',
    recurring: { interval: 'month' },
    tiers: enterpriseEurStripeTiers(),
    metadata: { market: 'lt', plan: 'enterprise' },
  });

  const created = {
    STRIPE_ENTERPRISE_PRODUCT_ID: product.id,
    STRIPE_ENTERPRISE_PRICE_ID: price.id,
  };

  console.log(`Product: ${product.id}`);
  console.log(`Price:   ${price.id} (volume EUR / month)\n`);
  let prevUpTo = 0;
  for (const tier of tierDefs) {
    const band = `${prevUpTo + 1}–${tier.upTo}`;
    const flat = tier.flatAmountCents ? ` + €${tier.flatAmountCents / 100} admin fee` : '';
    console.log(`  ${band}: €${tier.unitAmountCents / 100}/lic.${flat}`);
    prevUpTo = tier.upTo;
  }
  const last = tierDefs[tierDefs.length - 1]!;
  console.log(`  61+: €${last.unitAmountCents / 100}/lic. (Stripe catch-all; self-serve capped at ${last.upTo})`);

  const envPath = join(projectRoot, '.env');
  if (existsSync(envPath)) {
    let envText = readFileSync(envPath, 'utf8');
    for (const [k, v] of Object.entries(created)) {
      const re = new RegExp(`^(${k}=).*$`, 'm');
      if (re.test(envText)) envText = envText.replace(re, `$1${v}`);
      else envText += `\n${k}=${v}`;
    }
    writeFileSync(envPath, envText);
    console.log('\nUpdated .env with EUR enterprise IDs.');
  }

  console.log('\nAdd to Vercel (Production):\n');
  for (const [k, v] of Object.entries(created)) console.log(`${k}=${v}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
