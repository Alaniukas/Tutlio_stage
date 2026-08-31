# International locale scaffolding

Shared production-readiness follow-up: runtime-message repairs, multilingual notifications, accessible language selection and recovery from failed language downloads are documented in [Locale production readiness](LOCALE_PRODUCTION_READINESS.md). The selector label and two reload-safety labels bring each draft to 5,054 overrides; the counts below describe the original translation snapshots. The [runtime argument audit](LOCALE_ARGUMENT_AUDIT.md) now has zero unreviewed omissions in the statically covered calls. No new locale has been published.

Czech (`cs`, country `CZ`, formatting `cs-CZ`) now has a tutor/business draft with 5,051 explicit overrides, all 493 quiz entries, connected student/parent flows, emails, 72 public-booking labels and the shared page editor. Registration defaults to `+420`. Czech auth email templates and Checkout presentation are prepared locally. Czech is available in development selectors and direct URLs but remains unpublished. Dedicated school/admin and full legal policies retain English; no database, currency or billing changes were made. See [Czech localization review](CZECH_LOCALIZATION_REVIEW.md) for guide-based corrections, checks and release limits.

Greek (`el`, formatting `el-GR`, country `GR`) has a tutor/business draft with 5,051 explicit overrides, all 493 questionnaire keys, connected student/parent flows, email copy, 72 public-booking labels and the shared public-page editor. Registration defaults to Greece's `+30` prefix. Greek remains unpublished, with English fallback for dedicated school/admin modules and full legal policies. Currency, tax, payment and time-zone behavior are unchanged. See [Greek localization review](GREEK_LOCALIZATION_REVIEW.md) for supplied-guide corrections, checks and release limits.

Hungarian (`hu`, formatting `hu-HU`) has a tutor/business draft with 5,051 explicit overrides, all 493 quiz entries, connected student/parent flows, email copy and 72 public-booking labels. Registration defaults to Hungary's `+36` code. HU remains unpublished, with English fallback for dedicated school/admin modules and full policies; currencies, taxes and payment eligibility are unchanged. See [Hungarian localization review](HUNGARIAN_LOCALIZATION_REVIEW.md) for supplied-guide corrections, verification and release limits.

Slovak (`sk`, formatting `sk-SK`) has a tutor/business draft with 5,051 explicit overrides, all 493 quiz keys, connected student/parent flows, emails and 72 public-booking labels. Registration offers Slovakia's `+421` prefix and examples. A locale-only adapter fixes Saturday parsing in the installed date library. Slovak remains unpublished; dedicated school/admin/full-policy content keeps English. No payment, currency or database changes were made. See [Slovak localization review](SLOVAK_LOCALIZATION_REVIEW.md) for supplied-guide corrections, verification and release limits.

Thai (`th`, formatting `th-TH-u-ca-gregory`) has 5,051 tutor/business overrides, including all 493 assessment keys, related student/parent flows, emails and 72 public-booking labels. Registration defaults to Thailand's `+66`; Gregorian years are preserved. Thai remains unpublished with English fallback for dedicated school/admin/full-policy content. The local `20260831234518_add_thai_locale.sql` migration extends existing preference checks and was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31. See [Thai localization review](THAI_LOCALIZATION_REVIEW.md) for supplied-guide corrections, tests, browser checks and release limits. Use the locale registry for current counts while other locale work continues.

Bulgarian (`bg`, formatting `bg-BG`) has a tutor/business draft with 5,051 explicit overrides, all 493 quiz entries, related student/parent flows, email copy and 72 public-booking labels. Registration offers Bulgaria's `+359` code and Bulgarian phone examples; international validation and payment behavior are unchanged. BG remains unpublished with English fallback for dedicated school/admin modules and full legal policies. See [Bulgarian localization review](BULGARIAN_LOCALIZATION_REVIEW.md) for supplied-guide corrections, verification and release limits.

Turkish (`tr`, formatting `tr-TR`) has a tutor/business draft with 5,051 explicit overrides, all 493 onboarding-quiz entries, connected student/parent flows, emails and 72 public-booking labels. Registration defaults to `+90`. Turkish remains unpublished with English fallback for dedicated school/admin and full legal-policy content; currency, payment eligibility and account time zones are unchanged. See [Turkish localization review](TURKISH_LOCALIZATION_REVIEW.md) for supplied-guide corrections, verification and the applied preference migration.

Ukrainian (`uk`, shown as **UA**, formatting `uk-UA`) has a tutor/business translation draft covering 5,051 dictionary entries, connected student/parent flows, emails, the onboarding assessment and public booking. Registration defaults to Ukraine’s `+380` code. It remains unpublished; dedicated school/admin and full-policy text retain English. See [Ukrainian localization review](UKRAINIAN_LOCALIZATION_REVIEW.md) for the supplied-guide review, tests and applied preference migration.

Hebrew for Israel (`he`, formatting `he-IL-u-ca-gregory`) has 5,051 tutor/business overrides, including 493 quiz keys, related student/parent flows, emails and 72 public-booking labels. It includes RTL support, Sunday-first calendar bounds and Israeli `+972` registration examples. Hebrew remains unpublished; dedicated school/admin/full-policy content retains English. Currency, tax and payment eligibility are unchanged. See [Hebrew localization review](HEBREW_LOCALIZATION_REVIEW.md) for supplied-guide corrections, verification and release limits.

Hong Kong Traditional Chinese (`zh-hk`, formatting `zh-HK`) has a tutor/business draft with 5,051 explicit translations, including 493 assessment keys, connected student/parent flows, emails and public booking labels. Registration defaults to `+852`. The locale remains unpublished, with English fallback for dedicated school/admin and full legal-policy content; payments, currencies and account time zones are unchanged. See [Hong Kong localization review](HONG_KONG_LOCALIZATION_REVIEW.md) for guide-based corrections, verification and the applied preference migration. The locale registry is authoritative for current counts while further locales are being prepared.

Romanian (`ro`, formatting `ro-RO`) has a tutor/business translation draft with 5,051 explicit overrides, all 493 onboarding-quiz entries, connected student/parent flows, emails, support and public booking copy. Registration offers Romania's `+40` prefix and Romanian phone examples; international validation and payment behavior are unchanged. RO remains unpublished with English fallback for dedicated school/admin modules and full legal policies. See [Romanian localization review](ROMANIAN_LOCALIZATION_REVIEW.md) for the supplied-guide review, verification and release limitations.

European Portuguese (`pt`, formatting `pt-PT`) has a tutor/business translation draft with 5,051 overrides, all 493 onboarding quiz entries, connected student/parent flows, emails, public booking and page-editor copy. Registration defaults to Portugal's `+351`; international validation and payment behavior are unchanged. PT remains unpublished and retains English for dedicated admin/school and full-policy content. See [Portuguese localization review](PORTUGUESE_LOCALIZATION_REVIEW.md) for the supplied-guide review, verification and release limitations.

Japanese (`ja`, formatting `ja-JP`) has a tutor/business translation draft with 5,051 explicit overrides, connected student/parent flows, email and assessment copy, public booking labels and marketing text. It remains unpublished; dedicated school/admin and full legal-policy content retain English. Japanese payments, taxes, phone validation and visual/native-language release QA remain separate work. See [Japanese localization review](JAPANESE_LOCALIZATION_REVIEW.md) for coverage, guide-based review and verification limits.

Tutlio has 36 registered locales. The prepared website release exposes all 36 in production selectors on `.lt` and `.com`; the current deployed website retains the earlier 13 until that candidate is deployed. The `.pl` domain remains Polish-only. The 23 newer dictionaries still require native review and stay outside search publication. A locale option does not mean that payments, legal documents, tax handling or customer support are ready for that country. Follow [Locale production readiness](LOCALE_PRODUCTION_READINESS.md) for the remaining gates.

In the per-locale review snapshots below, “unpublished” now means withheld from search publication and from incomplete school/legal surfaces. It no longer means hidden from the prepared production UI selector.

Italian now has a tutor/business translation draft, including the connected student/parent flows, email copy and public pages. It remains unpublished and keeps English for admin, school-only and full legal-policy content. See [Italian localization review](ITALIAN_LOCALIZATION_REVIEW.md) for coverage, checks and release limitations.

Mexican Spanish (`es-mx`) also has a tutor/business translation draft, including the onboarding quiz, connected student/parent flows, email copy and public booking labels. It uses Mexican phone examples but does not change payment eligibility, currencies or tax handling. It remains unpublished with English fallback for the separate admin, school and full-policy content. See [Mexican Spanish localization review](MEXICAN_SPANISH_LOCALIZATION_REVIEW.md) for the supplied-guide review, verification and release limitations.

Brazilian Portuguese (`pt-br`) has a tutor/business translation draft, including all onboarding quiz copy, connected student/parent flows, email copy, public booking labels and marketing text. Brazilian phone examples and the registration default use `+55`; payment eligibility, currencies and tax handling are unchanged. It remains unpublished, with English fallback for separate admin, school and full-policy content. See [Brazilian Portuguese localization review](BRAZILIAN_PORTUGUESE_LOCALIZATION_REVIEW.md) for coverage, supplied-guide review, checks and release limitations.

Hindi (`hi`, formatting `hi-IN`) has a tutor/business translation draft with 5,051 explicit dictionary overrides, connected student/parent flows, email and quiz copy, plus public booking labels. It remains unpublished; dedicated school/admin and full legal-policy content retain English. Indian currency, payment eligibility, taxes and phone behavior are unchanged. See [Hindi localization review](HINDI_LOCALIZATION_REVIEW.md) for guide-based review, verification and release limits.

| Locale | Language | Initial market coverage |
| --- | --- | --- |
| `it` | Italian | Italy |
| `pt` | Portuguese | Portugal |
| `ro` | Romanian | Romania |
| `cs` | Czech | Czechia |
| `el` | Greek | Greece, Cyprus |
| `hu` | Hungarian | Hungary |
| `bg` | Bulgarian | Bulgaria |
| `hr` | Croatian | Croatia |
| `sk` | Slovak | Slovakia |
| `sl` | Slovenian | Slovenia |
| `hi` | Hindi | Hindi-speaking users in India; other Indian languages remain future work |
| `ko` | Korean | South Korea |
| `ja` | Japanese | Japan |
| `id` | Indonesian | Indonesia |
| `ar` | Arabic | Saudi Arabia, UAE and other Arabic-speaking users |
| `pt-br` | Brazilian Portuguese | Brazil |
| `es-mx` | Mexican Spanish | Mexico |
| `fil` | Filipino | Filipino-speaking users in the Philippines |

The existing `en` option serves English-speaking users, including the UK, US and Singapore. Country-specific English formatting is not added. Greek alone does not cover every language spoken in Cyprus, nor Hindi every language spoken in India. Filipino does not cover every language used in the Philippines.

Filipino (`fil`, formatting `fil-PH`) has 5,051 tutor/business dictionary overrides, the connected student/parent flows, emails, onboarding quiz, public booking copy, calendar formatting and Philippine `+63` registration examples. It remains unpublished with deferred admin/school/full-policy content. Payment and currency support are unchanged. See [Filipino localization review](FILIPINO_LOCALIZATION_REVIEW.md) for the supplied-guide audit, source-copy repairs, checks and release limitations.

## Translating later

Croatian (`hr`, formatting `hr-HR`) has 5,051 tutor/business overrides, including connected student/parent flows, dictionary-based emails and all 493 quiz keys. Public booking labels and Croatian phone examples are included. It remains unpublished, with dedicated school/admin modules and full policies on English fallback. See [Croatian localization review](CROATIAN_LOCALIZATION_REVIEW.md) for the supplied-guide review, verification and release limits.

Arabic (`ar`) now has a Modern Standard Arabic tutor/business draft, including connected student/parent flows, dictionary-based emails and public booking labels. Calendars, shared controls and email wrappers have foundational RTL support; lesson-date formatting explicitly stays Gregorian. Arabic remains unpublished and does not change country/payment eligibility or translate the dedicated school and full-policy content. See [Arabic localization review](ARABIC_LOCALIZATION_REVIEW.md) for coverage, verification and remaining release work.

Korean (`ko`, formatted as `ko-KR`) now has a tutor/business translation draft covering connected student/parent flows, emails, the onboarding assessment, marketing, and public booking labels. Registration offers South Korea's `+82` code and Korean phone examples. It remains unpublished, with English fallback for dedicated admin/school modules and full legal policies. See [Korean localization review](KOREAN_LOCALIZATION_REVIEW.md) for coverage, supplied-guide review, verification, and release limitations.

The registry is `src/lib/i18n/locales.ts`. Each new language has its own `src/lib/i18n/<locale>.ts` file, already connected to the browser's lazy loader and both server dictionaries. Add translated overrides after the English spread, for example:

```ts
import { en } from './en.js';

export const it: Record<string, string> = {
  ...en,
  'common.login': 'Accedi',
};
```

Keep the English fallback while translations are incomplete. Preserve translation keys, interpolation placeholders and intended HTML markup. Regional files export `ptBr` and `esMx`; all other new files export their locale code. Date formatting and native names are configured separately in the registry and `src/lib/i18n/index.ts`.

Static marketing metadata, demo personas, images, support follow-up copy and other text outside the dictionaries also use English defaults. Review these separately before claiming a fully localized launch. Arabic sets document direction to RTL, but calendars, tables, forms, embedded widgets, exports and email layouts still need a full RTL review with actual translations.

## URLs and indexing

Examples: `/it`, `/ar/pricing`, `/pt-br/login`, `/es-mx/company/login` on the international domain. Existing `.lt` and `.pl` market behavior remains unchanged; `.pl` stays Polish-only.

`SUPPORTED_LOCALES` drives URL and translation-code validation. `PENDING_TRANSLATION_LOCALES` tracks the 23 additions that still need native review; it is not a UI visibility list. Production selectors and search publication are controlled separately in `src/lib/i18n/localeRelease.ts`. All 36 are UI-released in the prepared candidate, while the 23 additions remain `noindex, follow` and excluded from sitemap, hreflang and IndexNow publication.

`LEGACY_LOCALES` and its deprecated `TRANSLATED_LOCALES` alias retain the original 13-language baseline. Do not edit them to publish or withhold a language. `UI_RELEASED_LOCALES` contains all 36, while per-surface SEO lists and `BLOG_SCHEMA_LOCALES` remain independent. New-locale blog requests use English content/slug fallbacks; no new blog columns are queried or created. UI publication does not require blog publication; adding blog support requires the corresponding database columns and reviewed content.

## Persistence and release

`supabase/migrations/20260831234119_add_international_locale_scaffolding.sql` expands the `preferred_locale` constraints on `profiles` and `organizations` to all 30 values. It does not change user records or RLS policies. It was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31.

The subsequent `supabase/migrations/20260831234451_add_filipino_locale.sql` adds `fil` to those constraints, bringing the allowed set to 31 values. It was applied in the same production migration sequence.

Five later migrations add Hebrew, Ukrainian, Hong Kong Chinese, Turkish and Thai, bringing the registered set to 36. All seven migrations and the read-only database preflight are listed in [Locale production readiness](LOCALE_PRODUCTION_READINESS.md). All seven are installed and both preference checks accept all 36 codes. Authenticated profile and organization-admin round trips passed all 36 values and rejected an invalid value. Both hosted signup/recovery template pairs are installed and verified after reopening; bodies cover all 36 locales, while subjects use LT/PL with English fallback because of the hosted 255-character limit. Authorized Lithuanian recovery and Hebrew confirmation delivery succeeded. Native review, the callback-fix deployment and post-deployment testing remain required. The all-36 UI flag is prepared locally; no website deployment or commit has been performed.

Currencies, pricing, Stripe/Connect eligibility, country onboarding, tax rules, time zones and school-specific integrations are unchanged. These require separate market-readiness work.
