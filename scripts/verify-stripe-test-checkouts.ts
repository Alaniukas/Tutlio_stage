/**
 * End-to-end verification for every fixed-price Stripe checkout used locally.
 * Creates test-mode Checkout Sessions through the running local API and only
 * prints pass/fail; client secrets and Checkout URLs are never printed.
 *
 * Run after npm run dev:test: npm run stripe:verify-test
 */

const apiOrigin = (process.env.DEV_API_ORIGIN || 'http://localhost:3002').replace(/\/$/, '');

interface CheckDefinition {
  label: string;
  path: string;
  market: 'eur' | 'pln';
  body: Record<string, unknown>;
  responseMode: 'embedded' | 'hosted';
}

const subscriptionChecks = (market: 'eur' | 'pln'): CheckDefinition[] =>
  (['monthly', 'yearly', 'subscription_only', 'subscription_only_yearly'] as const).map((plan) => ({
    label: `${market}/${plan}`,
    path: '/api/create-subscription-checkout',
    market,
    body: { plan, locale: market === 'pln' ? 'pl' : 'en', uiMode: 'embedded' },
    responseMode: 'embedded',
  }));

const checks: CheckDefinition[] = [
  ...subscriptionChecks('eur'),
  ...subscriptionChecks('pln'),
  {
    label: 'eur/enterprise',
    path: '/api/create-enterprise-checkout',
    market: 'eur',
    body: { licenseCount: 5, companyName: 'Tutlio local Stripe test', locale: 'en' },
    responseMode: 'hosted',
  },
  {
    label: 'pln/enterprise',
    path: '/api/create-enterprise-checkout',
    market: 'pln',
    body: { licenseCount: 5, companyName: 'Tutlio local Stripe test', locale: 'pl' },
    responseMode: 'hosted',
  },
];

async function runCheck(check: CheckDefinition): Promise<boolean> {
  try {
    const response = await fetch(`${apiOrigin}${check.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': check.market === 'pln' ? 'www.tutlio.pl' : 'localhost:3001',
        'x-forwarded-proto': check.market === 'pln' ? 'https' : 'http',
      },
      body: JSON.stringify(check.body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      clientSecret?: string;
      publishableKey?: string;
      url?: string;
      error?: string;
    };
    const valid =
      response.ok &&
      (check.responseMode === 'embedded'
        ? Boolean(data.clientSecret?.startsWith('cs_test_') && data.publishableKey?.startsWith('pk_test_'))
        : Boolean(data.url?.includes('cs_test_')));
    console.log(`${valid ? 'PASS' : 'FAIL'} ${check.label}${valid ? '' : ` — ${data.error || `HTTP ${response.status}`}`}`);
    return valid;
  } catch (error) {
    console.log(`FAIL ${check.label} — ${error instanceof Error ? error.message : 'request failed'}`);
    return false;
  }
}

async function main() {
  const results: boolean[] = [];
  for (const check of checks) results.push(await runCheck(check));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${checks.length} test-mode checkout paths passed.`);
  if (passed !== checks.length) process.exit(1);
}

void main();
