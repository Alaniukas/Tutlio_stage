#!/usr/bin/env node
/**
 * QA seed for school consultations — Demo Mokykla only.
 * Usage: node scripts/seed-school-consultations-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const DEMO_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}
const supabase = createClient(url, key);

async function main() {
  const { data: org } = await supabase.from('organizations').select('features').eq('id', DEMO_ORG).single();
  const features = { ...(org?.features || {}), school_consultations: true, specialist_hourly_rate_eur: 40 };
  await supabase.from('organizations').update({ features }).eq('id', DEMO_ORG);

  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, payer_email')
    .eq('organization_id', DEMO_ORG)
    .limit(2);
  if (!students?.length) {
    console.warn('No demo students — run seed-qa-demo-orgs first');
    return;
  }
  for (const st of students) {
    await supabase.from('students').update({
      ppt_adapted: true,
      payer_email: 'alaniukasa@gmail.com',
    }).eq('id', st.id);
  }

  const studentId = students[0].id;
  const { data: contract } = await supabase
    .from('school_contracts')
    .select('id')
    .eq('student_id', studentId)
    .eq('kind', 'annual')
    .eq('signing_status', 'signed')
    .maybeSingle();

  if (contract) {
    await supabase.from('school_consultation_requests').upsert({
      organization_id: DEMO_ORG,
      student_id: studentId,
      topic: 'Matematikos konsultacija (QA)',
      status: 'awaiting_proposal',
      preferred_times: [{ note: 'Antradieniais po 15:00' }],
    }, { onConflict: 'id', ignoreDuplicates: true });
  }

  console.log('Demo consultations seed OK — enable flag school_consultations, PPT on students, sample request');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
