import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const raw = readFileSync('.env', 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const login = await sb.auth.signInWithPassword({
  email: 'proklase.qa.student@tutlio.lt',
  password: 'TutlioQaDemo2026!',
});
if (login.error) {
  console.error('LOGIN_FAIL', login.error.message);
  process.exit(1);
}
const uid = login.data.user.id;
console.log('LOGIN_OK', uid);

const studentRpc = await sb.rpc('get_student_by_user_id', { p_user_id: uid });
console.log('get_student_by_user_id', studentRpc.error?.message ?? 'ok', studentRpc.data?.length);

const profiles = await sb.rpc('get_student_profiles', { p_user_id: uid, p_student_id: null });
console.log('get_student_profiles', profiles.error?.message ?? 'ok', profiles.data?.[0]?.full_name);

const prof = await sb.from('profiles').select('id,organization_id').eq('id', uid).maybeSingle();
console.log('profile', prof.data);
