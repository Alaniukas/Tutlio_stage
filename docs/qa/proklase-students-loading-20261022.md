# Pro Klasė students loading, 2026-10-22

Status: diagnosis confirmed in production logs; frontend changes are local and undeployed. No production data or schema was changed for this loading issue. Release requires permission under AGENTS.md section 8.

## Confirmed incident

At 10:38 UTC / 13:38 Vilnius, ten authenticated requests returned HTTP 522. Pro Klasė's tutor relationships, profiles, admin IDs and organization defaults requests each spent about 19.7 seconds at the Supabase gateway. PostgreSQL recorded no statement-timeout errors in the investigated 10:25–10:45 UTC window. These were transport failures, separate from the earlier recurring-template SQL timeout and the subsequent Amanda data repair.

Cloudflare documents [522 as a connection timeout to the origin](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/), including a 19-second TCP connection deadline. The exact infrastructure trigger is not established by these logs.

The students loader awaited the failed tutor lookup, treated its errors as an empty tutor list, then awaited another student read and optional organization/package checks. That serial path explains a load approaching a minute. The background preloader could also cache an empty or partial roster after failed reads.

From 10:40 through 10:43 UTC, the inspected authenticated requests returned 200 with recorded origin durations of 0.1–0.3 seconds. Vercel's MCP log read was forbidden; the explicitly scoped CLI fallback succeeded and showed the package endpoint returning 200/304. Recovery occurred without a deployment.

Final verification found another ten HTTP 522 responses at 10:49 UTC / 13:49 Vilnius. The issue is intermittent; it must not be reported as permanently resolved. In the 10:48–10:55 window, all ten failures belonged to one client through Cloudflare VNO. The same window had 134 successful authenticated VNO reads, 44 successful TLL reads and 26 successful IAD reads. This points to an intermittent edge-to-origin connection path, but does not establish the underlying provider fault. The last successful authenticated read in this window was at 10:54:49 UTC.

At 10:55 UTC the database had 32 connections against a maximum of 90 and no lock waits. The long-lived active backend was a normal replication walsender. No non-invalid-UUID PostgreSQL errors appeared in the 10:47–10:55 window. Performance advisors showed the existing RLS/index advisories; there is no evidence here that changing those policies would address the 522 connection failures. The public Supabase status page separately mentioned EU Management API lifecycle errors; that is insufficient evidence to attribute this Data API incident to it.

Sanitized request evidence is in ignored `output/proklase-video-20261022/students-loading-evidence.json` and `students-loading-followup-evidence.json`. No API keys or bearer tokens are saved there. The local UI fix improves waiting/error behavior; it does not repair the provider's connection path.

## Local fix

- Limit the critical students load to 15 seconds; abort its reads on failure/timeout and ignore late or superseded results.
- Use a strict tutor read for this loader and the admin preloader. Required read failures become errors; unavailable legacy ID-only RPCs can still use the authorized relationship fallback.
- Preserve the current roster/cache after errors. Show a localized message and a retry button, including when no prior roster exists. Never publish partial students data from the preloader.
- Load tutor subject labels and Pro Klasė trial-followup badges in the background with independent deadlines. School contract/debt metadata remains part of a consistent critical snapshot.
- Reuse the authorized tutor names rather than embedding profile RLS once per student in both the page and preloader.
- Skip tutor-scoped pricing/subject reads when a detached student's card has no tutor; this also prevents the invalid empty UUID requests seen at 10:39.
- Translate the failure message in all 13 base locales.

## Validation

64 tests passed across 12 files: the new deadline, failure/retry, cache preservation, nonblocking enrichment and admin preload tests, plus existing tutor visibility, auth-session, parent-preload and all CompanyStudents page regressions. Tests use synthetic in-memory data. TypeScript and the production build passed; existing bundle-size and sourcemap warnings remain. `git diff --check` passed.

The unreleased UI has not been tested against a production browser session. No commit, push, deployment, email or schema migration was performed for this loading fix.
