/**
 * Creates tutlio.pl enterprise graduated license price in PLN.
 * Run: npm run stripe:setup-pln-enterprise
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { enterprisePlnTierDefs, enterprisePlnStripeTiers } from '../src/lib/enterprisePricingPln.js';

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
    name: 'Tutlio Enterprise – licencje korepetytorów (PL)',
    description: 'Graduated monthly license pricing for tutlio.pl schools and teams.',
    metadata: { market: 'pl', plan: 'enterprise' },
  });

  const tierDefs = enterprisePlnTierDefs();
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'pln',
    billing_scheme: 'tiered',
    tiers_mode: 'volume',
    recurring: { interval: 'month' },
    tiers: enterprisePlnStripeTiers(),
    metadata: { market: 'pl', plan: 'enterprise' },
  });

  const created = {
    STRIPE_ENTERPRISE_PRODUCT_ID_PLN: product.id,
    STRIPE_ENTERPRISE_PRICE_ID_PLN: price.id,
  };

  console.log(`Product: ${product.id}`);
  console.log(`Price:   ${price.id} (volume PLN / month)\n`);
  let prevUpTo = 0;
  for (const tier of tierDefs) {
    const band = `${prevUpTo + 1}–${tier.upTo}`;
    const flat = tier.flatAmountCents ? ` + ${tier.flatAmountCents / 100} zł opłata admin` : '';
    console.log(`  ${band}: ${tier.unitAmountCents / 100} zł/lic.${flat}`);
    prevUpTo = tier.upTo;
  }
  const last = tierDefs[tierDefs.length - 1]!;
  console.log(`  61+: ${last.unitAmountCents / 100} zł/lic. (Stripe catch-all; self-serve capped at ${last.upTo})`);

  const envPath = join(projectRoot, '.env');
  if (existsSync(envPath)) {
    let envText = readFileSync(envPath, 'utf8');
    for (const [k, v] of Object.entries(created)) {
      const re = new RegExp(`^(${k}=).*$`, 'm');
      if (re.test(envText)) envText = envText.replace(re, `$1${v}`);
      else envText += `\n${k}=${v}`;
    }
    writeFileSync(envPath, envText);
    console.log('\nUpdated .env with PLN enterprise IDs.');
  }

  console.log('\nAdd to Vercel (Production):\n');
  for (const [k, v] of Object.entries(created)) console.log(`${k}=${v}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
