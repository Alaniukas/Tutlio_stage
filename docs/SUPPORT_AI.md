# Tutlio AI support widget

The global bottom-right support widget streams answers from `gpt-5.6-luna` and includes a Contact us sheet that emails the Tutlio team.

## Architecture

1. The browser sends the last 10 short chat messages, active locale, current page, an anonymous browser session ID, and an idempotent request ID to `/api/support-chat`.
2. A compact structured Luna call selects one of eight product areas, zero to three relevant public pages, and a conservative purchase-readiness boolean based on the user's latest message and short conversation context.
3. Page choices are restricted to the verified allowlist in `src/lib/supportPageSuggestions.ts`; the selector is instructed to return no pages when none directly help.
4. The final Luna call receives only shared facts plus the selected product area, then streams plain text to the widget.
5. The response exposes the selected page IDs and purchase-readiness signal in headers. The widget resolves page IDs to verified localized labels and URLs. When purchase readiness is true, it renders a localized “I want Tutlio” CTA whose app-controlled link points to the localized `/pricing` route. The model cannot invent CTA markup or a destination.
6. The API stores the user and assistant turns in the server-only `support_conversations` and `support_messages` tables, including the routed knowledge area, page IDs, model, and token usage.

This design does not send the whole product brain on every turn. The endpoint uses low reasoning effort, low verbosity, a bounded history, a 700-token output limit, no OpenAI response storage, and a privacy-preserving safety identifier.

## Product knowledge maintenance

Edit `api/_lib/supportKnowledge.ts` when product behavior changes. Keep knowledge user-facing:

- explain supported behavior and navigation;
- keep solo prices sourced from `src/lib/pricing.ts` and `src/lib/subscriptionPricing.ts`;
- keep agency/company/school self-service license bounds sourced from `api/_lib/enterprise-license.ts`, which shares the same configuration as `/pricing` and `/api/create-enterprise-checkout`;
- do not add secrets, internal admin credentials, customer-specific commercial rules, or private data;
- add routing keywords in English, Lithuanian, and Polish for common high-volume questions;
- when adding a new area, add it to `SUPPORT_AREA_IDS`, the knowledge array, and routing tests.

The final prompt requires the assistant to say when the selected knowledge does not establish an answer and direct the user to Contact us instead of guessing.

Starting with the first answer, Luna decides whether zero or one follow-up would materially improve the guidance. The default is to end naturally once the question is fully answered. A follow-up is allowed only when one missing detail would change the answer, clarify product fit, or unblock troubleshooting; it cannot be used merely to sustain engagement, collect leads, or push a purchase. Luna uses recent history to avoid repeated questions and skips them for thanks/goodbyes, explicit opt-outs, and support/security escalations. Generic “anything else?” prompts are prohibited.

Purchase readiness is separate from general interest. The structured selector turns the CTA on only for clear intent to buy, subscribe, or start checkout; general price exploration, feature questions, existing-customer support, complaints, and vague interest keep it off. The UI suppresses a duplicate pricing recommendation card whenever the stronger purchase CTA is visible.

Commercial purchase facts must describe the implemented checkout, not a sales assumption. The shared knowledge explicitly states that quantities inside the configured self-service range—including 10 licenses—are bought directly on `/pricing`; Contact us is reserved for above-cap quantities, tailored guidance, or checkout problems. A regression test in `tests/api/support-ai.test.ts` protects this rule.

Public page recommendations are maintained in `src/lib/supportPageSuggestions.ts`. Luna chooses from this compact allowlist for each user message, and the routing test verifies every choice resolves to a safe internal route.

## Contact flow

`/api/support-contact` stores each submission in `support_contact_requests`, emails `INTERNAL_NOTIFY_EMAILS` through Resend, and sets the visitor email as Reply-To. It includes the current page and up to six recent chat messages. The form has input limits, a honeypot, HTML escaping, idempotent request IDs, and an in-memory abuse limit.

Visitors may attach one PNG, JPEG, or WebP image up to 5 MB. `/api/support-attachment-upload-url` creates a two-hour signed upload token; the browser uploads directly to the private `support-attachments` bucket. The contact API verifies the stored object's path, MIME type, and size before recording it, then puts a seven-day private download link in the support email. The service-role key never reaches the browser.

Closing a non-empty widget opens a confirmation. Confirming clears messages, drafts, and the anonymous session from browser UI/storage, while `/api/support-chat-close` marks the server-side conversation closed so its private analytics history remains available.

The contact sheet states that Tutlio typically answers email within 15 minutes. The B2B WhatsApp support promise is kept in the shared agent knowledge rather than displayed as a form callout.

The widget artwork is the optimized transparent PNG at `public/support-ai-icon.png`.

The header and contact-card WhatsApp actions open `https://wa.me/37062394956` in a new tab.

## Configuration

Required server variables:

- `OPENAI_API_KEY` for AI answers;
- `RESEND_API_KEY` or `RESEND_API_KEY_STAGE` for the contact form;
- `FROM_EMAIL` for the sender identity.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` for private support persistence and signed image uploads.

Never expose the OpenAI or Resend key through a `VITE_` variable.

## Verification

```bash
npm run lint
npm run lint:api
npm test -- tests/api/support-ai.test.ts
npm run build
```
