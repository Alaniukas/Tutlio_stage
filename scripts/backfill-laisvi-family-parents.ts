/**
 * Backfill Laisvi vaikai registered parents: link payer siblings + family guardians.
 *
 * Usage: node --import tsx scripts/backfill-laisvi-family-parents.ts
 * Requires .env with VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  linkSchoolParentToStudentIds,
  listActiveSchoolStudentsByPayerEmail,
  loadSchoolOrganization,
} from '../api/_lib/schoolParentSiblingLink.js';

const LAISVI_ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const db = createClient(url, key);
  const org = await loadSchoolOrganization(db, LAISVI_ORG_ID);
  if (!org) throw new Error('Organization not found');

  const { data: parents, error } = await db
    .from('parent_profiles')
    .select('id, user_id, email, parent_students!inner(student_id, students!inner(organization_id, detached_at))')
    .eq('parent_students.students.organization_id', LAISVI_ORG_ID)
    .is('parent_students.students.detached_at', null);
  if (error) throw error;

  const seen = new Set<string>();
  let linkedParents = 0;
  let totalStudentLinks = 0;
  let guardiansBound = 0;

  for (const parent of parents || []) {
    const userId = parent.user_id as string;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);

    const email = String(parent.email || '').trim().toLowerCase();
    if (!email.includes('@')) {
      console.warn(`Skip ${userId}: invalid email`);
      continue;
    }

    const siblings = await listActiveSchoolStudentsByPayerEmail(db, LAISVI_ORG_ID, email);
    const studentIds = siblings.map((row) => row.id);
    if (!studentIds.length) {
      console.warn(`Skip ${email}: no active payer students`);
      continue;
    }

    const primaryStudentId = studentIds[0];
    const beforeGuardians = await db
      .from('school_family_guardians')
      .select('student_id')
      .eq('organization_id', LAISVI_ORG_ID)
      .eq('guardian_user_id', userId);
    if (beforeGuardians.error) throw beforeGuardians.error;
    const beforeCount = (beforeGuardians.data || []).length;

    const linked = await linkSchoolParentToStudentIds(db, {
      orgId: LAISVI_ORG_ID,
      orgFeatures: org.features,
      parentProfileId: parent.id,
      userId,
      parentEmail: email,
      studentIds,
      primaryStudentId,
    });

    const afterGuardians = await db
      .from('school_family_guardians')
      .select('student_id')
      .eq('organization_id', LAISVI_ORG_ID)
      .eq('guardian_user_id', userId);
    if (afterGuardians.error) throw afterGuardians.error;
    const afterCount = (afterGuardians.data || []).length;

    linkedParents += 1;
    totalStudentLinks += linked.length;
    guardiansBound += Math.max(0, afterCount - beforeCount);
    console.log(`${email}: ${linked.length} student link(s), guardians +${afterCount - beforeCount}`);
  }

  console.log(`Done. Parents=${linkedParents}, studentLinks=${totalStudentLinks}, newGuardians=${guardiansBound}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
