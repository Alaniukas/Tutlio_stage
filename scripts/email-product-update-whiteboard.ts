import { createClient } from '@supabase/supabase-js';

type Locale = 'lt' | 'en';
type Role = 'tutor' | 'student' | 'parent';

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

const EMAIL_TYPE_MAP: Record<Role, string> = {
  tutor: 'product_update_whiteboard_tutor',
  student: 'product_update_whiteboard_student',
  parent: 'product_update_whiteboard_parent',
};

const SUBTITLE_MAP: Record<Role, Record<Locale, string>> = {
  tutor: {
    lt: 'Interaktyvi lenta jūsų pamokoms',
    en: 'Interactive whiteboard for your lessons',
  },
  student: {
    lt: 'Lenta + failų atsisiuntimas',
    en: 'Whiteboard + file downloads',
  },
  parent: {
    lt: 'Pamokų informacija + pranešimų valdymas',
    en: 'Lesson info + notification settings',
  },
};

interface Recipient {
  email: string;
  full_name: string;
  preferred_locale: Locale;
}

async function fetchTutors(sb: any): Promise<Recipient[]> {
  const { data: orgAdmins, error: orgAdminsErr } = await sb
    .from('organization_admins')
    .select('user_id');
  if (orgAdminsErr) throw orgAdminsErr;
  const orgAdminIds = new Set<string>((orgAdmins || []).map((r: any) => String(r.user_id)));

  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('user_id, full_name, email, preferred_locale');
  if (profErr) throw profErr;

  return (profiles || [])
    .filter((p: any) => !!p.email && !orgAdminIds.has(p.user_id))
    .map((p: any) => ({
      email: (p.email ?? '') as string,
      full_name: (p.full_name ?? '') as string,
      preferred_locale: (p.preferred_locale ?? 'lt') as Locale,
    }));
}

async function fetchStudents(sb: any): Promise<Recipient[]> {
  const { data: students, error: stuErr } = await sb
    .from('students')
    .select('linked_user_id, full_name, email');
  if (stuErr) throw stuErr;

  const seen = new Set<string>();
  return (students || [])
    .filter((s: any) => {
      const email = (s.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    })
    .map((s: any) => ({
      email: (s.email ?? '') as string,
      full_name: (s.full_name ?? '') as string,
      preferred_locale: 'lt' as Locale,
    }));
}

async function fetchParents(sb: any): Promise<Recipient[]> {
  const { data: parents, error: parErr } = await sb
    .from('parent_profiles')
    .select('user_id, full_name, email');
  if (parErr) throw parErr;

  const seen = new Set<string>();
  return (parents || [])
    .filter((p: any) => {
      const email = (p.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    })
    .map((p: any) => ({
      email: (p.email ?? '') as string,
      full_name: (p.full_name ?? '') as string,
      preferred_locale: 'lt' as Locale,
    }));
}

async function main() {
  const supabaseUrl = mustGetEnv('SUPABASE_URL');
  const serviceRoleKey = mustGetEnv('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.tutlio.lt';

  const roleArg = getArgValue('role') as Role | null;
  const validRoles: Role[] = ['tutor', 'student', 'parent'];
  const roles: Role[] = roleArg && validRoles.includes(roleArg) ? [roleArg] : validRoles;

  const onlyTo = getArgValue('only-to') || getArgValue('test-to') || process.env.ONLY_TO || process.env.TEST_TO || null;
  const dryRun = process.argv.includes('--dry-run');

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const endpoint = `${appUrl.replace(/\/$/, '')}/api/send-email`;

  for (const role of roles) {
    console.log(`\n=== ${role.toUpperCase()} ===`);

    let recipients: Recipient[];
    if (onlyTo) {
      recipients = [{
        email: onlyTo,
        full_name: '',
        preferred_locale: 'lt',
      }];
    } else {
      if (role === 'tutor') recipients = await fetchTutors(sb);
      else if (role === 'student') recipients = await fetchStudents(sb);
      else recipients = await fetchParents(sb);
    }

    console.log(`[${role}] recipients: ${recipients.length}${onlyTo ? ` (only-to: ${onlyTo})` : ''}`);
    if (recipients.length === 0) continue;

    if (dryRun) {
      console.log(`[${role}] DRY RUN — skipping send. First 5 emails:`);
      recipients.slice(0, 5).forEach((r) => console.log(`  ${r.email} (${r.full_name || 'no name'})`));
      continue;
    }

    for (const batch of chunk(recipients, 25)) {
      await Promise.all(
        batch.map(async (r) => {
          const locale: Locale = r.preferred_locale === 'en' ? 'en' : 'lt';
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-internal-key': serviceRoleKey,
            },
            body: JSON.stringify({
              type: EMAIL_TYPE_MAP[role],
              to: r.email,
              data: {
                recipientName: r.full_name || undefined,
                subtitle: SUBTITLE_MAP[role][locale],
              },
            }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error(`[${role}] FAILED ${r.email}: ${res.status} ${text}`);
          }
        }),
      );
      console.log(`[${role}] sent batch of ${batch.length}`);
    }

    console.log(`[${role}] done`);
  }

  console.log('\n=== ALL DONE ===');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
