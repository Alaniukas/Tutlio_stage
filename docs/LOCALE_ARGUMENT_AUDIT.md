# Locale runtime argument audit

Audited 363 translation keys used in literal calls with inline parameter objects across 36 locales. **0 keys have unreviewed missing arguments.**

This is a static check, not a release approval. Dynamic keys, spread parameters and translation aliases are not covered. Dedicated school/admin/legal fallbacks remain outside the tutor/business release scope. Regenerate with `npm run locales:audit -- docs/LOCALE_ARGUMENT_AUDIT.md`; CI runs `npm run locales:audit -- --check`.

## Reviewed variation

`em.packageSuccessBody` embeds the lesson noun/counter in 32 locales (en, pl, lv, ee, fr, es, de, dk, no, th, tr, zh-hk, it, pt, ro, cs, el, hu, bg, hr, sk, sl, hi, ko, ja, id, ar, pt-br, es-mx, fil, he, uk), so its `label` argument is intentionally unused there. Count and subject remain mandatory. This exception is limited to those specific locales and that single parameter.

## Repairs and caller decisions

The original 61-key inventory was reviewed against actual callers. Names, amounts, counts, cancellation windows, registration and payment deadlines, trial details and schedule times now render. Weekly availability no longer says “every day”. The organization lock notice explains who controls settings. Payment reminders now include complete sentences and an explicit tutor row; organization deadline warnings include the actual deadline.

Unused parameters were removed from complete action labels and messages whose details appear separately. Raw backend errors are deliberately excluded from generic user-facing errors; they were not appended to translations to satisfy this check. Manual package instructions no longer repeat a second heading; amount and organization remain in the existing body/table.

## Unreviewed omissions

None in the statically covered calls.
