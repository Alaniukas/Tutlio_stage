## Prod Sync Context

### What We Are Doing
- Aligning production DB schema with current `main` migrations without running a full destructive `schema.sql`.
- Applying migrations in controlled sync blocks (`00` to `04`) plus the `20260428112000` hotfix.
- Investigating why `org_admin` login still hangs in prod after security/RLS hardening.

### Main Problem We Are Solving
- `org_admin` login in prod gets stuck (infinite loading).
- Browser console shows `500` and `infinite recursion detected in policy for relation "profiles"` (and previously `organization_admins`).
- This indicates production policy/function state still differs from expected `main` migration end-state.

### Why Not Full `schema.sql`
- Full schema replay is riskier in a live environment (can overwrite grants/policies/order unexpectedly).
- Migration-based sync preserves intended evolution and is easier to debug step-by-step.

### Current Prod Drift Findings
- Prod `supabase_migrations.schema_migrations` ends at `20260413120000`.
- Local `main` includes later migrations up to `20260428112000`.
- Missing legacy tables (`public.schools`, `public.school_admins`) caused `block_01` to fail in some prod states.

### Files Prepared
- Combined SQL bundle: `supabase/prod_sync_blocks_00_04_combined.sql`
  - Includes:
    - `prod_sync_block_00_preflight.sql`
    - `prod_sync_block_01_20260415120000_20260421000001.sql`
    - `prod_sync_block_02_20260424130000_20260426230000.sql`
    - `prod_sync_block_03_20260427123000_20260427193041.sql`
    - `prod_sync_block_04_20260427200000_20260428112000.sql`
    - `migrations/20260428112000_hotfix_disable_org_admins_coadmin_policy.sql`
- This summary: `supabase/PROD_SYNC_CONTEXT_SUMMARY.md`

### Practical Note
- If `block_01` fails with `relation "public.schools" does not exist`, run a minimal legacy stub for `schools` + `school_admins` first, then continue.

### Next Debug Step (After Sync)
- Re-check active `profiles` and `organization_admins` policies/functions in prod.
- Identify and remove remaining recursive policy conditions (especially those indirectly querying protected tables inside policy predicates).
