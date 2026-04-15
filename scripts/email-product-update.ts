import { createClient } from '@supabase/supabase-js';

type Locale = 'lt' | 'en';

function mustGetEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function getArgValue(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx !== -1) return process.argv[idx + 1] || null;
  const pref = `--${name}=`;
  const kv = process.argv.find((a) => a.startsWith(pref));
  return kv ? kv.slice(pref.length) : null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const supabaseUrl = mustGetEnv('SUPABASE_URL');
  const serviceRoleKey = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.tutlio.lt';

  const onlyTo =
    getArgValue('only-to') ||
    getArgValue('test-to') ||
    process.env.ONLY_TO ||
    process.env.TEST_TO ||
    null;

  const recipients = onlyTo
    ? [
        {
          user_id: 'test',
          full_name: '',
          email: onlyTo,
          preferred_locale: 'lt' as Locale,
          organization_id: null as string | null,
        },
      ]
    : await (async () => {
        const sb = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: orgAdmins, error: orgAdminsErr } = await sb
          .from('organization_admins')
          .select('user_id');
        if (orgAdminsErr) throw orgAdminsErr;
        const orgAdminIds = new Set<string>((orgAdmins || []).map((r: any) => String(r.user_id)));

        const { data: profiles, error: profErr } = await sb
          .from('profiles')
          .select('user_id, full_name, email, preferred_locale, organization_id');
        if (profErr) throw profErr;

        return (profiles || [])
          .map((p: any) => ({
            user_id: p.user_id as string,
            full_name: (p.full_name ?? '') as string,
            email: (p.email ?? '') as string,
            preferred_locale: (p.preferred_locale ?? 'lt') as Locale,
            organization_id: (p.organization_id ?? null) as string | null,
          }))
          // tutors only: individual_tutor (organization_id null) OR org_tutor (organization_id not null), exclude org_admins
          .filter((p) => !!p.email && !orgAdminIds.has(p.user_id));
      })();

  const total = recipients.length;
  console.log(`[product-update] recipients: ${total}${onlyTo ? ` (only-to: ${onlyTo})` : ''}`);
  if (total === 0) return;

  // Send through existing Vercel email endpoint (uses x-internal-key = service role key)
  const endpoint = `${appUrl.replace(/\/$/, '')}/api/send-email`;

  // Batch to avoid rate limits
  for (const batch of chunk(recipients, 25)) {
    await Promise.all(
      batch.map(async (r) => {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-key': serviceRoleKey,
          },
          body: JSON.stringify({
            type: 'product_update_sf_chat',
            to: r.email,
            data: {
              recipientName: r.full_name || undefined,
              subtitle: r.preferred_locale === 'en' ? 'Invoices + messaging' : 'Sąskaitos faktūros + susirašinėjimas',
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`[send-email] ${r.email} failed: ${res.status} ${text}`);
        }
      }),
    );
    console.log(`[product-update] sent batch ${batch.length}`);
  }

  console.log('[product-update] done');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

