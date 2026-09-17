# In-app support context and isolation

The signed-in support agent uses two context layers.

## 1. Verified customer function scope

Every conversation turn resolves the user from the server-side Supabase session. The server then derives:

- active portal and role;
- exact organization when it is unambiguous;
- organization entity type;
- organization-admin permissions;
- enabled feature flags visible to that portal.

Only enabled, role-visible functions are placed in the model prompt. If a parent or student is linked to multiple organizations, only the common feature intersection is used and organization-specific knowledge is excluded.

## 2. Vector knowledge and conversation memory

Migration `20260917200000_in_app_support_vector_context.sql` creates:

- `in_app_support_knowledge` for function documentation;
- `in_app_support_memory` for 30-day conversation memory;
- `match_in_app_support_knowledge` and `match_in_app_support_memory` RPCs.

The RPCs apply authorization filters before cosine-similarity ranking. Knowledge is filtered by portal, entity type, organization, enabled feature IDs, and admin permissions. Memory is filtered by exact user ID, conversation ID, and organization scope. Both tables are server-only and have no authenticated-user RLS policy.

Recent transcript messages remain in the prompt. Vector memory supplements them with a few semantically relevant older details, rather than replacing the recent transcript.

## Rollout

1. Apply the Supabase migration using the normal reviewed migration process.
2. Populate or refresh global function documentation:

   ```bash
   npm run support:sync-knowledge
   ```

   Set `ENV_FILE` when a specific environment file is required.
3. Deploy the API and frontend together. The API fails closed to verified baseline context if vector tables or embeddings are temporarily unavailable.

Run the sync command after changing feature behavior in `src/lib/featureRegistry.ts`. Deeper customer-specific documentation may be inserted with an `organization_id`; it will only be retrievable for that exact organization.
