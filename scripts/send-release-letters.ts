/**
 * Release / product update letters (LT) – tėvams+mokiniams, individualiems korep., org adminams.
 *
 * Gavėjų skaitymui iš DB:
 *   SUPABASE_URL arba VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   Jei .env tik staging, o siunčiate į prod – naudokite production porą (vienam paleidimui):
 *     RELEASE_RECIPIENTS_SUPABASE_URL + RELEASE_RECIPIENTS_SERVICE_ROLE_KEY
 *
 * Siuntimui į /api/send-email (APP_URL, pvz. https://www.tutlio.lt):
 *   x-internal-key turi sutapti su tos Vercel aplinkos SUPABASE_SERVICE_ROLE_KEY.
 *   Jei lokaliai laikote staging raktą, įdėkite production raktą tik siuntimui:
 *     RELEASE_SEND_X_INTERNAL_KEY=<tas pats kaip Vercel SUPABASE_SERVICE_ROLE_KEY>
 *
 * Naudojimas:
 *   npx tsx scripts/send-release-letters.ts --dry-run --audience=all
 *   npx tsx scripts/send-release-letters.ts --only-to=jusu@pastas.lt --audience=parents
 *   npx tsx scripts/send-release-letters.ts --send --i-confirm-broadcast --audience=tutors
 *   npm run release-letters -- --send --send-all-test-templates --only-to=jusu@pastas.lt
 *   (arba: npx tsx scripts/send-release-letters.ts ... tą patį)
 *
 * Jei „ECONNREFUSED“: neveikia API adresas. Lokaliai – `npm run dev`, arba APP_URL į production su deploy’intu api/send-email.
 * Masinis siuntimas ribojamas pagal Resend (~5 req/s): partijos po 5 + pauzė; rate limit atveju – automatinis retry.
 *
 * Org adminams pagal nutylėjimą siunčiama tik į fiksuotą sąrašą (žr. ORG_ADMIN_FIXED_RECIPIENTS).
 * --audience=all: tas pats el. paštas negauna kelių laiškų — paliekama viena auditorija (pirmenybė: tėvai → korep. → org).
 * Papildomas blokavimas: RELEASE_LETTER_BLOCKLIST=email1,email2 ir numatytasis info@sutelktosmintys.lt
 *
 * SQL rankiniam eksportui: scripts/sql/release_letter_export_emails.sql
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

type Audience = 'parents' | 'tutors' | 'admins' | 'all';

function loadEnvFile(name: string) {
  const p = join(projectRoot, name);
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

/** Supabase URL gavėjams (prod arba staging). */
function getRecipientsSupabaseUrl(): string {
  const u = (
    process.env.RELEASE_RECIPIENTS_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  if (!u) {
    throw new Error(
      'Trūksta Supabase URL gavėjams: nustatykite SUPABASE_URL arba VITE_SUPABASE_URL, arba RELEASE_RECIPIENTS_SUPABASE_URL (production, jei .env tik staging).',
    );
  }
  return u;
}

/** Service role gavėjams skaityti (turi atitikti RELEASE_RECIPIENTS_SUPABASE_URL projektą). */
function getRecipientsServiceRoleKey(): string {
  const k = (process.env.RELEASE_RECIPIENTS_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!k) {
    throw new Error(
      'Trūksta SUPABASE_SERVICE_ROLE_KEY (arba RELEASE_RECIPIENTS_SERVICE_ROLE_KEY, jei skaitote iš kito projekto nei .env).',
    );
  }
  return k;
}

/**
 * Raktas į POST /api/send-email antraštėje x-internal-key.
 * Production API priima tik raktą, sutampantį su Vercel SUPABASE_SERVICE_ROLE_KEY.
 */
function getSendInternalKey(): string {
  const k = (process.env.RELEASE_SEND_X_INTERNAL_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!k) {
    throw new Error(
      'Trūksta SUPABASE_SERVICE_ROLE_KEY arba RELEASE_SEND_X_INTERNAL_KEY (x-internal-key siuntimui per APP_URL).',
    );
  }
  return k;
}

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1) return process.argv[idx + 1] ?? '';
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function normEmail(e: string | null | undefined): string | null {
  if (!e || typeof e !== 'string') return null;
  const t = e.trim().toLowerCase();
  if (!t || !t.includes('@')) return null;
  return t;
}

interface Recipient {
  email: string;
  fullName: string | null;
  audience: 'parents' | 'tutors' | 'admins';
}

/** Org admin release – tik šie adresai (ne visa organization_admins lentelė). */
const ORG_ADMIN_FIXED_RECIPIENTS = ['info@mokslovaisiai.lt', 'info@mokumoko.lt'] as const;

/** Visada neįtraukti į masinį siuntimą (tėvai / korep.). Papildykite per RELEASE_LETTER_BLOCKLIST. */
const DEFAULT_RELEASE_BLOCKLIST = ['info@sutelktosmintys.lt'] as const;

/** Mažesnis skaičius = aukštesnė pirmenybė, jei tas pats adresas keliose auditorijose. */
const AUDIENCE_PRIORITY: Record<Recipient['audience'], number> = { parents: 0, tutors: 1, admins: 2 };

function loadReleaseBlocklist(): Set<string> {
  const s = new Set<string>();
  for (const e of DEFAULT_RELEASE_BLOCKLIST) {
    const n = normEmail(e);
    if (n) s.add(n);
  }
  const extra = process.env.RELEASE_LETTER_BLOCKLIST;
  if (extra) {
    for (const part of extra.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)) {
      const n = normEmail(part);
      if (n) s.add(n);
    }
  }
  return s;
}

function filterBlocklist(list: Recipient[], block: Set<string>): Recipient[] {
  return list.filter((r) => !block.has(r.email));
}

/** Tas pats el. paštas tik vienoje auditorijoje (pirmenybė: tėvai → korep. → org admin). */
function dedupeAcrossAudiences(
  parents: Recipient[],
  tutors: Recipient[],
  admins: Recipient[],
): { parents: Recipient[]; tutors: Recipient[]; admins: Recipient[]; dropped: number } {
  const map = new Map<string, Recipient>();
  const consider = (r: Recipient) => {
    const prev = map.get(r.email);
    if (!prev) {
      map.set(r.email, r);
      return;
    }
    if (AUDIENCE_PRIORITY[r.audience] < AUDIENCE_PRIORITY[prev.audience]) map.set(r.email, r);
  };
  const before = parents.length + tutors.length + admins.length;
  for (const r of parents) consider(r);
  for (const r of tutors) consider(r);
  for (const r of admins) consider(r);
  const np: Recipient[] = [];
  const nt: Recipient[] = [];
  const na: Recipient[] = [];
  for (const r of map.values()) {
    if (r.audience === 'parents') np.push(r);
    else if (r.audience === 'tutors') nt.push(r);
    else na.push(r);
  }
  return { parents: np, tutors: nt, admins: na, dropped: before - map.size };
}

function chunk<T>(arr: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n));
  return o;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resend API tipinis limitas: ~5 užklausų / s vienam raktui. */
const RESEND_SEND_BATCH_SIZE = 5;
const RESEND_PAUSE_MS_AFTER_BATCH = 1100;

async function fetchAllStudents(sb: SupabaseClient): Promise<any[]> {
  const out: any[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb
      .from('students')
      .select('id, email, payer_email, parent_secondary_email, linked_user_id, full_name, payer_name')
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

async function listAllAuthUsers(sb: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data.users as User[];
    if (!users.length) break;
    for (const u of users) {
      const em = normEmail(u.email ?? '');
      if (em) map.set(u.id, em);
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return map;
}

async function fetchParentEmailsForStudents(sb: SupabaseClient): Promise<Map<string, { email: string; name: string | null }>> {
  const out = new Map<string, { email: string; name: string | null }>();
  const { data: links, error: le } = await sb.from('parent_students').select('parent_id');
  if (le) throw le;
  const parentIds = [...new Set((links ?? []).map((r: any) => r.parent_id as string).filter(Boolean))];
  for (const part of chunk(parentIds, 500)) {
    if (!part.length) continue;
    const { data: profs, error: pe } = await sb.from('parent_profiles').select('id, email, full_name').in('id', part);
    if (pe) throw pe;
    for (const p of profs ?? []) {
      const em = normEmail((p as any).email);
      if (em) out.set((p as any).id, { email: em, name: (p as any).full_name ?? null });
    }
  }
  return out;
}

async function collectParentsStudents(sb: SupabaseClient, authById: Map<string, string>): Promise<Recipient[]> {
  const seen = new Set<string>();
  const list: Recipient[] = [];
  const students = await fetchAllStudents(sb);
  const parentById = await fetchParentEmailsForStudents(sb);

  for (const s of students) {
    const add = (raw: string | null | undefined, name: string | null) => {
      const em = normEmail(raw ?? '');
      if (!em || seen.has(em)) return;
      seen.add(em);
      list.push({ email: em, fullName: name, audience: 'parents' });
    };

    add(s.email, s.full_name ?? null);
    add(s.payer_email, s.payer_name ?? null);
    add(s.parent_secondary_email, null);

    if (s.linked_user_id) {
      const em = authById.get(s.linked_user_id);
      if (em) add(em, s.full_name ?? null);
    }
  }

  for (const { email, name } of parentById.values()) {
    if (seen.has(email)) continue;
    seen.add(email);
    list.push({ email, fullName: name, audience: 'parents' });
  }

  return list;
}

async function collectIndividualTutors(sb: SupabaseClient): Promise<Recipient[]> {
  const { data: rows, error } = await sb.from('students').select('tutor_id');
  if (error) throw error;
  const tutorIds = [...new Set((rows ?? []).map((r: any) => r.tutor_id as string).filter(Boolean))];
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const part of chunk(tutorIds, 300)) {
    const { data: profs, error: pe } = await sb
      .from('profiles')
      .select('id, email, full_name, organization_id')
      .in('id', part)
      .is('organization_id', null);
    if (pe) throw pe;
    for (const p of profs ?? []) {
      const em = normEmail((p as any).email);
      if (!em || seen.has(em)) continue;
      seen.add(em);
      out.push({ email: em, fullName: (p as any).full_name ?? null, audience: 'tutors' });
    }
  }
  return out;
}

async function collectOrgAdmins(sb: SupabaseClient): Promise<Recipient[]> {
  const emails = [...ORG_ADMIN_FIXED_RECIPIENTS].map((e) => normEmail(e)).filter((e): e is string => Boolean(e));
  if (!emails.length) return [];

  const byEmail = new Map<string, string | null>();
  const { data: profs, error } = await sb.from('profiles').select('email, full_name').in('email', emails);
  if (error) throw error;
  for (const p of profs ?? []) {
    const em = normEmail((p as any).email);
    if (em) byEmail.set(em, (p as any).full_name ?? null);
  }

  return emails.map((em) => ({
    email: em,
    fullName: byEmail.get(em) ?? null,
    audience: 'admins' as const,
  }));
}

const RELEASE_EMAIL_SUBJECT = 'Tutlio naujienos';

function greetingLine(): string {
  return `<p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#111827;line-height:1.35;letter-spacing:-0.02em;">Sveiki,</p>`;
}

/** Sąrašas su „checkmark“ eilutėmis – geriau veikia Gmail / Outlook nei paprastas ul. */
function releaseBulletRows(lines: string[]): string {
  const rows = lines
    .map(
      (line) =>
        `<tr>
  <td style="vertical-align:top;padding:10px 12px 10px 0;width:28px;font-size:15px;color:#4f46e5;line-height:1.45;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">✓</td>
  <td style="vertical-align:top;padding:10px 0;color:#374151;font-size:15px;line-height:1.6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${line}</td>
</tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;border-collapse:collapse;">${rows}</table>`;
}

function wrapReleaseEmail(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef0f4;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
        <tr>
          <td style="background-color:#4f46e5;padding:24px 28px;">
            <span style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;">Tutlio</span>
            <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.88);margin-top:6px;font-weight:500;">Naujienos iš platformos</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            <div style="border-top:1px solid #e5e7eb;margin:4px 0 18px;"></div>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;text-align:center;">
              Tutlio komanda ·
              <a href="mailto:info@tutlio.lt" style="color:#4f46e5;font-weight:600;text-decoration:none;">info@tutlio.lt</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function letterParents(): { subject: string; bodyHtml: string } {
  const intro =
    '<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.65;">Šįkart daug ką patobulinome – trumpai, kas svarbiausia <strong style="color:#111827;">tėvams ir mokiniams</strong>:</p>';
  const bullets = releaseBulletRows([
    '<strong style="color:#111827;">Tėvų paskyros</strong> – kvietimą tėvui susikurti paskyrą galite suformuoti <strong>vaiko mokinio profilio nustatymuose</strong>; prisijungęs tėvas susieja savo paskyrą su vaiku.',
    '<strong style="color:#111827;">Apmokėjimai ir vaikų paskyros</strong> – patogiau matyti mokėjimus, sekti sąskaitas ir tvarkyti vaikų prieigas vienoje vietoje.',
    '<strong style="color:#111827;">Atnaujintas dizainas</strong> – aiškesnė navigacija ir tvarkingesnė išvaizda telefone bei kompiuteryje.',
    '<strong style="color:#111827;">Programėlė iš naršyklės (PWA)</strong> – galite įsidiegti Tutlio kaip programėlę: nustatymuose rasite nuorodą / instrukciją.',
  ]);
  const outro =
    '<p style="margin:18px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">Jei reikia pagalbos – parašykite mums į <a href="mailto:info@tutlio.lt" style="color:#4f46e5;font-weight:600;text-decoration:none;">info@tutlio.lt</a>. Ačiū, kad naudojatės Tutlio.</p>';
  const bodyHtml = wrapReleaseEmail(`##GREETING##${intro}${bullets}${outro}`);
  return { subject: RELEASE_EMAIL_SUBJECT, bodyHtml };
}

function letterTutors(): { subject: string; bodyHtml: string } {
  const intro =
    '<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.65;">Štai svarbiausi atnaujinimai <strong style="color:#111827;">individualiems korepetitoriams</strong>:</p>';
  const bullets = releaseBulletRows([
    '<strong style="color:#111827;">Sąskaitų generavimas</strong> – patogesnis darbas su sąskaitomis faktūromis ir jų peržiūra platformoje.',
    '<strong style="color:#111827;">Programėlė iš naršyklės (PWA)</strong> – Tutlio galite įsidiegti kaip programėlę; instrukciją rasite nustatymuose.',
    '<strong style="color:#111827;">Tėvų paskyros prie mokinių</strong> – jūsų mokiniai gali turėti susietas tėvų paskyras, kad šeima matytų tvarkaraštį ir susijusią informaciją.',
    '<strong style="color:#111827;">Atnaujintas dizainas</strong> – tvarkingesnė išvaizda ir patogesnis naudojimasis telefone bei kompiuteryje.',
  ]);
  const outro =
    '<p style="margin:18px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">Klausimų atveju – <a href="mailto:info@tutlio.lt" style="color:#4f46e5;font-weight:600;text-decoration:none;">info@tutlio.lt</a>. Ačiū, kad dirbate su Tutlio.</p>';
  const bodyHtml = wrapReleaseEmail(`##GREETING##${intro}${bullets}${outro}`);
  return { subject: RELEASE_EMAIL_SUBJECT, bodyHtml };
}

function letterAdmins(): { subject: string; bodyHtml: string } {
  const intro =
    '<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.65;">Trumpai apie naujinius <strong style="color:#111827;">organizacijos administravimui</strong> (mokyklos / komandos):</p>';
  const bullets = releaseBulletRows([
    '<strong style="color:#111827;">Sąskaitų generavimas</strong> – patobulinta sąskaitų faktūrų logika ir naudojimasis jomis platformoje.',
    '<strong style="color:#111827;">Programėlė iš naršyklės (PWA)</strong> – galite naudotis Tutlio kaip programėle; instrukcija – skiltyje su nurodymais organizacijai.',
    '<strong style="color:#111827;">Tėvų paskyros prie mokinių</strong> – mokiniai gali turėti susietas tėvų paskyras, kad tėvai matytų tvarką ir susijusią informaciją.',
    '<strong style="color:#111827;">Atnaujintas dizainas</strong> – aiškesnė sąsaja administratoriams, mokytojams ir naudotojams telefone bei kompiuteryje.',
  ]);
  const outro =
    '<p style="margin:18px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">Jei reikia pagalbos diegiant naujoves – <a href="mailto:info@tutlio.lt" style="color:#4f46e5;font-weight:600;text-decoration:none;">info@tutlio.lt</a>. Pagarbiai, Tutlio komanda.</p>';
  const bodyHtml = wrapReleaseEmail(`##GREETING##${intro}${bullets}${outro}`);
  return { subject: RELEASE_EMAIL_SUBJECT, bodyHtml };
}

function buildBody(template: { bodyHtml: string }, recipient: Recipient): string {
  return template.bodyHtml.replace('##GREETING##', greetingLine());
}

function isResendRateLimitResponse(status: number, body: string): boolean {
  if (status === 429) return true;
  return status >= 500 && /too many requests|rate limit/i.test(body);
}

async function sendOne(
  endpoint: string,
  serviceKey: string,
  to: string,
  subject: string,
  bodyHtml: string,
): Promise<void> {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-key': serviceKey,
        },
        body: JSON.stringify({
          type: 'custom_html_announcement',
          to,
          data: { subject, bodyHtml },
        }),
      });
    } catch (e: unknown) {
      const cause = e && typeof e === 'object' && 'cause' in e ? (e as { cause?: { code?: string } }).cause : undefined;
      const code = cause?.code;
      if (code === 'ECONNREFUSED' || (e instanceof Error && /fetch failed/i.test(e.message))) {
        throw new Error(
          `Nepavyko prisijungti prie ${endpoint} (${code ?? 'network'}).\n` +
            `  • Jei naudojate localhost: paleiskite terminale \`npm run dev\` (Vite :3000 + API :3002), tada vėl paleiskite šį skriptą.\n` +
            `  • Arba .env nustatykite APP_URL=https://www.tutlio.lt (kur jau deploy’intas /api/send-email su custom_html_announcement).`,
          { cause: e },
        );
      }
      throw e;
    }
    if (res.ok) return;

    const text = await res.text().catch(() => '');
    if (isResendRateLimitResponse(res.status, text) && attempt < maxAttempts) {
      const waitMs = 1200 * 2 ** (attempt - 1);
      console.warn(`[release-letters] rate limit (${res.status}) → ${to}, laukiama ${waitMs}ms (${attempt}/${maxAttempts})`);
      await sleep(waitMs);
      continue;
    }
    const authHint =
      res.status === 401 || res.status === 403
        ? '\n  • 401/403: x-internal-key turi būti **identiškas** tam Supabase service role raktui, kurį turi Vercel (kur veikia APP_URL). Nustatykite RELEASE_SEND_X_INTERNAL_KEY su production raktu.'
        : '';
    throw new Error(`send-email ${to}: ${res.status} ${text}${authHint}`);
  }
}

async function main() {
  const audience = (getArg('audience') || 'all') as Audience;
  if (!['parents', 'tutors', 'admins', 'all'].includes(audience)) {
    throw new Error('--audience must be parents | tutors | admins | all');
  }

  const dryRun = hasFlag('dry-run') || !hasFlag('send');
  const onlyTo = getArg('only-to')?.trim() || null;
  const sendAllTestTemplates = hasFlag('send-all-test-templates');
  const exportDir = getArg('export-csv');
  const confirm = hasFlag('i-confirm-broadcast');
  const blocklist = loadReleaseBlocklist();

  const appUrl = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.tutlio.lt').replace(/\/$/, '');
  const endpoint = `${appUrl}/api/send-email`;

  /** Trys testiniai laiškai – nereikia Supabase DB (tik x-internal-key siuntimui). */
  if (onlyTo && sendAllTestTemplates) {
    const sendKey = getSendInternalKey();
    if (dryRun) {
      console.log('[release-letters] --send-all-test-templates: pridėkite --send ir paleiskite dar kartą.');
      return;
    }
    const tests: { label: string; tpl: ReturnType<typeof letterParents>; aud: Recipient['audience'] }[] = [
      { label: 'parents', tpl: letterParents(), aud: 'parents' },
      { label: 'tutors', tpl: letterTutors(), aud: 'tutors' },
      { label: 'admins', tpl: letterAdmins(), aud: 'admins' },
    ];
    for (const { label, tpl, aud } of tests) {
      const bodyHtml = buildBody(tpl, { email: onlyTo, fullName: 'Testas', audience: aud });
      await sendOne(endpoint, sendKey, onlyTo, tpl.subject, bodyHtml);
      console.log(`[release-letters] sent test template: ${label} → ${onlyTo}`);
    }
    return;
  }

  const supabaseUrl = getRecipientsSupabaseUrl();
  const dbServiceKey = getRecipientsServiceRoleKey();
  const sendKey = getSendInternalKey();

  const sb = createClient(supabaseUrl, dbServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (process.env.RELEASE_RECIPIENTS_SUPABASE_URL) {
    console.log('[release-letters] DB: RELEASE_RECIPIENTS_SUPABASE_URL (gavėjai iš atskiros aplinkos nei .env SUPABASE_URL)');
  }
  if (process.env.RELEASE_SEND_X_INTERNAL_KEY) {
    console.log('[release-letters] siuntimas: RELEASE_SEND_X_INTERNAL_KEY (x-internal-key ≠ galbūt DB service role)');
  }

  console.log('[release-letters] loading auth users map…');
  const authById = await listAllAuthUsers(sb);

  let parents: Recipient[] = [];
  let tutors: Recipient[] = [];
  let admins: Recipient[] = [];

  if (audience === 'parents' || audience === 'all') {
    parents = await collectParentsStudents(sb, authById);
    console.log(`[release-letters] parents/students+payers: ${parents.length}`);
  }
  if (audience === 'tutors' || audience === 'all') {
    tutors = await collectIndividualTutors(sb);
    console.log(`[release-letters] individual tutors: ${tutors.length}`);
  }
  if (audience === 'admins' || audience === 'all') {
    admins = await collectOrgAdmins(sb);
    console.log(`[release-letters] org admins: ${admins.length}`);
  }

  const bp = parents.length;
  const bt = tutors.length;
  const ba = admins.length;
  parents = filterBlocklist(parents, blocklist);
  tutors = filterBlocklist(tutors, blocklist);
  admins = filterBlocklist(admins, blocklist);
  const blocked = bp - parents.length + (bt - tutors.length) + (ba - admins.length);
  if (blocked > 0) console.log(`[release-letters] blocklist removed: ${blocked} (žr. DEFAULT_RELEASE_BLOCKLIST / RELEASE_LETTER_BLOCKLIST)`);

  if (audience === 'all') {
    const { parents: p2, tutors: t2, admins: a2, dropped } = dedupeAcrossAudiences(parents, tutors, admins);
    parents = p2;
    tutors = t2;
    admins = a2;
    if (dropped > 0) {
      console.log(
        `[release-letters] cross-audience dedupe: removed ${dropped} duplicate address(es) (priority: parents → tutors → org admins)`,
      );
    }
  }

  if (exportDir) {
    mkdirSync(exportDir, { recursive: true });
    const csv = (rows: Recipient[]) =>
      ['email,full_name,audience', ...rows.map((r) => `"${r.email}","${(r.fullName ?? '').replace(/"/g, '""')}",${r.audience}`)].join('\n');
    writeFileSync(join(exportDir, 'recipients_parents.csv'), csv(parents), 'utf8');
    writeFileSync(join(exportDir, 'recipients_tutors.csv'), csv(tutors), 'utf8');
    writeFileSync(join(exportDir, 'recipients_org_admins.csv'), csv(admins), 'utf8');
    console.log(`[release-letters] wrote CSVs to ${exportDir}`);
  }

  if (onlyTo) {
    const pick =
      audience === 'tutors' ? letterTutors() : audience === 'admins' ? letterAdmins() : letterParents();
    const aud: Recipient['audience'] =
      audience === 'tutors' ? 'tutors' : audience === 'admins' ? 'admins' : 'parents';
    const bodyHtml = buildBody(pick, { email: onlyTo, fullName: 'Testas', audience: aud });
    console.log(`[release-letters] only-to=${onlyTo} audience=${aud} dryRun=${dryRun}`);
    if (!dryRun) {
      await sendOne(endpoint, sendKey, onlyTo, pick.subject, bodyHtml);
      console.log('[release-letters] sent test');
    }
    return;
  }

  if (dryRun) {
    console.log('[release-letters] DRY RUN – nesiunčiama. Pašalinkite --dry-run ir pridėkite --send --i-confirm-broadcast siuntimui visiems.');
    for (const [label, arr] of [
      ['parents', parents],
      ['tutors', tutors],
      ['admins', admins],
    ] as const) {
      console.log(`--- ${label} (first 8) ---`);
      console.log(arr.slice(0, 8).map((r) => r.email).join('\n') || '(tuščia)');
    }
    return;
  }

  if (!confirm) {
    throw new Error('Siuntimui visiems reikia: --send --i-confirm-broadcast (be --only-to)');
  }

  const jobs: { rec: Recipient; subject: string; bodyHtml: string }[] = [];
  const tplP = letterParents();
  const tplT = letterTutors();
  const tplA = letterAdmins();
  for (const r of parents) jobs.push({ rec: r, subject: tplP.subject, bodyHtml: buildBody(tplP, r) });
  for (const r of tutors) jobs.push({ rec: r, subject: tplT.subject, bodyHtml: buildBody(tplT, r) });
  for (const r of admins) jobs.push({ rec: r, subject: tplA.subject, bodyHtml: buildBody(tplA, r) });

  console.log(
    `[release-letters] sending ${jobs.length} emails via ${endpoint} (max ${RESEND_SEND_BATCH_SIZE}/s + ${RESEND_PAUSE_MS_AFTER_BATCH}ms tarp partijų) …`,
  );
  let sent = 0;
  for (const batch of chunk(jobs, RESEND_SEND_BATCH_SIZE)) {
    await Promise.all(batch.map((j) => sendOne(endpoint, sendKey, j.rec.email, j.subject, j.bodyHtml)));
    sent += batch.length;
    console.log(`[release-letters] sent ${sent}/${jobs.length}`);
    if (sent < jobs.length) await sleep(RESEND_PAUSE_MS_AFTER_BATCH);
  }
  console.log('[release-letters] done');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
