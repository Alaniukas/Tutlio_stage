# In-app support context and isolation

The signed-in support agent uses three context layers.

## 1. Verified customer function scope

Every conversation turn resolves the user from the server-side Supabase session. The server then derives:

- active portal and role;
- exact organization when it is unambiguous;
- organization entity type;
- organization-admin permissions;
- enabled feature flags visible to that portal.

Only enabled, role-visible functions are placed in the model prompt. If a parent or student is linked to multiple organizations, only the common feature intersection is used and organization-specific knowledge is excluded.

## 2. Guidance from the running deployment

Every support turn includes the current feature registry and authorized guides from `api/_lib/inAppSupportKnowledgeDocuments.ts`. They are packaged with the API, so each deployment automatically refreshes this baseline without a webhook, embeddings or a database sync. Include user-facing locations, setup requirements and limits in a guide whenever behavior changes. Guides are filtered by portal, entity type, enabled feature and administrator permission, exactly like the account scope. Current deployed guidance takes priority over older vector excerpts and conversation memories; a resolved ticket does not establish release status.

The agent answers product usage and implemented-feature questions directly. It only asks intake questions when assembling a report, and stops diagnostic questioning when the user requests human review. Submission still requires the user's explicit send command.

## 3. Vector knowledge and conversation memory

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

The sync command is optional for refreshing semantic search after documentation changes; current deployed guidance is available even before that sync. Deeper customer-specific documentation may be inserted with an `organization_id`; it will only be retrievable for that exact organization.
