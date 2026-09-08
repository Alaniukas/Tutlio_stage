# Recipient delivery investigation, 2026-09-08

The user authorized removing the reported parent's bounce suppression and sending one clearly labelled technical delivery test. The existing suppression was verified before removal. Resend confirmed deletion. Exactly one test was submitted with a fixed idempotency key.

The test was accepted at 11:00:09 UTC, but its subsequent provider event was **bounced**. Resend created a new bounce suppression at 11:00:11 UTC. Thus the mailbox problem remains unresolved. No repeated removal or resend was attempted. The provider's retrieved email metadata does not explain the underlying SMTP rejection. The recipient must confirm/correct the address or resolve the mailbox rejection before another attempt. The other parent's previously delivered reminders are unaffected.

Local implementation adds an on-demand address suppression check to the student's account section. It checks the saved student, payer and secondary-parent addresses, deduplicates them, and scopes access to the authenticated administrator's organization. The API accepts no arbitrary recipient, exposes no source message, performs no writes, and never removes suppressions. Provider errors show unknown, not healthy. An unblocked address is explicitly not presented as proof that an individual email was delivered. This is current suppression diagnosis, not a historical email delivery ledger.

No database migration is required. These application changes have not been deployed.
