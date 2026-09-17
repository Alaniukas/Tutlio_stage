/**
 * Split a legacy Pro Klasė login shared by a parent and child.
 *
 * Dry run (default):
 *   node scripts/migrate-proklase-shared-family-login.mjs --email parent@example.com --student-id <uuid>
 *
 * Apply only after the dry-run output is reviewed:
 *   node scripts/migrate-proklase-shared-family-login.mjs --email parent@example.com --student-id <uuid> --apply
 *
 * The students row is retained. The existing Auth user becomes the parent and
 * a new `pk-xxxx-xxxx` username account is linked to that same student row.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PRO_KLASE_ORG_ID = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
const LOGIN_DOMAIN = 'student-login.tutlio.invalid';
const LOGIN_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function loadEnv() {
  const loaded = {};
  for (const name of ['.env.local', '.env']) {
    Object.assign(loaded, readEnvFile(path.resolve(process.cwd(), name)));
  }
  return { ...loaded, ...process.env };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function randomValue(chars, length) {
  let value = '';
  for (let index = 0; index < length; index += 1) value += chars[randomInt(chars.length)];
  return value;
}

function generateLoginName() {
  const value = randomValue(LOGIN_CHARS, 8);
  return `pk-${value.slice(0, 4)}-${value.slice(4)}`;
}

function generatePassword() {
  return randomValue(PASSWORD_CHARS, 18);
}

function withoutStudentMetadata(raw) {
  const value = { ...(raw || {}) };
  delete value.student_id;
  delete value.student_login_name;
  delete value.student_contact_email;
  return value;
}

async function countRows(sb, table, studentId) {
  const result = await sb.from(table).select('*', { count: 'exact', head: true }).eq('student_id', studentId);
  return result.error ? null : result.count;
}

const email = argValue('--email').toLowerCase();
const studentId = argValue('--student-id');
const apply = process.argv.includes('--apply');
if (!email.includes('@') || !studentId) {
  throw new Error('Provide --email and --student-id. The command is a dry run unless --apply is present.');
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase URL or service role key in .env.local.');

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: student, error: studentError } = await sb
  .from('students')
  .select('id, full_name, email, payer_name, payer_email, organization_id, linked_user_id, parent_user_id, payment_payer, detached_at')
  .eq('id', studentId)
  .maybeSingle();
if (studentError || !student) throw studentError || new Error('Student not found.');
if (student.organization_id !== PRO_KLASE_ORG_ID) throw new Error('Student is not in the production Pro Klasė organization.');
if (student.detached_at) throw new Error('Student is detached.');
if (String(student.payer_email || '').trim().toLowerCase() !== email) {
  throw new Error('The supplied email does not match students.payer_email.');
}

const authLookup = await sb.rpc('get_auth_user_id_by_email', { p_email: email });
const parentUserId = typeof authLookup.data === 'string' ? authLookup.data : null;
if (!parentUserId) throw new Error('Auth user not found for the supplied email.');

if (student.parent_user_id === parentUserId && student.linked_user_id !== parentUserId) {
  const existingChild = await sb.auth.admin.getUserById(student.linked_user_id);
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    status: 'already_migrated',
    studentId,
    parentUserId,
    childLogin: existingChild.data.user?.app_metadata?.student_login_name || null,
  }, null, 2));
  process.exit(0);
}

if (student.linked_user_id !== parentUserId) {
  throw new Error('The supplied email Auth user is not the student\'s current linked_user_id.');
}

const authResult = await sb.auth.admin.getUserById(parentUserId);
const parentAuth = authResult.data.user;
if (authResult.error || !parentAuth) throw authResult.error || new Error('Current Auth user not found.');
if (String(parentAuth.email || '').trim().toLowerCase() !== email) throw new Error('Auth email mismatch.');

const [sessions, packages, recurring, parentProfiles] = await Promise.all([
  countRows(sb, 'sessions', studentId),
  countRows(sb, 'lesson_packages', studentId),
  countRows(sb, 'recurring_individual_sessions', studentId),
  sb.from('parent_profiles').select('id').eq('user_id', parentUserId),
]);

const plan = {
  mode: apply ? 'apply' : 'dry-run',
  supabaseHost: new URL(url).host,
  studentId,
  studentName: student.full_name,
  parentEmail: email,
  currentAuthRole: parentAuth.user_metadata?.role || null,
  currentParentProfiles: parentProfiles.data?.length || 0,
  retainedStudentData: { sessions, lessonPackages: packages, recurringSchedules: recurring },
  changes: [
    'Keep the existing students row and all rows linked by student_id',
    'Turn the existing email login into the parent account without changing its password',
    'Create a separate pk-xxxx-xxxx username account for the child',
    'Link the parent and child accounts to the same existing students row',
    'Clear the parent email from students.email and keep it in students.payer_email',
  ],
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const parentName = String(student.payer_name || '').trim();
if (!parentName) throw new Error('students.payer_name is required before applying the migration.');

let childLogin = '';
let childPassword = '';
let childUserId = '';
for (let attempt = 0; attempt < 5; attempt += 1) {
  childLogin = generateLoginName();
  childPassword = generatePassword();
  const created = await sb.auth.admin.createUser({
    email: `${childLogin}@${LOGIN_DOMAIN}`,
    password: childPassword,
    email_confirm: true,
    user_metadata: { role: 'student', full_name: student.full_name },
    app_metadata: {
      provisioned_by_organization: PRO_KLASE_ORG_ID,
      student_login_name: childLogin,
      student_contact_email: email,
    },
  });
  if (!created.error && created.data.user) {
    childUserId = created.data.user.id;
    break;
  }
  if (created.error?.code !== 'email_exists') throw created.error;
}
if (!childUserId) throw new Error('Could not allocate a unique child username.');

try {
  const childProfile = await sb.from('profiles').upsert({
    id: childUserId,
    email: null,
    full_name: student.full_name,
    organization_id: null,
  }, { onConflict: 'id' });
  if (childProfile.error) throw childProfile.error;

  const parentProfile = await sb.from('parent_profiles').upsert({
    user_id: parentUserId,
    full_name: parentName,
    email,
  }, { onConflict: 'user_id' }).select('id').single();
  if (parentProfile.error || !parentProfile.data) throw parentProfile.error || new Error('Parent profile creation failed.');

  const parentLink = await sb.from('parent_students').upsert({
    parent_id: parentProfile.data.id,
    student_id: studentId,
  }, { onConflict: 'parent_id,student_id' });
  if (parentLink.error) throw parentLink.error;

  const parentAuthUpdate = await sb.auth.admin.updateUserById(parentUserId, {
    user_metadata: {
      ...withoutStudentMetadata(parentAuth.user_metadata),
      role: 'parent',
      full_name: parentName,
    },
    app_metadata: withoutStudentMetadata(parentAuth.app_metadata),
  });
  if (parentAuthUpdate.error) throw parentAuthUpdate.error;

  const studentUpdate = await sb.from('students').update({
    linked_user_id: childUserId,
    parent_user_id: parentUserId,
    email: null,
    payer_name: parentName,
    payer_email: email,
    payment_payer: 'parent',
  }).eq('id', studentId).eq('linked_user_id', parentUserId).select('id').single();
  if (studentUpdate.error || !studentUpdate.data) throw studentUpdate.error || new Error('Student relink failed.');

  const existingParticipants = await sb.from('chat_participants').select(
    'conversation_id, last_read_at, email_notify_enabled, email_notify_delay_hours',
  ).eq('user_id', parentUserId);
  for (const participant of existingParticipants.data || []) {
    const cloned = await sb.from('chat_participants').upsert({
      conversation_id: participant.conversation_id,
      user_id: childUserId,
      last_read_at: participant.last_read_at,
      email_notify_enabled: false,
      email_notify_delay_hours: participant.email_notify_delay_hours,
    }, { onConflict: 'conversation_id,user_id' });
    if (cloned.error) throw cloned.error;
  }
} catch (error) {
  console.error('Migration stopped after creating the child Auth user.', {
    childUserId,
    childLogin,
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}

const verification = await sb.from('students')
  .select('id, linked_user_id, parent_user_id, email, payer_email')
  .eq('id', studentId)
  .single();
if (verification.error) throw verification.error;

console.log(JSON.stringify({
  ...plan,
  status: 'migrated',
  childCredentials: { login: childLogin, password: childPassword },
  verification: verification.data,
}, null, 2));
