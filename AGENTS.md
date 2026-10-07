# Tutlio — agentų vadovas

Šis dokumentas skirtas AI agentams ir naujiems kūrėjams. Tikslas — per kelias minutes suprasti projekto architektūrą, srautus ir kur ieškoti kodo.

**Produktas:** Tutlio — korepetitorių ir ugdymo organizacijų (mokyklų) valdymo SaaS platforma.  
**Įmonė:** MB Tutlio (Lietuva).  
**Produkcija:** https://tutlio.lt · https://tutlio.pl · https://tutlio.com

---

## 1. Kas tai yra

Tutlio apima:

| Segmentas | Kas naudoja | Pagrindinės funkcijos |
|-----------|-------------|------------------------|
| **Solo korepetitoriai** | Individualūs tutor'iai | Kalendorius, mokiniai, pamokos, Stripe mokėjimai, prenumerata |
| **Organizacijos (company)** | Org adminai | Keli tutor'iai, statistika, finansai, komisijos |
| **Mokyklos (school)** | Mokyklų adminai | Metinės sutartys, papildomų pamokų sutartys (click-wrap), klasės grupės, įmokos, e-parašas (GoSign), buhalterijos eksportas |
| **Mokiniai** | Student portal | Pamokų užsakymas, mokėjimai, istorija |
| **Tėvai** | Parent portal | Vaikų pamokos, sąskaitos, žinutės |
| **Platformos admin** | Tutlio komanda | Org valdymas, feature flag'ai, billing, blog |

**Svarbu:** Mokyklos ir company dalijasi tuos pačius React komponentus (`src/pages/company/`). Skirtumas — `organizations.entity_type`: `'school'` | `'company'`.

---

## 2. Technologijų stack

| Sluoksnis | Technologija |
|-----------|--------------|
| Frontend | React 19 + TypeScript + Vite 6 |
| Stilius | Tailwind CSS 4 + shadcn/ui (Radix) |
| Backend | Vercel serverless funkcijos (`api/*.ts`) |
| DB / Auth / Storage | Supabase (PostgreSQL + RLS) |
| Mokėjimai | Stripe (+ Stripe Connect), PerlasFinance (LT) |
| El. paštas | Resend |
| Sutarčių PDF | docxtemplater + DOCX→PDF converter (Railway) |
| E-parašas | GoSign (Registrų centras OneSign SOAP) |
| Excel eksportas | exceljs |
| Testai | Vitest + jsdom |
| Deploy | Vercel (projektas `tutlio`, scope `alaniukas-projects`) |

**Node:** `>=20 <25`

---

## 3. Projekto struktūra

```
Tutlio_stage/
├── api/                      # Vercel serverless API (~130 endpointų)
│   └── _lib/                 # Bendri helperiai (auth, stripe, school, i18n…)
├── src/
│   ├── App.tsx               # Visi maršrutai
│   ├── components/           # UI komponentai + route guard'ai
│   ├── pages/                # Puslapiai pagal rolę
│   │   └── company/          # Org + school admin UI (bendras)
│   ├── hooks/                # React hook'ai
│   ├── lib/                  # Verslo logika, i18n, stripe, export…
│   └── contexts/             # User, Locale, OrgEntity, Branding…
├── supabase/
│   └── migrations/           # ~217 SQL migracijų
├── scripts/                  # Dev, seed, stripe setup, email siuntimas
├── services/
│   └── docx-converter/       # LibreOffice microservice (Docker/Railway)
├── tests/                    # Vitest testai
├── docs/                     # Papildoma dokumentacija
├── public/                   # Statiniai failai, PWA manifest
├── vercel.json               # Deploy, cron, rewrite, CSP
├── middleware.ts             # Bot SSR (SEO puslapiai)
├── package.json
├── .env.example              # Visi env kintamieji (šablonas)
└── README.md                 # Trumpas žmogaus README
```

---

## 4. Vartotojų rolės ir maršrutai

Maršrutai apibrėžti `src/App.tsx`.

| Rolė | Login | Pagrindiniai keliai | Guard |
|------|-------|---------------------|-------|
| Tutor | `/login` | `/dashboard`, `/calendar`, `/students`, `/finance`… | `ProtectedRoute` |
| Student | `/login` | `/student/*` | `StudentProtectedRoute` |
| Parent | `/login`, `/parent-register` | `/parent/*` | `ParentProtectedRoute` |
| Org admin | `/company/login` | `/company/*` | `CompanyProtectedRoute` |
| School admin | `/school/login` | `/school/*` (tie patys komponentai) | `CompanyProtectedRoute` |
| Platform admin | `/admin` | Viena admin panelė | `ADMIN_SECRET` |

**Portalų nustatymas:** `src/lib/account-portal.ts` — pagal `organization_admins`, `students`, `parent_profiles`, `profiles`.

**Org mokėjimų suvestinė:** `/company/payments` (`CompanyPaymentReport.tsx`), meniu „Mokėjimai“, teisė `finance.view`. `GET /api/company-payment-report` organizaciją ima tik iš autentifikuoto administratoriaus. Sąskaitos, paketai ir atskiri mokėjimai sujungiami pagal jų ryšius, ne pagal mokėtojo el. paštą; mokytojų atlygio sąskaitos neįtraukiamos. Laikotarpis pagal išrašymo / užsakymo arba apmokėjimo datą, papildomi tipo / būsenos / korepetitoriaus / paieškos filtrai. Excel ir CSV eksportuoja visas filtrą atitinkančias eilutes. Mokinio pamokų skaičiai, pirmoji pamoka, bandomosios ir pirmo paketo apmokėjimas apima visą istoriją (`companyPaymentReport.ts`). Neišsaugotos apmokėjimo datos lieka tuščios.

### School maršrutai (svarbiausi)

| Kelias | Komponentas | Paskirtis |
|--------|-------------|-----------|
| `/school` (Apžvalga) | `SchoolDashboard.tsx` | 4 KPI kortelės (šiandien / artimiausi / įvyko / nepatvirtintas lankomumas), admin veiksmų eilė, sutarčių be patvirtinimo įspėjimai, tvarkaraštis + sujungta „Reikia dėmesio“ (lankomumas + neįvykę), sutartys/mokėjimai tik kaip žymės jei yra laukiančių; „Kas vyksta sistemoje“ suskleista. Laisvi vaikai rodo trumpesnius sąrašus (5 eil.). Detalūs mėnesio rodikliai → `/school/stats` (`CompanyStats` school view): lankomumas + **mokytojų atlygis vieną kartą už pravestą užsiėmimą** (`sumSchoolTutorPayEur`), ne už vaikų eilutes |
| `/school/contracts` | `CompanyContracts.tsx` | Metinės sutartys + extra-lessons pasiūlymas (flag) |
| `/school/students` | `CompanyStudents.tsx` | Mokinių CRUD, enrollment filtrai, extra-lessons offer |
| `/school/groups` | `CompanyClassGroups.tsx` | Klasės grupės: kortelė / **Redaguoti** → `ClassGroupFormDialog` (info + nariai + **Ištrinti** adminui). Keli savaitės slotai su **skirtinga diena ir starto laiku**. Adminui sąrašas skaidomas **pagal mokytoją** (filtras + paieška). Išsaugojus pamokos materializuojamos **iš karto** (ne tik cron) |
| `/school/recordings` | `CompanyLessonRecordings.tsx` → `SchoolLessonRecordings.tsx` | Privatūs grupių ir individualių pasikartojančių pamokų Drive įrašai: adminas grupei arba aktyvaus individualaus dalyko auditorijai priskiria aplanką, o adminas / mokytojas / susiję mokiniai / jų tėvai žiūri per autorizuotą Tutlio `Range` proxy. Nav rodomas tik su `school_lesson_recordings` flag (Demo = false). |
| `/school/finance?tab=payments` | `CompanyPayments.tsx` | Įmokų grafikai, mokėjimo nuorodos |
| `/school/finance?tab=report` | `CompanySchoolFinanceReport.tsx` | Suvestinė buhalterijai, filtrai, XLSX |
| `/school/finance` | `CompanyFinanceHub.tsx` | Tab hub (Mokėjimai / Suvestinė / Finansai / Sąskaitos) |

**Vieši school flow:**
- `/school-sign` — tėvų (metinės sutarties) pasirašymas
- `/school-contract-complete` — sutarties užbaigimas po pasirašymo
- `/school-extra-lessons-accept` — tėvų click-wrap papildomų pamokų sutarčiai (`SchoolExtraLessonsAccept.tsx`)
- `/school-homework?student=&t=` — tėvų namų darbų / medžiagos puslapis be paskyros (`SchoolHomework.tsx`, HMAC nuoroda iš laiškų)
- `/api/pay-school-monthly-invoice?invoice=&t=` — mėnesio sąskaitos apmokėjimas iš laiško (Stripe Checkout, be paskyros)

**Lokalūs UI preview (ne produkcija):** `/preview/assign-student-modal`, `/preview/complimentary-lesson` — SPA maršrutai tik `import.meta.env.DEV`. Fake duomenys, be auth. Atskiri `preview-*.html` entry **nebėra** — `vite.config.ts` prod buildina tik `index.html`.

**Vieši marketingo maršrutai:**
- `/` — numatytasis **korepetitorių agentūrų (B2B)** landing (`Landing.tsx` → `NewLanding audience="biz"`), su „Didysis skirtumas“ sekcija (`CustomizationSection.tsx`, anonimizuoti klientų pavyzdžiai). Hero **be** auditorijos pasirinkimo ir be badge
- `/for-tutors` — **individualių korepetitorių (B2C)** landing (`NewLanding audience="solo"`). Botams: `api/page-render.ts` (`page=landing` / `page=for-tutors`); SEO meta `seoMeta.ts` (`landing` / `forTutors`). Kalendoriaus kortelė naudoja `CalendarMockup.tsx`, ne screenshot'ą
- `/schools` — **internetinių mokyklų** landing (`SchoolsLanding.tsx`), turintis atskirus tekstus, DUK ir kontaktų CTA; botams `api/schools-render.ts`. Visus tris puslapius jungia navbar/footer „Sprendimai“, o navbar rodo pasirinktą variantą. „Palyginimas“ nuoroda yra tik footer'yje.
- Marketingo tekstuose **nenaudojami em-dash** (—), tik „-“ (`tests/lib/marketing-copy-style.test.ts`)
- `/compare`, `/compare/:competitor` — konkurentų palyginimai (TutorBird, TutorCruncher, Teachworks, Oases Online). Konfigūracija `src/lib/comparisonPages.ts`, SPA `ComparePage.tsx` / `CompareIndexPage.tsx`, botams `api/compare-render.ts`. Indeksuojama tik en/lt/pl (`SEO_LOCALES_BY_SURFACE.compare`); konkurentų faktai iš viešų svetainių, data `COMPARE_REVIEWED_ON`
- `/quiz`, `/quiz/:audience/:step` (+ `/:locale/quiz/…`) — tutor quiz funnel (`QuizFunnel.tsx`)
- Prenumeratos checkout puslapyje `/pricing` — įterptas Stripe Embedded Checkout (`EmbeddedSubscriptionCheckoutDialog.tsx`)
- Viešas **AI support** widget (apatinis dešinys kampas) — `SupportWidget.tsx`, API `/api/support-chat` + `/api/support-contact`. Rodomas tik **neprisijungusiems** (landing, blog, kainos, login…). Prisijungusiems tutor/mokinys/tėvas/org admin — paslėptas, net jei jie atidaro marketingo puslapį.

---

## 5. Architektūros schema

```
┌─────────────┐     HTTPS      ┌──────────────────┐
│   Browser   │ ──────────────►│  Vercel (Vite)   │
│  React SPA  │                │  + middleware    │
└──────┬──────┘                └────────┬─────────┘
       │                                │
       │  /api/*                        │  Cron jobs
       ▼                                ▼
┌──────────────────┐            ┌──────────────────┐
│ Vercel Functions │◄──────────►│    Supabase      │
│  api/*.ts        │  service   │  PostgreSQL+RLS  │
└────────┬─────────┘  role key  │  Auth + Storage  │
         │                      └──────────────────┘
         ├──► Stripe API / Webhooks
         ├──► Resend (email)
         ├──► GoSign SOAP (e-parašas)
         ├──► OpenAI (Luna) — viešas AI support widget
         └──► DOCX Converter (Railway)
```

**Lokalus dev:**
- Frontend: `http://localhost:3000` (Vite)
- API: `http://localhost:3002` (per `scripts/dev-api-local.ts`)
- Arba `npm start` / `vercel dev` — viskas per Vercel dev

---

## 6. Lokalus paleidimas

```bash
npm install
cp .env.example .env   # užpildyti raktus
npm run dev                  # frontend :3000 + API :3002
```

**Windows PowerShell:** naudok `;` vietoj `&&` komandų grandinėse.

**Lokalus dev (svarbu demo / school QA):**
- Vienintelis šaltinis: **`.env`** projekto šaknyje. `dev-api-local.ts` ir seed skriptai krauna tik jį (ne `.env.local`, ne `.env.vercel.*`).
- Vite vis tiek automatiškai merge'ina `.env.local`, jei failas egzistuoja — **pervadink arba ištrink** `.env.local` / `.env.vercel.stage`, kad frontend ir API naudotų tą patį `.env`.
- `.env` turi rodyti į `cuhciqwmqfuajeeqjjbm` (ne pasenusį `xklzjhfztjxltrdkplog`), tada `npm run dev`.

**Alternatyvos:**
- `npm run dev:prod` — naudoja `.env.local` prod Supabase (reikia zsh)
- `npm run dev:test` — test Supabase + test Stripe
- `npm start` — `vercel dev` ant :3000

**Lint / test:**
```bash
npm run lint        # tsc --noEmit (frontend)
npm run lint:api    # API TypeScript
npm test            # vitest run
```

---

## 7. Aplinkos kintamieji

Pilnas sąrašas: `.env.example`

| Grupė | Kintamieji | Pastaba |
|-------|------------|---------|
| Supabase | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Service role **tik** serveryje |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price/product ID | EUR + PLN variantai |
| App | `APP_URL`, `VITE_APP_URL` | Redirect'ams |
| Email | `RESEND_API_KEY`, `FROM_EMAIL` | Stage: `RESEND_API_KEY_STAGE` kai prod raktas tuščias |
| AI support | `OPENAI_API_KEY` | **Tik** serveryje (`/api/support-chat`). **Niekada** `VITE_OPENAI_*` |
| Cron | `CRON_SECRET` | **Privaloma** Vercel prod |
| Admin | `ADMIN_SECRET` | Platformos admin API. **Ne** `VITE_ADMIN_SECRET` fronte — Vite išleistų į browserį. API paliktas tik senas fallback. |
| GoSign | `GOSIGN_CLIENT_ID`, `GOSIGN_PRIVATE_KEY`, `GOSIGN_ONESIGN_ENDPOINT`… | E-parašas |
| DOCX | `DOCX_CONVERTER_URL`, `DOCX_CONVERTER_API_KEY` | Sutarčių PDF |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Kalendoriaus sync |

**⚠️ Dažna klaida:** `.env` gali rodyti į nebegaliojantį Supabase projektą (`xklzjhfztjxltrdkplog`). Aktyvus projektas `cuhciqwmqfuajeeqjjbm` yra **produkcija**. Lokalus school QA — tik Demo Mokykla (`c3a00000-…0001`), **neliesti** tikrų org (pvz. Laisvi vaikai). Extra-lessons seed rašo tik Demo org.

**⚠️ Windows lokalus API:** jei OS env turi seną `SUPABASE_URL` (`xklzjhfztjxltrdkplog`), `scripts/dev-api-local.ts` ir `api/_lib/auth.ts` ignoruoja jį — `.env` raktai turi prioritetą. API log'e turi matytis `cuhciqwmqfuajeeqjjbm.supabase.co`.

**⚠️ Niekada necommitink:** `.env`, `.env.local`, `.env.vercel.*`, service role keys.

---

## 8. Deploy ir git

```bash
# Produkcija (tik su vartotojo leidimu!)
npm run vercel:deploy-prod
```

- Vercel projektas: `tutlio`
- Alias: `tutlio.lt`, `tutlio.pl`
- Build: `npm run build` → `dist/`
- Cron job'ai: `vercel.json` → `crons` (sessions, reminders, contract reconcile, blog, `school-join-no-show` kas 5 min). **Mėnesio 1 d. naktiniai laiškai yra sistema, ne rankinis triggeris:** `generate-monthly-packages` 00:30 UTC (03:30 Vilnius) — Pro Klasė / org mėnesio paketų pasiūlymai; `bill-extra-lessons` 03:00 UTC (06:00 Vilnius) — company extra pamokų paketai; `bill-school-extra-lessons` 04:00 UTC (07:00 Vilnius) — mokyklų extra-lessons mėnesio sąskaitos. Extra-lessons **sutarčių** offer laiškai crono neturi — tik admin UI (`extra-lessons-contract-offer`).

**Git taisyklės (iš vartotojo preferencijų):**
- **Produkcijos deployas tik su vartotojo leidimu. Prieš kiekvieną deployą visus jam skirtus pakeitimus pirma commitink būtent `simo-local` šakoje, patikrink švarų darbinį aplanką ir pushink į `origin/simo-local`; tik tada deployink.** Leidimas deployui apima šį būtiną išankstinį commitą ir push. Atskirų commitų be vartotojo leidimo nedaryk.
- Jei darbas vyko kitoje šakoje, prieš deployą perkelk numatytus pakeitimus į `simo-local` ir patikrink, kad deployinamas kodas atitinka jos commitą.
- Nenaudok `git push --force` į `main` ar `simo-local`
- Nenaudok `--no-verify`
- Commit message — pilni sakiniai, fokusas į „kodėl“

**Produkcijos release šaka:** `simo-local` (tikslus mažųjų raidžių pavadinimas; ne `main`).

---

## 9. Duomenų bazė (Supabase)

Migracijos: `supabase/migrations/` (datuotos `202603*`–`202608*`).

### Pagrindinės lentelės

| Lentelė | Paskirtis |
|---------|-----------|
| `organizations` | Org/mokykla (`entity_type`, `features` JSON) |
| `organization_admins` | Org adminų ryšys |
| `profiles` | Tutor profiliai (`company_commission_percent`; mokykloms dar `company_individual_commission_percent`; Mano Korepetitorius dar `company_commission_by_subject`) |
| `students` | Mokiniai (`grade`, `media_publicity_consent`, `school_year`, `enrollment_status`, `municipality`, `exit_*`, `has_debt_manual`) |
| `sessions` | Pamokos (`is_makeup`, `is_complimentary`; school extra: `school_billing_kind`, `student_joined_at`) |
| `school_contract_templates` | Sutarčių šablonai (DOCX body) |
| `school_contracts` | Sutartys. `kind`: `'annual'` \| `'extra_lessons'`. Extra: `order_snapshot`, `document_sha256`, `accepted_at`, `base_lessons_per_month`, `unit_price_eur`, `class_group_id`, withdrawal laukai. WIP mokytojams: `party_kind` (`student` \| `teacher`), `counterparty_name` / `counterparty_email` |
| `school_class_groups` + `_slots` + `_members` | Metų trukmės klasės grupės, savaitės slotai, mokinių sąrašas |
| `school_payment_installments` | Įmokų grafikas (metinėms sutartims) |
| `school_contract_signatures` | E-parašo įrašai (`role`: school / parent_* / planuojama `teacher`) |
| `invoices`, `lesson_packages` | Billing (PVM serijos numeris atominiu `allocateInvoiceNumber`) |
| `chat_conversations`, `chat_messages` | Žinutės |
| `support_conversations`, `support_messages`, `support_contact_requests` | Viešas AI support (server-only, be RLS vartotojams). Priedai — privatus bucket `support-attachments` |

**RLS:** visos lentelės turi Row Level Security. Org admin mato tik savo `organization_id`.

**Migracijų push:** `npm run supabase:push` (reikia `supabase login` + `supabase link`).

---

## 10. API sluoksnis

Kiekvienas `api/foo-bar.ts` → endpoint `/api/foo-bar`.

### Autentifikacija (`api/_lib/auth.ts`)

1. `Authorization: Bearer <supabase_jwt>` — vartotojo sesija
2. `x-internal-key: <SUPABASE_SERVICE_ROLE_KEY>` — vidiniai kvietimai

### Cron (`api/_lib/cronAuth.ts`)

`Authorization: Bearer <CRON_SECRET>` — Vercel cron kvietimai.

### API kategorijos

| Kategorija | Failai (pavyzdžiai) |
|------------|---------------------|
| School sutartys (metinės) | `school-contract-sign-init.ts`, `school-contract-complete.ts`, `school-contract-mark-signed.ts` |
| Extra-lessons sutartys | `extra-lessons-contract-offer.ts`, `extra-lessons-contract-accept.ts`, `extra-lessons-contract-withdraw.ts`, `bill-school-extra-lessons.ts` |
| School grupės / įrašai / no-show | `school-class-groups.ts`, `school-lesson-recordings.ts`, `school-join-no-show.ts` (DB only, be tėvų laiško) |
| Neatvykimas tėvams | `notify-session-no-show.ts` → `session_student_no_show` (tik po rankinio žymėjimo) |
| Org korep kvietimas | `invite-tutor.ts` + `sendTutorInviteResend.ts` |
| Mokytojų sutartys (WIP) | `school-contract-teacher-invite.ts` — importuoja `inviteTeacherToSign` / `isTeacherContract`, kurių `schoolContractSigning.ts` dar neturi |
| School mokėjimai | `pay-school-installment.ts`, `confirm-school-installment-manual.ts`, `school-installment-reminders.ts` |
| Sąskaitos | `generate-invoice.ts`, `reserve-invoice-number.ts`, `invoice-pdf.ts` |
| Paketai (Pro Klasė) | `update-pending-package.ts`, `resend-package-email.ts`, `api/_lib/sendPendingPackageEmail.ts` |
| Stripe | `stripe-webhook.ts`, `stripe-checkout.ts`, `stripe-connect.ts`, `create-subscription-checkout.ts` |
| Lead / quiz | `landing-lead.ts` |
| AI support | `support-chat.ts` (stream), `support-contact.ts`, `support-chat-close.ts`, `support-attachment-upload-url.ts` |
| Sessions/cron | `auto-complete-sessions.ts`, `send-reminders.ts`, `materialize-recurring-sessions.ts`, `mark-session-complimentary.ts` |
| Admin | `admin-organizations.ts`, `admin-statistics.ts` |
| Email | `send-email.ts` |
| SSR/SEO | `page-render.ts`, `blog-render.ts`, `sitemap.ts` |

**Bendri helperiai:** `api/_lib/schoolContractSigning.ts`, `schoolContractPdf.ts`, `extraLessonsContractShared.ts`, `schoolInstallmentStripe.ts`, `gosign.ts`, `docxConverter.ts`, `invoiceNumber.ts`, `pvmEducationInvoice.ts`, `proKlaseInvoice.ts`, `emailOrgBranding.ts`, `i18n.ts` (el. paštas; paleidime tik 13 kalbų), `loadExtraLocaleDict.ts`, `ssr-i18n.ts`, `supportKnowledge.ts`, `supportRequest.ts`, `supportPersistence.ts`, `supportContact.ts`.

---

## 11. Autentifikacija (frontend)

1. `src/lib/supabase.ts` — Supabase client (remember-me: localStorage vs sessionStorage)
2. `src/pages/Login.tsx` — portal picker + `signInWithPassword`
3. Org/school admin: `src/pages/CompanyLogin.tsx` (`/company/login` ir `/school/login`). Po SIGNED_IN kelias per `getOrgAdminDashboardPath()` — **ne** embedinti `organizations(...)` po `organization_admins` (RLS hang, UI lieka „Jungiamasi…“). Org eilutė: `fetchOrganizationRow()` (`src/lib/orgLookup.ts`)
4. Route guard'ai tikrina sesiją + DB rolę
5. Tutor'iams papildomai — aktyvi Stripe prenumerata (`src/lib/subscription.ts`)

---

## 12. Feature flag'ai

**Registras:** `src/lib/featureRegistry.ts`  
**Hook:** `src/hooks/useOrgFeatures.ts` — `hasFeature('feature_id')`  
**Admin UI:** `/admin` — toggle per organizaciją (`organizations.features` JSON)

**Universali white-label taisyklė:** feature flag'as įjungia tik funkcionalumą. Jei feature'as,
sukurtas vienai organizacijai, įjungiamas kitai, visi vartotojui matomi pavadinimai, logotipai,
spalvos, el. laiškų siuntėjo vardai, parašai ir nuorodos privalo būti imami iš organizacijos,
kuriai flag'as įjungtas, o ne iš organizacijos, kuriai feature'as buvo sukurtas pirmiausia.
Vidiniai legacy failų / API pavadinimai gali likti, tačiau jie negali patekti į UI ar laiškus.

### School-related feature'ai

| ID | Paskirtis |
|----|-----------|
| `school_contract_esign` | GoSign el. parašas (vietoj rankinio) — metinėms sutartims |
| `school_extra_lessons_contract` | Papildomų pamokų sutartys (click-wrap, SHA-256, 14 d. atsisakymas). GoSign neprivalomas |
| `school_class_groups` | Klasės grupės visiems mokslo metams; nav `/school/groups` |
| `school_lesson_recordings` | Privatūs pamokų įrašai iš grupei arba aktyvaus individualaus dalyko auditorijai priskirto Drive aplanko. Admin / mokytojas / mokinys / tėvas turi atskirus `/recordings` portalų kelius; serveris kiekvieną užklausą tikrina pagal gyvą grupės narystę arba aktyvų `recurring_individual_sessions` ryšį. Extra-lessons įrašų radio tik jei flag `true`. Demo seed = `false`. |
| `school_join_no_show` | Mokinys nepaspaudė „Prisijungti“ per ~10 min → `status=no_show` (`school-join-no-show` cron). **Tėvų / mokėtojo neinformuoja** (nei laiškas, nei push) |
| `school_teacher_labels` | School portale „mokytojas“ vietoj „korepetitorius“ (`useStaffLabels`). Mokykloms (`entity_type='school'`) taikoma automatiškai visuose portaluose (admin, mokytojas, mokinys, tėvai) ir laiškuose per `schoolTerminology.ts` |
| `school_activity_labels` | „Užsiėmimas“ vietoj „pamoka“ (LT linksniuojama, EN `lesson`→`session`). **Numatytai įjungta mokykloms**, `false` išjungia. Runtime sluoksnis `src/lib/i18n/schoolTerminology.ts` + `terminologyStore.ts`; įjungia layout'ai per `useSchoolTerminology` |
| `extra_lessons_billing` | Mėnesio pabaigos papildomų pamokų sąskaitos (company/Pro Klasė srautas, ne school click-wrap) |
| `pvm_education_invoice` | PVM S.F. layout, atominė serijos numeracija, išorinių numerių rezervacija |
| `student_card_booking` | Org admin rezervuoja pamoką iš mokinio kortelės (`FindTutorModal` + `FindLessonBookDialog`) |
| `managed_family_accounts` | Administracija iš karto sukuria mokinio / tėvų paskyras ir pasirenka aktyvavimo laiškų gavėjus. Legacy MV / Pro Klasė įjungta pagal org ID; kitoms org — per flag'ą. Prisijungimo vardas kitoms org neutralus `st-*`, o UI / laiškai / aktyvavimo puslapis naudoja tik tikslinės org white-label. Kai vienas vaikas jau yra, esamo vaiko kortelėje „Pridėti dar vieną vaiką“ sukuria naują vaiko paskyrą su tais pačiais tėvais (Pro Klasė ir kitos managed-family org). Managed-family kontaktų taisyklė (`src/lib/managedFamilyContact.ts`): jei nurodytas mokinio el. paštas, tėvų el. paštas neprivalomas; be mokinio pašto reikia tėvų el. pašto arba jau sukurtos tėvų paskyros. Jei vaiko ir mokėtojo el. paštas sutampa, naudojama viena Auth paskyra: `parent_user_id` ir `linked_user_id` rodo į tą patį `user_id` (`mvProvisionFamilyAccounts.ts` susieja automatiškai kuriant tėvų paskyrą). Admin UI „Paskyra patvirtinta“ remiasi `linked_user_id`. Taikoma ir „Pridėti klientą“ (`invite_target=provision`), ir „Pridėti dar vieną vaiką“. Tėvų paskyra atskirai mygtuku „Sukurti tėvų paskyrą“; mokinio paskyra kuriama išsaugant vaiką (atskiro mygtuko kortelėje nėra). Prisijungimo duomenys parodomi iš karto, o mokslo metų pamokų serija įrašoma toliau, kad mygtukas „Saugoma“ nelauktų visų eilučių. Pamoką adminas pasirenka pats pagal laisvą laiką: kas savaitę arba kas dvi, pirmoji gali būti bandomoji. Esamo mokinio kortelėje laisvo laiko paieška yra viršuje, o mokėjimo būdas eina per visą plotį. |

Naudojimas:
```typescript
const { hasFeature } = useOrgFeatures();
if (hasFeature('school_contract_esign')) { /* GoSign flow */ }
```

---

## 13. Tutor kalendorius (laisvas laikas ir slot pasirinkimas)

**UI:** `src/pages/Calendar.tsx`  
**Komponentai:** `AvailabilityManager.tsx` (darbo laiko nustatymai), `TimeSpinner`, slot edit modal

### Slot pasirinkimas (drag ant tuščios vietos)

1. Tutor pažymi laiko intervalą kalendoriuje.
2. Atsidaro dialogas **„Pamoka / Laisvas laikas“** (`slotChoiceOpen`).
3. Antraštės mygtukas **„Sukurti pamoką“** naudoja `forceCreate: true` — praleidžia dialogą ir atidaro pamokos formą.

### Laisvas laikas iš kalendoriaus

`openCreateFreeTimeFromSlot()`:

1. **Iš karto įrašo** vienkartinį `availability` įrašą su pažymėtu laiku (`specific_date`, `start_time`, `end_time`).
2. **Atidaro slot edit modalą** (`isSlotEditOpen`) — korepetitorius gali koreguoti laiką, pasirinkti **dalykus** (`subject_ids`), nuorodą, pridėti mokinį.
3. „Išsaugoti“ modalėje atnaujina įrašą; uždarius be išsaugoti — laikas vis tiek lieka (tuščias `subject_ids` = visi dalykai).

**Pastaba:** `AvailabilityManager` (meniu „Darbo laiko nustatymai“) — atskiras srautas; su `prefill` automatiškai perjungia į skirtuką „Konkreti data“.

### Pamokų trynimas ir laisvo laiko atkūrimas

- Tutor ir org / school admin gali trinti ir atšauktas pamokas; adminui reikia `sessions.edit`. Mokinys / tėvas gali pašalinti tik savo / vaiko atšauktas pamokas be neišspręsto atšaukimo mokesčio.
- Tutor kalendoriaus „Atšauktos“ sąrašas atskirai įkelia ir po 12 val. paslėptas pamokas; paspaudus mokinio eilutę galima pašalinti tik jo pamoką / seriją, neliečiant kitų grupės dalyvių.
- Bendras `DeleteSessionDialog` pasikartojančioms individualioms ir klasės grupių pamokoms siūlo `single`, `future` arba `all` (visos likusios suplanuotos ir atšauktos; įvykusių pamokų istorija išlieka). `groupScope` atskiria visos grupės pamoką nuo vieno mokinio pašalinimo.
- `/api/delete-session` naudoja atominį `delete_sessions_with_recurrence` RPC. Migracija `20260928140000_session_deletion_recurrence_exclusions.sql` būtina prieš aktyvuojant pakeitimą; išimtys neleidžia materializatoriui atkurti ištrintų pamokų.
- `consumeSessionAvailability.ts` išsaugo vienkartinio laisvo laiko šaltinį ir jo nustatymus; užimtą laiką paslepia pamokų filtrai. `releaseSessionAvailability.ts` užpildo seniau sunaudotus tarpus, nekurdamas laisvo laiko ten, kur liko kita pamoka.

### Vizualūs skirtumai kalendoriuje

**Failai:** `src/lib/calendarSessionEventStyle.ts`, `src/lib/calendarGridSessions.ts` — naudojami `Calendar.tsx` ir `CompanyTvarkarastis.tsx`

| Tipas | Stilius |
|-------|---------|
| Solo tutor suplanuota (būsima) | `subjects.color` pagal `subject_id` |
| Bandomoji | violetinė |
| Įvykusi neapmokėta | amber |
| Kompensacinė (`is_makeup`) | violetinė su ↻ |
| Tutor no-show atšaukta | raudona punktyrinė ⊘ |

**Solo tutor UX:** kalendoriaus juostoje rodomas tik mokinio vardas (dalykas — spalva); create modale individualiai pirma **Mokinys**, tada **Dalykas**. Pasirinkus dalyką po slot drag, trukmė auto perskaičiuojama iš `subjects.duration_minutes` (`createDurationTouched` tik rankiniam „Trukmė (min)“ redagavimui). Atšaukta pamoka to paties `start_time` nerodoma, jei tame slote jau yra kita eilutė (`filterCalendarGridSessions`).

### Org admin UI (tutor filtrai)

**Failas:** `src/lib/orgUi.ts` — `ORG_TUTOR_FILTER_SCROLL_CLASS` (~3 eilutės scroll) taikomas `CompanyTvarkarastis`, `CompanyFinance`, `CompanySettings`, `CompanyStudents`, `CompanyInvoices`.

---

## 14. Mokyklų modulis (detaliau)

### Sutartys

**UI:** `src/pages/company/CompanyContracts.tsx`
- Šablonų valdymas (DOCX + placeholders: `{{student_name}}`, `{{annual_fee}}`…)
- Sutarties kūrimas su metiniu mokesčiu, papildomu mokesčiu
- **Pasirašymo statusai (5):** `draft` → `sent` → `awaiting_school_signature` → `signed_by_school` → `signed`
- Rankinis pasirašytos sutarties įkėlimas (foto/PDF) mygtuku **„Įkelti pasirašytą kopiją“**
- **Ne-eSign org** (arba jau `signed` / mokykla jau pasirašė GoSign): įkėlimas iš karto `signing_status: 'signed'`, failas į `signed_contract_url`, kviečiamas `/api/school-contract-mark-signed` (`manualUpload: true`)
- **eSign org, mokykla dar nepasirašė:** Tutlio **neanalizuoja** skeno parašų. Po failo pasirinkimo dialogas `shouldPromptSchoolSignedOnScan()`:
  - **Taip — pasirašyta abiejų šalių** → folderis **Pasirašytos** (`signed`)
  - **Ne — mokykla dar nepasirašė** → folderis **Nepasirašyta mokyklos** (`awaiting_school_signature`), failas į `pdf_url`, direktorė gali GoSign
- Sąrašo PDF nuoroda: `currentContractPdfPath()` — naujausias parašo PDF, tada `signed_contract_url` / `pdf_url`
- GoSign integracija kai `school_contract_esign` įjungta
- Direktorės mygtukas: `schoolCanInitiateSignature()` — visada, kai statusas `awaiting_school_signature` (įskaitant skeną be completion formos); `signed_by_school` be mokyklos parašo — tik jei yra `completion_submitted_at`

**School view filtrai** (dropdown, ne pill mygtukai):
| Filtras | Sąlyga |
|---------|--------|
| Visos | visos nearchyvuotos |
| Nepasirašyta mokyklos | `awaiting_school_signature` **arba** `signed_by_school` be tikro mokyklos parašo eilutėje |
| Nepasirašyta tėvų | `signed_by_school` **ir** mokyklos parašas `status === 'signed'` |
| Neužpildyti sutarties duomenys | ne `signed` ir (trūksta privalomų laukų **arba** e-sign `sent` be `completion_submitted_at`) |
| Pasirašytos | `signing_status === 'signed'` |

**Filtrų logika:** `src/lib/schoolContractFilters.ts` — `getContractMissingFieldLabels()`, `matchesContractFilter()`, `countContractsByFilter()`, `schoolHasSigned()`, `schoolCanInitiateSignature()`, `shouldPromptSchoolSignedOnScan()`, `currentContractPdfPath()`.

**Trūkstami laukai** (school): adresas, gimimo data, tėvų asm. kodas, tėvų tel., atvaizdo sutikimas. Sutikimas imamas iš **`school_contracts.media_publicity_consent`**, ne iš mokinio įrašo (sibling / senesnės sutarties `students.media_publicity_consent` nereiškia, kad ši sutartis užpildyta).

**Geltona juosta** „laukia, kol tėvai patvirtins duomenis“ = `sent` + eSign. Tai turi patekti į filtrą „Neužpildyti sutarties duomenys“.

**Excel eksportas (sutartys):** `schoolContractsExport.ts` + `schoolContractsXlsxExport.ts` — mygtukas school view, eksportuoja **dabartinį filtruotą** sąrašą (+ paieška).

**Veiksmų UI:** pagrindinis veiksmas atskirai (pvz. „Pasirašyti (direktorė)“), kiti — Popover meniu „Daugiau veiksmų“ (ne 4 mygtukai vienoje eilutėje).

### Papildomų pamokų sutartys (`kind = 'extra_lessons'`)

Tai **nėra** atskira lentelė ir **nėra** sutartis prie kiekvienos pamokos. Tai antras `school_contracts` tipas (šalia `annual`). Commit `9fe5009` paliktas QA ant `alano-local` — **į produkciją nekelti**, kol atskirai nepatvirtins. Flag `school_extra_lessons_contract`.

**Srautas:**
1. School admin `/school/contracts` arba mokinio kortelėje pildo užsakymą (`ExtraLessonsOfferDialog`: grupė/individualu, grafikas, kaina, bazinis pamokų sk./mėn.).
2. `POST /api/extra-lessons-contract-offer` — snapshot, PDF, token, laiškas tėvams.
3. Tėvai `/school-extra-lessons-accept` — layout kaip `SchoolContractComplete`: PDF iframe + **Atidaryti visą PDF**, trūkstami užsakymo laukai, privalomas sąlygų checkbox, **„Patvirtinti sutartį“**. 14 d. (Vilnius): radio **Sutinku pradėti iš karto** / **Palaukti**; jei pirma pamoka jau po 14 d. — laukelis nerodomas (`na`). Po sėkmės ekrano atsisakymo mygtuko nėra — 14 d. atsisakymas tėvų paskyroje. Demo Mokykla ir Laisvi vaikai visada pildo kanoninį DOCX `docs/legal/extra-lessons-laisvi-vaikai.docx` (kopija `api/_lib/templates/`). Kitos mokyklos — savo extra-lessons DOCX. GET/preview generuoja PDF (`api/_lib/extraLessonsPdf.ts`); converter fallback — pilnas teisinis tekstas, ne santrauka. Po laukų pakeitimo `POST preview: true` atnaujina PDF. Užšaldoma redakcija (`document_sha256`), `accepted_by_user_id`, `start_within_14_status`.
4. 14 d. **„Atsisakyti sutarties“** vs po lango **„Nutraukti sutartį“** — **tik tėvų portalas** (`/parent`, `ParentExtraLessonsContracts`). Po click-wrap sėkmės ekrane atsisakymo mygtuko **nėra**. API `extra-lessons-contract-withdraw` + pareiškimo PDF + el. pašto patvirtinimas mokėtojui. Mokytojo atskirai neinformuoti.
5. Mėnesio sąskaita: baziniai kreditai + extra joined pamokos (`schoolExtraLessonsBilling.ts`, cron `bill-school-extra-lessons` 1 d. 04:00 UTC). Extra pamoka mokama tik jei `school_billing_kind === 'extra'` ir mokinys prisijungė / `completed`; `no_show` neskaičiuojamas. Jei tėvas **ne** prašė ankstyvos pradžios (`start_within_14_status = no`), pamokos/sąskaita ne anksčiau nei `accepted_at + 14 d.` Jei tėvas **sutiko pradėti iš karto**, S.F. ima užsiėmimus nuo užsakymo `start_date`, įskaitant jau įvykusius prieš pasirašymą (kaina iš sutarties `unit_price_eur`, net jei `sessions.price` vis dar 0). Sukūrus sąskaitą cron'as **iš karto siunčia** `school_monthly_invoice` laišką mokėtojui (`api/_lib/schoolMonthlyInvoiceEmail.ts`): suvestinė + mygtukas **Apmokėti** → viešas `GET /api/pay-school-monthly-invoice?invoice=&t=` (HMAC `publicLinkToken.ts`, Stripe Connect kaip įmokoms, be paskyros). Apmokėjimą žymi `stripe-webhook` (`tutlio_school_monthly_invoice_id`) ir `/school-payment-success?monthly=` → `confirm-school-monthly-invoice-payment`. Jei mokykla be Stripe Connect — laiškas be mygtuko, nurodo mokyklos kontaktą. Migracija `20260905120000_school_monthly_invoice_payments.sql` (checkout id, `invoice_email_sent_at`, `paid_via`) — kodas toleruoja, kol nepritaikyta.
   **Admin S.F. pagal faktą (Laisvi vaikai / extra-lessons / family portal):** ne `CreateInvoiceModal` ir ne `sessions.price` (dažnai 0). `/school/finance` Mokėjimai ir Sąskaitos atidaro `SchoolMonthlyInvoiceDialog` `batch` režimą. Suma = sutarties `unit_price_eur` × to mėnesio apmokestinami užsiėmimai (`resolveSchoolInvoiceUnitPrice`). Nuolaidos imamos iš `student_lesson_discounts` **ir** patvirtintų `school_discount_agreements` (`schoolMonthlyInvoiceDiscounts.ts`); grupėms be `subject_id` sutapatinama pagal sutarties `class_group_id`. Po tėvų patvirtinimo `school-discount-accept` sinchronizuoja įrašą į `student_lesson_discounts`, kai yra `subject_id`. Batch UI grupuoja pagal `payer_email` (`schoolPayerInvoiceGroups`): po mokėtoju rodomi **atskiri vaikai** (Kajus, Etmė…), bet **Siųsti šiam mokėtojui** / **Siųsti visiems** formuoja **vieną S.F. ir vieną laišką** mokėtojui; PDF eilutėse stulpelis **Mokinys** + dalykas atskiriami vaikui. **`loadBatchDrafts`** sujungia kelis `students.id` tos pačios vaiko tapatybės (`orgStudentIdentityGroupKey`: mokėtojo el. paštas + vardas) į **vieną** peržiūros juodraštį; keli mokytojai toliau gali turėti atskirus `students` eilutes, bet finansuose tai vienas vaikas. Grupės eilutėse rodomas pilnas `school_class_groups.name`; jei yra extra-lessons sutartys, bet konkrečiai grupei/individualiai jų nėra arba jos nepasirašytos, pavadinimas papildomas `· sutartis nėra` / `· sutartis nepasirašyta`. `ensureStudentPairedWithTutor` (`orgStudentPairing.ts`) sibling paiešką daro ir pagal `payer_email + vardas`, ne tik `linked_user_id`. Dubliatų taisymas: `scripts/repair-laisvi-duplicate-students.mjs`. Gate `schoolMonthlyInvoicesEnabled` (consultations **arba** `school_extra_lessons_contract` **arba** `school_family_portal`). API `batch-preview` / `send-batch` `api/school-monthly-invoice-admin.ts`. **Kelios S.F. tam pačiam mėnesiui leidžiamos**, jei liko neįtrauktų užsiėmimų; dubliavimas blokuojamas tik pagal `billed_session_ids`, ne pagal `period_start`.
6. **Po sutarties patvirtinimo** (`extra-lessons-contract-accept`) siunčiamas `school_extra_first_lesson_invite` (`api/_lib/extraLessonsFirstLessonInvite.ts`): grupės pamokos materializuojamos iš karto, parenkama artimiausia aktyvi mokinio pamoka nuo paslaugų pradžios (`pickNearestSession`), laiške data / laikas / mokytojas / grupė, sekama prisijungimo nuoroda (`/api/join-session`) ir **namų darbų nuoroda**. Be pamokos eilutės — planuojamas grafikas ir 14 d. pastaba.
7. **Namų darbai be paskyros:** viešas `/school-homework?student=&t=` (`SchoolHomework.tsx`, API `api/school-homework.ts`): vaiko pamokos (−60/+45 d.), mokytojo failai iš `session-files` (visų lygiagrečių grupės eilučių aplankai), tėvų įkėlimai `nd-<mokinys>-<failas>` į pamokos aplanką (signed upload URL, 10 MB, tie patys plėtiniai kaip `SessionFiles`), sekamas „Prisijungti“ tik lango metu. Nuoroda dedama į kvietimo ir school priminimo laiškus (`homeworkUrl`). Mokytojas failus mato įprastame `SessionFiles`.

**Failai:** `src/lib/extraLessonsContract.ts`, `api/_lib/extraLessonsContractShared.ts`, `api/_lib/extraLessonsPdf.ts`, `api/extra-lessons-contract-*.ts`, `api/extra-lessons-parent-contracts.ts`, `src/pages/SchoolExtraLessonsAccept.tsx`, `ParentExtraLessonsContracts.tsx`, `api/_lib/extraLessonsFirstLessonInvite.ts`, `api/_lib/schoolMonthlyInvoiceEmail.ts`, `api/pay-school-monthly-invoice.ts`, `api/confirm-school-monthly-invoice-payment.ts`, `api/school-homework.ts`, `src/pages/SchoolHomework.tsx`, `api/_lib/publicLinkToken.ts`.
**Migracija:** `20260826140000_school_extra_lessons.sql`, `20260827120000_extra_lessons_start_within_14.sql`.
**QA seed:** `scripts/seed-school-extra-lessons-qa.mjs` (tik Demo Mokykla, ne Laisvi vaikai), `scripts/seed-school-extra-lessons-legal-qa.mjs` (stabilūs tokenai kaip `test_school.md`).
**QA laiškai:** visi extra-lessons / school įmokų / sutarčių tėvų laiškai Demo Mokykloje eina į `alaniukasa@gmail.com` (`students.payer_email`).
**Testai:** `tests/lib/extra-lessons-contract.test.ts`, `tests/pages/school-extra-lessons-accept.test.tsx`, `tests/lib/school-extra-lessons-billing.test.ts`, `tests/lib/extra-lessons-parent-portal.test.ts`, `tests/api/send-email-extra-lessons.test.ts`, `tests/api/extra-lessons-first-lesson-invite.test.ts`, `tests/api/send-email-school-invite-and-invoice.test.ts`, `tests/api/school-monthly-invoice-email.test.ts`, `tests/api/pay-school-monthly-invoice.test.ts`, `tests/api/school-homework.test.ts`, `tests/lib/public-link-token.test.ts`, `tests/lib/school-payer-invoice-groups.test.ts`, `tests/api/school-monthly-invoice-admin.test.ts`.
**Rankinis QA:** `test_school.md`.

**S.F. įvykimo įrodymai (Laisvi vaikai):** `hasSchoolOccurrenceEvidence()` (`schoolCanonicalBilling.ts`) priima `tutor_joined_at`; `completed` + `student_joined_at`; `no_show` + `status_confirmed_at`; individualiam `completed` + `status_confirmed_at` be grupės. **Gyvam grupiniam užsiėmimui pakanka `completed` + `status_confirmed_by` + tinkamo `status_confirmed_at >= end_time`:** tai mokytojo arba administratoriaus rankinis patvirtinimas po užsiėmimo. Sena automatinė žyma be patvirtinusio asmens (`status_confirmed_by = null`) nėra įvykimo įrodymas; ją galima aiškiai patvirtinti per tą patį lankomumo veiksmą (`confirm-session-status`), pakartotinai nepakeičiant paketų skaitiklių. Grupės faktas gali būti ir kito dalyvio eilutėje (`group_occurred`). Admin API ir mėnesio billing įkelia prisijungimų laikus, `status_confirmed_at`, `status_confirmed_by` ir `end_time`, taip pat kitų grupės dalyvių įrodymams. Sąskaitų peržiūros įspėjimas remiasi `reason === 'unconfirmed'`. **Be pasirašytos sutarties:** individuali tiesioginė pamoka (pvz. Alina LT) lieka `payable` pagal `sessions.price`; grupės pamokos su `sent` pasiūlymu ir pilnais `order_snapshot` + `unit_price_eur` duomenimis taip pat `payable` (ne tik bandomoji su join įrodymu); kaina iš sutarties, ne `subjects.price` 20 €. Jei `sent` pasiūlyme nėra kainos — reikia join įrodymo arba lieka `outside_contract`. **Sutarčių peržiūra (`contract_review`):** archyvuotos (`archived_at`) sutartys neįtraukiamos; kelios tos pačios grupės sutartys neblokuoja — imama naujausia pasirašyta / pilna `sent`. Individualiai sutarčiai su **ištrintu** `order_snapshot.subject_id` (dažna Laisvi vaikai po dalyko perkūrimo) billing sutapatina pagal paslaugos pavadinimą + mokinio vardą (`individualSessionMatchesContractService`); pasirašyto snapshot'o ID **nekeičiame**. `contract_review` lieka tik trūkstamiems `order_snapshot`, kai pavadinimai nesutampa, arba kai pamokos eilutė akivaizdžiai ne ta paslauga (pvz. kita kalba / kitas vaikas). Diagnostika: `scripts/diagnose-school-subject-contract-drift.mjs`. Klaidingas neįvykęs eilutes galima anuliuoti per `school_session_billing_decisions` (`excluded=true`) ir/arba `sessions.status=cancelled`. Sutarties pradžios riba išlieka: 09.03 neapmokestinama, jei `start_date = 09.07`. KPI ir join/no-show cron logika atskira. **Mėnesinės S.F. numeris:** peržiūros PDF rodo kitą numerį iš `invoice_profiles.invoice_series` + `next_invoice_number` (`previewInvoiceNumber`, neįtraukia sekos); išsiuntus — `allocateInvoiceNumber()` atominiu RPC; PDF antraštė bet kuriai serijai per `formatSchoolInvoiceNumberLabel` (ne tik PAM). **Grupės pamoka be `class_group_id` arba po grupės perkūrimo:** jei patvirtintas dalyvavimas ir sutartis sutampa pagal paslaugos pavadinimą / mokytoją / grafiką, kaina imama iš sutarties `unit_price_eur` (ne 0 €); **bandomosios** (`subjects.is_trial`) neįtraukiamos.

### Klasės grupės, įrašai, join no-show

| Flag | UI / API |
|------|----------|
| `school_class_groups` | `/school/groups` → `CompanyClassGroups.tsx` + `ClassGroupFormDialog.tsx`, `POST/PATCH/DELETE /api/school-class-groups`. Slotai: kiekviena eilutė = savaitės diena + startas (pabaiga iš grupės `duration_minutes`). Pamokos **rekonsiliuojamos** `api/_lib/schoolClassGroupMaterialize.ts`: iš karto po POST/PATCH (atsakyme `materialized`) ir kas valandą cron'e (`materialize-recurring-sessions.ts`, 60 d. langas, bulk insert). Pakeitus slotą / narius / mokytoją būsimos negeneruotos-neįvykusios pamokos **perkeliamos** (senos `active` be join'ų trinamos), ne dubliuojamos. DELETE ištrina ir būsimas grupės pamokos eilutes (FK tik NULL'ina `class_group_id`). Rankinis vienos pamokos perkėlimas kalendoriuje grupės pamokai **nesilaiko** — cron grąžins į slotą |
| `school_lesson_recordings` | Adminas `/school/recordings` kiekvienai grupei arba aktyvaus individualaus pasikartojančio dalyko auditorijai priskiria privatų Drive aplanką (`school_recording_drive_folders`: tik vienas iš `group_id` / `subject_id`). Tie patys įrašai rodomi `/recordings`, `/student/recordings`, `/parent/recordings` ir HMAC namų darbų puslapyje. `api/school-lesson-recordings.ts` tikrina rolę / gyvą auditoriją ir išduoda trumpalaikį bilietą + `HttpOnly` peržiūros sesiją; `api/school-lesson-recording-stream.ts` dar kartą tikrina gyvą prieigą, aplanko tėvą ir 30 d. terminą, tada proxina Drive baitų intervalą. Service-account JSON tik `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64` serveryje. |
| `school_join_no_show` | `api/school-join-no-show.ts` kas 5 min — online pamoka, mokinys per ~10 min nepaspaudė Join, **mokytojas prisijungė**. Tik DB `no_show` + `no_show_reason=missed_join`. **Ne** kviečia `notify-session-no-show`. `auto-complete-sessions` tokias pamokas praleidžia, kad cronas spėtų pažymėti. |

**Nepatvirtintas lankomumas (Apžvalga / Užsiėmimai / Statistika):** `schoolActivitySummary.unconfirmedStudents` skaičiuoja tik vaikus, kurių sistema nematė prisijungiant prie vykusio online užsiėmimo, o mokytojas dar nepatvirtino (`isUnconfirmedDetectedStudentAbsence`: cron `missed_join` be `status_confirmed_at`, arba `student_joined_at` tuščias ir `tutor_joined_at` yra). Pasibaigę, bet niekada nepažymėti užsiėmimai be join įrodymų (pvz. prieš mokyklos startą 09.07) į šį skaičių **nepatenka**, kad administracija galėtų prašyti mokytojų patvirtinti realius neatvykimus. **KPI suderinimas:** Apžvalga, Užsiėmimai ir Statistika naudoja **einamąjį mėnesį** (`currentMonthStatsDateRange`); „Įvyko“ org su privalomu patvirtinimu skaičiuoja ir DB `completed` (`countStoredCompleted`), ne tik patvirtintus vaikus. Lankomumo % skaičiuojamas tik iš patvirtintų dalyvavimų + neatvykimų; nepatvirtinti į procentą neįeina.

**Grupės priminimai mokytojui:** `api/send-reminders.ts` siunčia vieną laišką vienam grupės užsiėmimo laikui, nors `sessions` turi po eilutę kiekvienam mokiniui. Po sėkmės visos tos grupės/laiko eilutės pažymimos `reminder_tutor_sent`; studento, tėvų ir mokytojo priminimai dar turi Resend idempotency raktus nuo persidengiančių cron paleidimų. Tėvų priminimai grupėje eina greta (`api/_lib/sessionReminderQueue.ts`), o cron vienu paleidimu gali išsiųsti iki 1000 laiškų (+ burst vienai grupei), kad nepraleistų dalies mokinių toje pačioje pamokoje.

**Grupės kaina ir sustabdymas be laiško tėvams:** materializuojant klasės grupės užsiėmimus `sessions.price` imama iš patvirtintos papildomų užsiėmimų sutarties `unit_price_eur` (jei eilutė dar su kaina 0, kitas suderinimas ją užpildo; ranka įrašyta nenulinė kaina lieka). Kai grupė sustabdoma, nes aktyvių mokinių liko mažiau nei minimumas, sutartys pristabdomos, bet šeimoms `school_group_suspended` laiškas nesiunčiamas: tai vidinis perskirstymas, kol pasirašomos kitos sutartys. **Admin UI `/school/groups`:** `GET /api/school-class-groups` prideda `extra_lessons_contracts`; kortelė ir redagavimo modalas rodo kiekvieno nario būseną (`sutartis pasirašyta` / `laukia tėvų patvirtinimo` / `be sutarties pasiūlymo`) ir aiškų sustabdymo paaiškinimą pagal dabartinį `minimum_active_students`, ne seną `suspension_reason` tekstą (`schoolGroupMemberActivation.ts`, `CompanyClassGroups.tsx`). Nuolaidos priedai (`school_discount_agreements`) rodomi prie atitinkamos sutarties kortelės su būsena (laukia / patvirtinta / nebegalioja / atšaukta).

**Faktinis lankomumas be patvirtintos papildomų pamokų sutarties:** mokytojas gali pažymėti pasibaigusio grupės užsiėmimo lankomumą ir mokiniui, kuriam dėl nepatvirtintos sutarties nėra `sessions` eilutės. `api/school-group-attendance.ts` tikrina mokytoją, organizaciją, grupės narystę ir tikrą užsiėmimo laiką; toks faktas saugomas atskirai nuo pamokų materializavimo, sutarčių patvirtinimo ir sąskaitų (`school_group_attendance_attestations`, migracija `20260930105900_school_group_attendance_attestations.sql`). Kalendoriuje rodoma „Sutartis nepatvirtinta“, o mokyklos Apžvalgoje - istorinis pranešimas apie dalyvavimą be patvirtintos sutarties. Vėlesnis sutarties patvirtinimas šio fakto nepanaikina. Esamų `sessions` eilučių lankomumas žymimas per `confirm-session-status`.

**Mokytojo lankomumo žymėjimas (tik kalendorius):** pasibaigus grupės ar individualiam užsiėmimui mokytojui `/calendar` automatiškai atsidaro vienas lankomumo langas (grupės modalas arba atskiras „lankomumo“ įrašas be `sessions` eilučių). Kiekvienam vaikui rodomas automatinis prisijungimo signalas (`student_joined_at` / `deriveAttendance`) ir trys rankiniai pasirinkimai: **Patvirtinti dalyvavimą**, **Vėlavo**, **Nedalyvavo**. Vaikams su `sessions` eilute naudojamas `confirm-session-status` (`completed` / `completed_late` / `no_show`); be eilutės – `school-group-attendance` atestacija. UI: `SchoolGroupRosterAttendanceControls.tsx`, `schoolAttendanceUi.ts`, `schoolAttendanceCopy.ts`. Dubliuotų mygtukų grupės modale ir prieš pamokos pabaigą nebėra.

**Testai:** `tests/pages/company-class-groups.test.tsx`, `tests/lib/school-class-groups-recordings.test.ts`, `tests/lib/school-join-no-show.test.ts`.

### Tėvų informavimas (portalas vs el. paštas)

Tėvų paskyra (`/parent/*`, `parent_profiles` + `parent_students`) **nėra** atskiras pranešimų inbox. Neatvykimas / pamokos statusas matomas, kai tėvas pats atidaro dashboard / pamokas / kalendorių.

Dauguma laiškų eina į **`students.payer_email`** (mokėtojas), ne būtinai į prisijungusio tėvo Auth el. paštą.

| Įvykis | Ar pingina tėvą / mokėtoją? |
|--------|------------------------------|
| Cron `school_join_no_show` (nepaspaudė Join) | **Ne.** Tik statistika / `no_show`. |
| Korep arba org admin **rankiniu** pažymi `no_show` (kalendorius, dashboard, `CompanySessions`, mokinių kortelė) | **Taip**, el. paštas `session_student_no_show` į `payer_email`, jei pamokos `end_time` jau praėjo. Push **nėra**. `CompanyTvarkarastis` šio API **nekviečia**. |
| Prieš pamoką (tas pats langas kaip mokinio priminimas) | El. paštas + push `session_reminder_payer`. Default: tik jei `payment_payer === 'parent'`. **Mokyklos org** (`students.organization_id` → `entity_type='school'`): visada `payer_email` + `parent_secondary_email`, be paskyros — laiške `schoolFlow: true` → tik „Prisijungti prie užsiėmimo“ (tracked join link), be portalo mygtuko ir be užuominų apie paskyrą. Flag `flexible_invitations`: mokėtojas + antras tėvas + susietos `parent_profiles`. Opt-out: `parent_profiles.disable_lesson_reminders` / `/parent` nustatymai. |
| Mokinys pats atšaukia | El. paštas + push `session_cancelled_parent` į `payer_email` (jei kitoks nei mokinio). Korep/admin atšaukimas tėvų atskiro laiško nesiunčia. |
| Mokėjimai, paketai, school įmokos, extra-lessons, sutartys | El. paštas (dalį ir push) į `payer_email`. |
| Chat | Push `chat_new_message`, jei PWA. |

**Failai:** `api/notify-session-no-show.ts`, `api/send-reminders.ts`, `api/cancel-session.ts`, `api/send-email.ts` (`session_student_no_show` / `session_reminder_payer` / `session_cancelled_parent`), `api/_lib/sendPush.ts`, `src/pages/ParentSettings.tsx`, `ParentDashboard.tsx`.

### Mokytojų sutartys (committed WIP — nedeployinti į prod)

Failai **yra** git'e (`9fe5009`), bet srautas **neužbaigtas**:
- `CompanyStaffContracts.tsx`, `src/lib/schoolContractParty.ts`, `api/school-contract-teacher-invite.ts`, migracija `20260821150000_school_teacher_contracts.sql`
- Planuojama eiga: įkelti PDF → mokykla GoSign → invite → mokytojas `/school-sign`
- **Dar neprijungta:** `CompanyStaffContracts` neimportuotas į `CompanyContracts` / `App.tsx`; `SchoolSign.tsx` neturi `teacher` rolės; `school-contract-teacher-invite.ts` importuoja `isTeacherContract` / `inviteTeacherToSign` iš `schoolContractSigning.ts`, kurių ten **nėra**. Migracijos **ne** stumti į prod, kol WIP neužbaigtas.

**Company view** (ne-school): senesni 3 filtrai (`all` / `unsigned` / `signed`) — pill mygtukai.

**API flow:**
1. Admin sukuria sutartį → PDF generuojamas (`api/_lib/schoolContractPdf.ts`)
2. Siunčiama tėvams → `/school-sign`
3. GoSign callback → `school-contract-sign-callback.ts`
4. Reconcile cron (kas minutę) → `school-contract-sign-reconcile.ts`
5. Užbaigimas → `school-contract-complete.ts`

**DOCX→PDF:** `services/docx-converter/` (Railway) arba ConvertAPI fallback (`CONVERTAPI_SECRET`).

### Mokėjimai (įmokos)

**UI:** `src/pages/company/CompanyPayments.tsx`
- „Naujas grafikas“ — pasirink pasirašytą sutartį, padalink sumą į įmokas
- **Svarbu UX:** sumų laukų placeholder `100.00` — tai **ne** reikšmė. Reikia įvesti sumą arba spausti „Padalinti lygiai“ **po** sutarties pasirinkimo
- Siųsti mokėjimo nuorodą / pažymėti rankiniu kaip apmokėta

**Duomenų hook:** `src/hooks/useSchoolPaymentsData.ts` — cache key `company_payments`

**Mokėjimo vartai:** `src/lib/schoolContractPaymentGate.ts` — mokėjimai leidžiami tik `signing_status === 'signed'`

**Stripe:** `api/pay-school-installment.ts` (viešas linkas mokėtojui) → webhook `stripe-webhook.ts`

### Mokiniai (school view)

**UI:** `src/pages/company/CompanyStudents.tsx` (`isSchoolView` pagal `organizations.entity_type`)

**Filtrai** (antra eilutė — horizontali juosta):
| Filtras | Laukas / logika |
|---------|-----------------|
| Klasė | `students.grade` (text, pvz. `"5 klasė"`) |
| Mokslo metai | `students.school_year` (`2026/2027`…) — `suggestSchoolYear()` |
| Statusas | `enrollment_status`: `active` (numatyta) / `future` / `left` / `graduated` |
| Skola | rankinis `has_debt_manual` **arba** neapmokėtos įmokos / mėnesinės S.F. (`studentHasDebt()`) |
| Sutartis | `contractsByStudent` — `signed` / `pending` / `none` (metinės + extra-lessons) |
| Atvaizdas | `students.media_publicity_consent` — `agree` / `disagree` / NULL |
| Savivaldybė | `students.municipality` (`ltMunicipalities.ts`) |

Išėję / baigę (`left`, `graduated`) — archyvas (šiukšlinė), ne pagrindinis sąrašas. Logika: `src/lib/schoolStudentEnrollment.ts`. Extra-lessons pasiūlymą galima atidaryti ir iš mokinio kortelės.

**Mokinio info dialogas:** `max-w-3xl` (arba `max-w-5xl` jei tvarkaraščio juosta); desktop **MOKINYS | MOKĖTOJAS** du stulpeliai.

**Load / auth:** nenaudok `supabase.auth.getUser()` kiekviename puslapio mount — lock race su Strict Mode palieka amžiną spinnerį. Sesija per `UserContext` + `src/lib/authSession.ts` (`getSession` cache). `preload.ts` / `useOrgFeatures` eina per tą patį helperį.

**Excel eksportas:** `schoolStudentsExport.ts` + `schoolStudentsXlsxExport.ts` — mokinys, klasė, mokslo metai, statusas, sutikimas, sutarties statusas, mokėtojas, kontaktai. Surūšiuota pagal `parseStudentGrade()`.

**Layout:** 1 eilutė — pavadinimas + Šiukšlinė / Pridėti mokinį; 2 eilutė — filtrai + paieška + Excel.

**Pamokos rezervavimas iš kortelės / naujo mokinio formos** (`student_card_booking`, Pro Klasė intake — „Ieškoti pagal laisvą laiką“):
1. `FindTutorModal` grąžina visą `MatchSlot` (ne tik tutor id).
2. Langas rodomas formoje / kortelėje (`PickedAvailabilityTimeEditor`) — data užrakinta, **pradžia/pabaiga redaguojamos minutėmis** rėmuose.
3. Esamo mokinio kortelėje `FindLessonBookDialog` `variant="inline"` (ne antras overlay). 15 min. select nebėra.
4. Naujam mokiniui: išsaugant įrašomas `preferred_availability` iš lango ir sukuriama pamoka patikslintu laiku (`runOrgAdminCreateSession`).
5. **Kainos prioritetas** (`studentLessonPricing.ts` → `resolveOrganizationLessonPrice`): **individuali** (`student_individual_pricing`, su `tutor_id`) > org **dinaminė** (klasė + pamokų sk./sav.) > dalyko / tutor fallback. Taikoma `FindLessonBookDialog`, naujo mokinio / sibling pamokų kūrime (`CompanyStudents`) ir org kalendoriuje (`CompanyTvarkarastis`). **Bandomoji** (vienkartinė arba `createFirstLessonIsTrial`) visada org `trial_lesson_price_eur` — individuali jos neperrašo.

**Failai:** `src/lib/pickedAvailabilityTime.ts`, `src/lib/studentLessonPricing.ts`, `src/components/company/PickedAvailabilityTimeEditor.tsx`, `FindLessonBookDialog.tsx`, `FindTutorModal.tsx`. Testai: `tests/lib/picked-availability-time.test.ts`, `tests/lib/student-lesson-pricing.test.ts`.

### Buhalterijos suvestinė ir eksportas

**UI:** `src/pages/company/CompanySchoolFinanceReport.tsx`  
**Hub:** `src/pages/company/CompanyFinanceHub.tsx` (tab `report`)

**Logika:**
- `src/lib/schoolFinanceExport.ts` — eilutės, filtrai, suvestinė, CSV helper
- `src/lib/schoolFinanceXlsxExport.ts` — ExcelJS workbook su dviem lapais:
  - **Suvestinė** — suformatuota (sekcijos, rėmeliai, € formatas)
  - **Mokėjimai** — detali lentelė su autofilter

**Testai:** `tests/lib/school-finance-export.test.ts`

### Visų organizacijų korepetitorių finansų privatumas

**Privaloma finansų privatumo taisyklė (2026-10-01 incidentas):** organizacijos korepetitorius mato tik savo atlygio suvestinę ir savo korepetitorius → organizacija sąskaitas. Klientų / tėvų sąskaitų, sumų, apmokėjimo būsenų ir PDF jam neatskleisti. `issued_by_user_id` **nėra** sąskaitos savininko įrodymas: automatinis klientų billing jame įrašo korepetitoriaus ID. Pamokų priklausymas korepetitoriui taip pat nesuteikia prieigos prie klientų finansų.

Atlygio sąskaitos žymimos `invoices.pdf_meta.invoiceKind = 'tutor_pay'` ir `tutorId` (atlygio gavėjo Auth ID). Autoritetinga UI / API patikra: `src/lib/orgTutorInvoiceAccess.ts`; DB / priedų apsauga: `20261001134513_org_tutor_invoice_privacy.sql` (restriktinės RLS sąskaitoms, eilutėms ir Storage PDF). Taisyklė taikoma **visoms organizacijoms**. Neklasifikuota / dviprasmiška sąskaita korepetitoriui nerodoma. Administratoriaus išrašyta korepetitoriaus atlygio sąskaita matoma tik tam atlygio gavėjui. Duplikatų / sąskaitos kūrimo patikros taip pat negali grąžinti kliento sąskaitos numerio ar sumos. Užklausų deduplikavimas privalo atskirti prisijungimo sesijas.

Keičiant billing arba tutor finansus būtina paleisti `tests/api/org-tutor-invoice-access.test.ts`, `tests/db/org-tutor-invoice-privacy.test.ts`, `tests/lib/org-tutor-invoices-deduped.test.ts` ir tutor finansų / sąskaitų regresijas. Į produkciją pirmiausia taikyti šią DB migraciją, tada API/UI pakeitimus; be migracijos senos atlygio sąskaitos saugumo sumetimais bus paslėptos.

Vizuali regresija: `tests/browser/org-tutor-invoice-privacy/README.md`. Atskirame lokaliame Vite įėjime naudojami tikri finansų / sąskaitos kūrimo komponentai ir sintetiniai duomenys. Tikrinti Pro Klasė, naują company ir school su išjungtais feature flag'ais, desktop ir mobile: klientų / kito korepetitoriaus SF nerodomos, savo PDF ir SF kūrimas veikia, kliento SF neblokuoja atlygio SF, tikras savo atlygio duplikatas blokuojamas. Šis QA įėjimas negali patekti į produkcijos buildą.

### Pro Klasė org_tutor (company org `isProKlaseOrg()`)

**Org ID:** `3422031d-6e21-424d-980b-35a9c6d7b8f1` (`src/lib/marketMoney.ts`)

| Sritis | Failai / pastaba |
|--------|------------------|
| Korep atlygis | `src/lib/proKlaseTutorPay.ts`, `api/_lib/proKlaseTutorPay.ts` — įvyko=valandinis, bandomoji=10€, no_show=6€ |
| Baudos | `tutor_adjustments` lentelė, `api/tutor-adjustment.ts`, admin UI `CompanyTutors.tsx` |
| Sąskaitos | `api/generate-invoice.ts` — Pro Klasė line items + adjustments |
| Korep finansai | `OrgTutorFinanceSummary.tsx` — breakdown UI |
| Statusai po pamokos | `tutor_lesson_status_confirmation` — Įvyko / Neatvyko; Atšaukti tik admin. Pro Klasės admin apžvalgos „Reikia dėmesio“ lankomumo eilutė rodo **„Korepetitorius nepažymėjo, kad įvyko pamoka“** (ne school join logika). Rankinis priminimas korep.: `POST /api/remind-tutor-session-status` (el. paštas, tas pats template kaip cron `lesson-status-confirmation-reminders`; cooldown 1 val.). |
| Korep negali | atšaukti (`cancel-session`), trinti (`delete-session`); **ne** gali rankinio „Palikti laisvą laiką“ atšaukiant/perkeliant (`hideProKlaseOrgTutorFreeTime`) — bet **gali** kurti laisvą laiką per kalendoriaus slot drag |
| Komentarai | privalomi po kiekvienos pamokos; cron `api/proklase-lesson-comment-reminders.ts` |
| Mokinio kortelės pastabos | `StudentNotesFields` / `StudentNotesCard`: administracijos komentarai ir paskutinio kontakto data saugomi tik adminams prieinamoje `student_admin_notes`; atskiras komentaras korepetitoriui lieka `students.admin_comment` su `admin_comment_visible_to_tutor=true`. `save_student_notes` RPC atominiu būdu atnaujina visus to paties vaiko priskyrimus. Migracija `20260930130513_student_private_admin_notes.sql` būtina prieš web pakeitimų publikavimą; seni privatūs komentarai išsaugomi, o naujas korepetitoriaus priskyrimas paveldi pastabas. |
| Mokinio registracijos kvietimas | `api/send-email.ts`: organizacijos kvietimo tekstas naudoja jos `features.public_name` / `name`, nepriklausomai nuo logo flag'o. Solo kvietimas lieka korepetitoriaus vardu. |
| Žinučių gavėjo paskyra | „+“ rodo ir neprisiregistravusius mokinius su paaiškinimu; pokalbis galimas tik su `linked_user_id`. Vienodas vardas arba mokėtojo paštas nėra leidimas automatiškai susieti skirtingus mokinio el. paštus. |
| Kompensacinė pamoka | `sessions.is_makeup`, admin create `CompanyTvarkarastis.tsx` |
| Pirmoji bandomoji serijoje | Bendras org admin kūrimas `orgAdminSessionCreate.ts` (ne tik Pro Klasė): tik ankstyviausia serijos pamoka. Bandomasis dalykas imamas tik jei pavadinimas sutampa su org `trial_lesson_topic` (kitaip kuriamas naujas). Po įrašymo ta viena pamoka užrakinama org bandomąja kaina, tema ir trukme. Likusios lieka įprastu dalyku ir kaina. Jei formos tema sutampa su bandomosios tema, kitoms rašomas dalyko pavadinimas. Korepetitoriaus kalendoriuje bandomoji lieka vienkartinė: pasikartojimas su ja nejungiamas. |
| Complimentary (nemokama) | `sessions.is_complimentary` — klientui vis tiek „įvyko“, bet **0 € pajamoms / paketui / mokėtojo S.F.**; korepetitoriui mokama pagal įprastas atlygio taisykles (bandomoji = 10 €); API `mark-session-complimentary.ts`, UI `CompanySessions` / `CompanyTvarkarastis` |
| PVM pastaba ant S.F. | `api/_lib/proKlaseInvoice.ts` — `PVM neapmokestinama pagal LR PVMĮ 22 str.` kai Pro Klasė yra pardavėjas |
| Legal PDF | `src/lib/proKlaseLegal.ts` — `public/legal/proklase-paslaugu-teikimo-salygos.pdf`, `proklase-privatumo-politika.pdf`; tėvų registracijoje privalomas abu checkbox (`parentLegalAcceptanceMissing`) |
| Neapmokėto paketo redagavimas | `pendingPackageEdit.ts` — 7 d. langas, tik `pending`; API `update-pending-package.ts` (expirina seną Stripe checkout), `resend-package-email.ts`. QA seed: `scripts/seed-proklase-package-edit-qa.mjs` |
| Neapmokėti pooled mėnesio paketai | `expire-packages` cron **ne**expirina `paid=false` eilutes — skola lieka mokama. `pay-package` / `sendPendingPackageEmail` reaktyvuoja legacy `expired` → `pending` (`src/lib/pooledPackageOverdue.ts`). Admin Apžvalga: `?summary=overdue-packages` + priminimas (`resend-package-email`). UI žymė **Vėluoja** kai `billing_period_end` praeityje. |
| Tutor no-show | admin cancel su `cancellation_reason_code=tutor_no_show` → −30€, paketas grąžinamas |
| Dalykai / klasės prie vardo tvarkaraštyje | `profiles.teaching_notes` (redaguojama `CompanyTutors` → „Dalykai ir klasės“); `/company/schedule` filtre rodoma `TutorTeachingNotesBadge` (pvz. „MAT 1-12“). Ta pati pastaba jau rodoma `FindTutorModal` ir korepetitorių sąraše. |

**Testai:** `tests/lib/proKlaseTutorPay.test.ts`, `tests/api/proklase-invoice.test.ts`, `tests/lib/session-complimentary.test.ts`, `tests/lib/proklase-legal.test.ts`, `tests/lib/pending-package-edit.test.ts`, `tests/api/update-pending-package.test.ts`, `tests/pages/company-tvarkarastis-teaching-notes.test.ts`

### Mano Korepetitorius — atlygis pagal dalyką

**Org ID:** `2c4e4c2a-4e12-44ca-b327-d605bbb0d50b` (`isManoKorepetitoriusOrg()` `src/lib/marketMoney.ts`)

Numatytasis atlygis lieka `profiles.company_commission_percent` (€ / pamoka). Papildomai admin gali nustatyti tarifą **pagal dalyką** korepetitoriaus modale (`CompanyTutors.tsx`): tuščias laukas = numatytasis. Override'ai — `profiles.company_commission_by_subject` (`subject_id` → EUR).

**Svarbu:** taikoma **tik** šiai org. Pro Klasė ir kitos įmonės naudoja vieną tarifą (Pro Klasė — atskiras `proKlaseSessionPayEur`: bandomoji / no-show). Skaičiavimas: `orgTutorSessionPayEur()` / `sumOrgTutorLessonsPayEur()` (`src/lib/orgTutorLessonPay.ts`) — sąskaitos (`generate-invoice.ts`, `CreateInvoiceModal`), statistika, `OrgTutorFinanceSummary`.

**Statistika vs tvarkaraštis:** bendra taisyklė `companyConductedSessionOptions()` (`orgTutorConductedSessions.ts`) — `includeEndedActive` tik company org be rankinio patvirtinimo (MK, kitos agentūros); **ne** school, **ne** Pro Klasė, **ne** `tutor_lesson_status_confirmation`. Naudoja `CompanyStats`, `CompanyTutors`, `preload` stats/dashboard. Sąskaitos (`generate-invoice`) vis tiek ima tik `completed`/`no_show` — teisinga finansine prasme; cron 90 d. lookback užbaigia praleistas eilutes. Kalendorius / `/company/sessions` chip'ai jau seniau skaičiavo `active`+praėjęs `end_time` (`session-stats.ts`). 2026-10-06 prod: 8 MK rugsėjo `active` eilutės backfill'intos į `completed`.

**Testai:** `tests/lib/org-tutor-lesson-pay.test.ts`, `tests/lib/org-tutor-conducted-sessions.test.ts`. Migracija: `20260902190000_tutor_pay_by_subject.sql`.

**MK mokėtojo mėnesinės S.F. (`pvm_education_invoice`, Finansai → Siųsti sąskaitas):** vienas **Stripe mokėjimas** mokėtojui (`payer_email`), bet **viena PVM S.F. kiekvienam vaikui** (ne dalykui, ne `students.id` eilutei). Tas pats vaikas su keliais dalykais / korepetitoriais → viena S.F. su visomis pamokomis „Pamokų detalizacija“ lentelėje (dalykas, kaina, data). Du vaikai, vienas mokėtojas → dvi S.F. priedai, vienas mokėjimas. `CompanyFinance` siunčia **vieną** `POST /api/create-monthly-invoice` su `organizationId` + visais `sessionIds` (ne ciklas per korepetitorių). Grupavimas: `groupSessionsByStudentIdentity()` / `orgStudentIdentityGroupKey` (`pvmEducationInvoice.ts`, `generate-invoice.ts`). **Atsisiuntimo pavadinimas (MK):** `MK Nr. 1649 (2026-08-31).pdf` — `formatInvoiceDownloadFilename()` (`invoiceDownloadFilename.ts`); taikoma `/api/invoice-pdf` Content-Disposition, ZIP eksportui, el. laiško priedams (`create-monthly-invoice`, `resend-monthly-invoice`). **Masinis eksportas:** `CompanyInvoices` / solo `Invoices` — checkbox pasirinkimui + „Pasirinkti visus“ + **„Atsisiųsti pasirinktas“** → vienas ZIP (`downloadInvoicesZip.ts`, `fflate`), ne po vieną PDF. Testai: `tests/lib/pvm-education-invoice.test.ts`, `tests/api/create-monthly-invoice-delivery.test.ts`, `tests/lib/invoice-download-filename.test.ts`.

**Mokyklų mokytojų atlygis ir sąskaitos:** mokytojo atlygis yra atskiras nuo vaikų sutarties kainos ir `sessions.price`. Grupės vaikų `sessions` eilutės nėra atskiri mokytojui apmokami užsiėmimai. `schoolTutorPayOccurrences()` / `sumSchoolTutorPayEur()` (`src/lib/schoolTutorLessonPay.ts`) skaičiuoja **vieną atlygį už pravestą užsiėmimą**, ne už mokinių skaičių. Tas pats skaičiavimas: mokytojo kortelė, Finansai, mokytojo S.F. ir `/school/stats`. Grupiniam užsiėmimui taikomas `profiles.company_commission_percent`; individualiam — `company_individual_commission_percent` (tuščias naudoja grupinį). **Laisvi vaikai + Demo Mokykla:** kanoninis **45 € / užsiėmimas** (`LAISVI_VAIKIAI_DEFAULT_TUTOR_PAY_EUR`, `resolveSchoolTutorGroupPayRate()`); keičiama per `CompanyTutors` / org numatytąjį `CompanySettings`. Migracija `20261001120000_laisvi_vaikai_tutor_pay_45.sql` nustato 45 € aktyviems mokytojams prod/test DB. Istorinis `tutor_pay_eur_snapshot` turi pirmenybę. Jei snapshot'ai nesutampa — reikia admin peržiūros prieš sąskaitą. Migracija `20261001100000_school_teacher_individual_pay.sql`.

**Mokytojo suvestinių laikotarpiai:** administratoriaus mokytojo kortelė apima paskutinius 12 mėnesių ir rodo konkrečias laikotarpio datas. Mokytojo Finansai ir `/school/stats` apima pasirinktą mėnesį arba datų intervalą. Lyginant sumas reikia sutapatinti laikotarpį; visur grupės užsiėmimas skaičiuojamas vieną kartą.

**„Laisvų vaikų“ įvykimo patvirtinimas:** `src/lib/sessionStatusConfirmation.ts` šiai organizacijai visada reikalauja mokytojo arba administratoriaus rankinio rezultato patvirtinimo, net jei `tutor_lesson_status_confirmation` DB flag'as nenustatytas. `auto-complete-sessions` tokių užsiėmimų nebaigia pagal laiką. Kalendoriuje / KPI seni `completed` / `no_show` be `status_confirmed_at` vis dar rodomi kaip laukiantys patvirtinimo. **Mokytojo atlygis** `completed` statusą jau laiko pravestu užsiėmimu (be žymos); nepatvirtintas `no_show` į atlygį nepatenka. **Mėnesinės S.F. peržiūra** billing API reikalauja `sessions.subject_id` eilutėje (be jo sąskaitos eilutė neformuojama) ir `hasSchoolOccurrenceEvidence()` (gyvų grupių `completed` rankinis patvirtinimas turi turėti `status_confirmed_by` ir tinkamą `status_confirmed_at >= end_time`). `resolveSchoolInvoiceUnitPrice()` ima `sessions.price`, tada pasirašytos / `sent` extra-lessons kainą; grupėms negrįžta į klaidingą `subjects.price`. **Grupėms** rodomas grupės / sutarties pavadinimas, ne istorinis `subjects.name` su kito vaiko vardu (`schoolInvoiceSessionActivityName`). **Individualiems** — pasirašytos sutarties `service_name`, o jei pamokos `subject_id` klaidingas, fallback pakeičia paskutinį vaiko vardą eilutėje. Laisvi vaikai naudoja atskirus dalykus „… (individuali) Vardas Pavardė“; neteisingas `subject_id` (pvz. Domas → Nojus dalykas) rodydavo svetimą vardą sąskaitoje — tikrinti per `sessions` + `subjects.name`. Dubliuoti `students` įrašai (tas pats vaikas, skirtingi `invite_code`) gali skirti sutartis nuo pamokų. 2026-09 prod DB backfill: `status_confirmed_at = end_time`; `price`/`subject_id` iš sutarties. KPI „Nepatvirtintas lankomumas“ vis tiek naudoja tik sistemos matomus neatvykimus, ne visą nepažymėtą istoriją.

**Darbuotojų dokumentai (`school_staff_documents`, Laisvi vaikai + Demo Mokykla QA):** `/school/staff-documents` → `CompanyStaffDocuments.tsx` + `api/school-staff-documents.ts`. Org allowlist: `isStaffDocumentsOrg()` (`marketMoney.ts`) — prod VšĮ Laisvi vaikai ir Demo Mokykla (`c3a00000-…0001`); reikia ir `school_contract_esign`. **Admin UI:** numatytas pasirinkimas „Darbuotojas pats užpildys“ (adreso/asmens kodo laukų nėra); „Įrašysiu dabar“ rodo abu laukus privalomai. **Kūrimas:** pirma įrašomi abu dokumentai, jei adminas įrašė adresą ir asmens kodą — privatus `staff-personal-details.json` (ne DB), tada siunčiamas sutikimo laiškas, **tada** fone ruošiamas PDF. Converter gedimas / timeout **nebepraranda** darbuotojo ir laiško: susitarimas lieka `draft` be `pdf_url`. **Sutikimo GET** (`/school-staff-consent`) **nekonvertuoja PDF** — forma atsidaro iš karto. Jei mokykla jau įrašė adresą/kodą, laukai nerodomi (`detailsHeldBySchool`); asmens kodas į naršyklę ir DB **nėra** siunčiamas. Jei mokykla paliko tuščius — darbuotojas pildo formoje, PDF generuojamas tik POST. **Sutikimo POST** (`school-staff-consent`) **iš karto** įrašo `staff_consent_answers`, tada best-effort `staff-personal-details.json` (bucket turi leisti `application/json`), grąžina `{ ok: true }` ir rodo sėkmės ekraną; PDF generuojamas fone per `waitUntil` su 3 bandymais. **Susitarimo PDF įrašomas į DB prieš sutikimo PDF**, kad Vercel 300 s limitas galėtų užbaigti bent dalį ir cron tęstų tik sutikimą. Jei fone nepavyksta — darbuotojas vis tiek mato sėkmę; admin sąraše „Ruošiamas PDF (atsakymai gauti)“, o `school-staff-consent-pdf-retry` cron kas 5 min. (ir valandinis `school-staff-document-retention`) bando užbaigti likusius PDF. Po visų bandymų (POST fone arba cron) vienas kartą siunčiamas `school_staff_consent_pdf_failed` laiškas į `alaniukasa@gmail.com` (`staffConsentPdfFailureAlert.ts`, žymė `staff-consent-pdf-alert.json`). **Numatyta PDF:** Tutlio sugeneruoja konfidencialumo susitarimą su priedu iš DOCX šablono (`renderStaffDocumentPdf`, `STAFF_DOCX_TIMEOUT_MS=120s`, du DOCX iš eilės, prieš konversiją laukia kol Railway converter `pending=0`). `{{pasirašymo data}}` užpildoma generavimo diena (`formatStaffSigningDate`, lt-LT, Europe/Vilnius). Pasirinktinai galima įkelti savo PDF vietoj šablono. Datos laukas naudoja bendrą `DateInput` kalendorių. **Lokalus PDF:** reikia `DOCX_CONVERTER_URL` + `DOCX_CONVERTER_API_KEY` (Railway) arba LibreOffice; bendras stage converter kartais grąžina `503 Converter busy` / `422` dideliam ~2 MB šablonui.

### Complimentary pamokos (ne tik Pro Klasė)

Admin gali pažymėti pamoką nemokama (`compSess.markComplimentary`). Nemokama reiškia nemokama tik klientui: klientas / pajamų statistika neskaito kainos (`sessionClientRevenueEur()`), o korepetitoriui mokama pagal įprastas atlygio taisykles (pvz., Pro Klasės bandomoji lieka 10 €). Pažymėjus kaip neapmokėtą complimentary nuimamas.

**Failai:** `src/lib/sessionComplimentary.ts`, `src/lib/setSessionComplimentary.ts`, `api/mark-session-complimentary.ts`, migracija `20260819120000_sessions_is_complimentary.sql`.

### PVM sąskaitos ir atominė numeracija

Kai org turi `pvm_education_invoice`: S.F. layout `pvm_education`, pastabos pagal PVMĮ 22 str., serija **atominiu** `allocateInvoiceNumber()` (be lenktynių tarp dviejų adminų). Išoriniai numeriai: `/api/reserve-invoice-number`, UI `CreateInvoiceModal` / `CompanyInvoices` („Užimti numerį“).

**Failai:** `api/_lib/invoiceNumber.ts`, `api/_lib/pvmEducationInvoice.ts`, `api/reserve-invoice-number.ts`. Testai: `tests/lib/pvm-education-invoice.test.ts`.

### Capacity ~1000 aktyvių vartotojų (`394dbf7`)

Chat nenaudoja „visi klausosi visų lentelių“: privatūs Broadcast topic'ai (`user:{id}:inbox`, `conversation:{id}:messages`), evente tik ID, turinys per RLS. Istorija — 100 + cursor. Cron'ai bounded (primitimai, school įmokos, 100 recurring šablonų/val.). Migracijos `20260825171242_capacity_chat_broadcast.sql`, `20260825171248_capacity_background_jobs.sql`. Runbook: `docs/CAPACITY_1000_USERS_RUNBOOK.md`. k6: `scripts/load/k6-capacity.js` — **nedrįsk** leisti į `tutlio.lt/.pl/.com`.

**Testai:** `tests/lib/chat-capacity.test.ts`, `tests/lib/capacity-hardening.test.ts`, `tests/api/send-reminders-capacity.test.ts`, `tests/api/school-installment-reminders-capacity.test.ts`, `tests/api/materialize-recurring-capacity.test.ts`.

### Tutor quiz ir įterpta prenumerata

Viešas funnelis `/quiz` (audience `solo` \| `company` \| `school`). Lead'ai per `api/landing-lead.ts` + migracija `20260816095628_quiz_lead_context.sql`. Assetai `public/quiz/**` — **ne** PWA precache (`vite.config.ts` `globIgnores`).

`/pricing` naudoja Stripe Embedded Checkout (`TutorPlanCards.tsx`, `create-subscription-checkout.ts` su `ui_mode: embedded`).

Quiz i18n **tik** `lt.ts` + `en.ts` (`tests/lib/i18n-coverage.test.ts` quiz raktus išskiria). Kiti nauji UI raktai — visos 13 kalbų, kitaip krenta coverage.

**Testai:** `tests/lib/quiz-funnel.test.ts`, `tests/pages/quiz-funnel.test.tsx`, `tests/api/landing-lead-quiz.test.ts`, `tests/api/create-subscription-checkout.test.ts`.

### Viešas AI support ir produktų žinios

Viešas widget `src/components/support/SupportWidget.tsx` (lazy `App.tsx`) — tik svečiams, ne sesijos vartotojams. Streamina atsakymus iš `gpt-5.6-luna` per `POST /api/support-chat`. Kontaktų lapas → `POST /api/support-contact` (Resend į `INTERNAL_NOTIFY_EMAILS` `api/_lib/resendConfig.ts`).

**Architektūra (sutrumpinta):** Luna pirma parenka vieną iš 8 product area + 0–3 viešus puslapius iš allowlist `src/lib/supportPageSuggestions.ts`. Antras kvietimas gauna **tik** tą area (ne visą „brain“). Purchase CTA („Noriu Tutlio“) tik kai selector sako aiškų pirkimo intentą — nuoroda visada į lokalizuotą `/pricing`, modelis negali sugalvoti URL. Follow-up klausimas tik jei trūksta detalės atsakymui, ne lead'ams.

**Žinios:**
- Elgsena / kainos / licencijų rėžiai: `api/_lib/supportKnowledge.ts` (solo kainos iš `pricing.ts` / `subscriptionPricing.ts`; B2B rėžiai iš `enterprise-license.ts` kaip `/pricing`)
- Viešų feature puslapių facts + alias: `src/lib/productFeatureCatalog.ts` — **tas pats šaltinis** landing feature hub ir AI grounding
- Landing pamokos kainos skaičiuoklė: `src/lib/landingLessonEstimate.ts`

**I18n:** `support.*` raktai `lt.ts` / `en.ts` / `pl.ts`. Kitos 10 kalbų — `src/lib/i18n/supportTranslations.ts` (spread į locale failus). Locale ID: `src/lib/i18n/locales.ts`. Naujas support string — visos 13 + `supportCopyKeys.ts` jei UI raktas.

**Migracija:** `20260829170658_support_ai_persistence.sql`.
**Runbook:** `docs/SUPPORT_AI.md`.
**Testai:** `tests/api/support-ai.test.ts`, `tests/lib/support-locales.test.ts`, `tests/lib/landing-lesson-estimate.test.ts`.

**Org admin RLS:** tutor SELECT `students` / `sessions` = `auth.uid() = tutor_id`. `org_admin_permission_*` politikos yra **RESTRICTIVE**; `private.org_admin_permission_gate()` neadminams grąžina `true` tyčia (kad neužblokuotų korep/mokinio/tėvų policy). Tai nėra skylių tarp paskyrų.

---

## 15. Stripe integracija

| Sritis | Failai |
|--------|--------|
| Tutor prenumerata | `create-subscription-checkout.ts`, webhook, `EmbeddedSubscriptionCheckoutDialog.tsx` |
| Connect (payouts) | `stripe-connect.ts`, `stripeAccountOnboarding.ts` |
| Pamokų mokėjimai | `pay-session.ts`, `stripe-checkout.ts` |
| School įmokos | `pay-school-installment.ts`, `schoolInstallmentStripe.ts` |
| School extra-lessons sąskaita | `bill-school-extra-lessons.ts` (cron 1 d. mėn.) |
| Enterprise licencijos | `create-enterprise-checkout.ts` |
| Rinkos (EUR/PLN) | `api/_lib/market.ts`, `src/lib/marketMoney.ts` |

Webhook: `api/stripe-webhook.ts` — apdoroja subscriptions, checkout, Connect, school installments.

Pamokos Checkout (`tutlio_session_id`) apmokėjimas sinchronizuoja ir susietą vienos pamokos `lesson_packages` įrašą per `api/_lib/sessionPackagePayment.ts` (webhook + `confirm-stripe-payment`). Kartotinis patvirtinimas sutvarko paketą net jei pamoka jau apmokėta; apmokėti, atšaukti ir kelių pamokų paketai nekeičiami. Siunčiami esami pamokos mokėjimo laiškai, papildomi paketo laiškai nesiunčiami.

---

## 16. Internacionalizacija (i18n)

**Produkcijos leidimo valdymas:** `src/lib/i18n/localeRelease.ts` atskiria produkcijos UI pasirinkimus, SEO paviršius, blog DB laukus ir lokalizuotus asset'us. Paruoštame kode `UI_RELEASED_LOCALES` turi visus 36 locale, todėl kitas web deploy juos rodys `.lt` ir `.com` kalbos pasirinkimuose bei organizacijos nustatymuose; `.pl` lieka tik lenkų rinkai. 23 naujesni locale vis dar nepublikuojami SEO, sitemap, hreflang ar blog DB ir turi English fallback atskiruose school/admin/legal srautuose. Autentifikuoti profilio ir organizacijos save/reload bandymai praėjo visus 36 kodus, hosted Supabase auth šablonai įdiegti, LT recovery ir HE confirmation laiškai pristatyti. Callback pataisa ir 36 UI leidimas dar nenudeployinti. Aktualus statusas: `docs/LOCALE_PRODUCTION_READINESS.md`. Be aiškaus leidimo necommitinti ir nedeployinti.

**CS juodraštis (Čekija):** `src/lib/i18n/cs.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą, įskaitant 493 quiz raktus. Kalbos kodas `cs`, šalies kodas `CZ`, formatavimas `cs-CZ`, telefono pavyzdys `+420`. Pridėti viešo rezervavimo / redaktoriaus tekstai ir vietiniai auth el. laiškų šablonai; Stripe Checkout kalba `cs`. UI įjungtas paruoštame kode, SEO nepublikuojamas. DB, valiutų ir mokėjimų taisyklės nekeistos; QA ir ribos: `docs/CZECH_LOCALIZATION_REVIEW.md`.

**SK juodraštis:** `src/lib/i18n/sk.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą, įskaitant 493 quiz raktus ir el. laiškus. Formatavimas `sk-SK`, registracijos kodas `+421`. `skDateFns.ts` lokaliai pataiso šeštadienio atpažinimą datos bibliotekoje. UI įjungtas paruoštame kode, SEO nepublikuojamas; mokėjimų ir DB logika nekeista. QA ir ribos: `docs/SLOVAK_LOCALIZATION_REVIEW.md`.

**TR juodraštis:** `src/lib/i18n/tr.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą, įskaitant 493 quiz įrašus ir el. laiškus. Formatavimas `tr-TR`, registracijos kodas `+90`. UI įjungtas paruoštame kode, SEO nepublikuojamas; mokėjimų ir valiutų logika nepakeista. QA ir ribos: `docs/TURKISH_LOCALIZATION_REVIEW.md`.

**UA juodraštis:** Ukrainiečių kalbos kodas `uk`, UI žyma `UA`, formatavimas `uk-UA`. `src/lib/i18n/uk.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą. Registracijoje siūlomas `+380`. UI įjungtas paruoštame kode, SEO nepublikuojamas; `20260831234502_add_ukrainian_locale.sql` migracija 2026-08-31 pritaikyta produkcijos DB (`cuhciqwmqfuajeeqjjbm`); bendras autentifikuotas 36 locale save/reload QA praėjo. QA ir ribos: `docs/UKRAINIAN_LOCALIZATION_REVIEW.md`.

**HE juodraštis (Izraelis):** `src/lib/i18n/he.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą (493 quiz raktai), el. laiškus ir viešo rezervavimo tekstus. Locale `he`, formatavimas `he-IL-u-ca-gregory`, RTL, savaitė nuo sekmadienio, registracijos telefono kodas `+972`. UI įjungtas paruoštame kode, SEO nepublikuojamas; mokėjimų / valiutų taisyklės nekeistos. QA ir ribos: `docs/HEBREW_LOCALIZATION_REVIEW.md`. `20260831234456_add_hebrew_locale.sql` migracija 2026-08-31 pritaikyta produkcijos DB (`cuhciqwmqfuajeeqjjbm`); bendras autentifikuotas 36 locale save/reload QA ir tikro confirmation laiško pristatymas praėjo, callback pataisa laukia deploy.

**RO juodraštis:** `src/lib/i18n/ro.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą, įskaitant el. laiškus ir quiz. Registracija siūlo Rumunijos `+40` kodą; formatavimas `ro-RO`. UI įjungtas paruoštame kode, SEO nepublikuojamas; QA ir ribos: `docs/ROMANIAN_LOCALIZATION_REVIEW.md`.

| Failas | Paskirtis |
|--------|-----------|
| `src/lib/i18n/core.ts` | `t()` funkcija; 36 locale žodynai kraunami **on-demand** |
| `src/lib/i18n/locales.ts` | `SUPPORTED_LOCALES` + Luna kalbų pavadinimai |
| `src/lib/i18n/lt.ts`, `en.ts`, `pl.ts`… | Žodynai |
| `src/lib/i18n/supportTranslations.ts` | `support.*` 10 kalbų (ne lt/en/pl) |
| `src/lib/i18n/index.ts` | `useTranslation()` hook |
| `src/contexts/LocaleContext.tsx` | React provider |
| `api/_lib/i18n.ts` / `ssr-i18n.ts` | El. paštas ir SSR. **Paleidime tik 13** žodynų (`lt`…`nl`). Likę — `loadExtraLocaleDict.ts` pirmą kartą naudojant. **Nedaryk** `import { ar } from '…/ar.js'` visų 36 — Vercel cold start OOM (`FUNCTION_INVOCATION_FAILED` ant `invite-tutor` / `send-email`). |

**UI leidžiami locale:** lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no, nl, th, tr, zh-hk, it, pt, ro, cs, el, hu, bg, hr, sk, sl, hi, ko, ja, id, ar, pt-br, es-mx, fil, he, uk

**TH juodraštis:** `src/lib/i18n/th.ts` turi 5 051 individualių korepetitorių / įmonių vertimų įrašą, įskaitant 493 quiz įrašus ir susijusius mokinių / tėvų bei el. laiškų srautus. Locale `th`, formatavimas `th-TH-u-ca-gregory`, registracijos telefono kodas `+66`; metai lieka Grigaliaus kalendoriaus. UI įjungtas paruoštame kode, SEO nepublikuojamas. QA ir ribos: `docs/THAI_LOCALIZATION_REVIEW.md`; `20260831234518_add_thai_locale.sql` migracija 2026-08-31 pritaikyta produkcijos DB (`cuhciqwmqfuajeeqjjbm`); bendras autentifikuotas 36 locale save/reload QA praėjo. Aktualūs locale sąrašai ir skaičiai — `src/lib/i18n/locales.ts`.

**AR juodraštis:** `src/lib/i18n/ar.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą. Pridėtas bazinis kalendorių, bendrų valdiklių ir el. laiškų RTL palaikymas; datos lieka Grigaliaus kalendoriaus. UI įjungtas paruoštame kode, SEO nepublikuojamas; ribos ir QA: `docs/ARABIC_LOCALIZATION_REVIEW.md`.

**Visi 36 locale SEO publikuojami marketing, schools ir publicPage paviršiuose (nuo 2026-09-05):** it, pt, ro, cs, el, hu, bg, hr, sk, sl, hi, ko, ja, id, ar, pt-br, es-mx, fil, he, uk, zh-hk, tr, th gauna `index, follow`, sitemap ir hreflang. Legal ir blog paviršiai lieka 13 legacy (angliškas legal tekstas ir blog DB stulpelių nėra). Paritetą tikrina `tests/api/seo-locale-parity.test.ts` ir `scripts/seo-locale-readiness.ts`. Valiuta pagal locale: `src/lib/localeCurrency.ts` (USD ne euro zonos naujiems locale, PLN `.pl`, EUR kitur); Stripe USD per `currency_options` (`npm run stripe:setup-usd`).

**SL juodraštis:** `src/lib/i18n/sl.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą. Slovėnijos šalis `SI`, kalbos locale `sl`, formatavimas `sl-SI`, telefono pavyzdžiai `+386`. UI įjungtas paruoštame kode, SEO nepublikuojamas; QA ir ribos: `docs/SLOVENIAN_LOCALIZATION_REVIEW.md`.

**FIL juodraštis:** `src/lib/i18n/fil.ts` turi 5 051 individualių korepetitorių / įmonių ir susijusių mokinių / tėvų srautų vertimą. Locale `fil`, formatavimas `fil-PH`, Filipinų telefono pavyzdžiai `+63`. UI įjungtas paruoštame kode, SEO nepublikuojamas; QA ir ribos: `docs/FILIPINO_LOCALIZATION_REVIEW.md`. `20260831234451_add_filipino_locale.sql` migracija 2026-08-31 pritaikyta produkcijos DB (`cuhciqwmqfuajeeqjjbm`); bendras autentifikuotas 36 locale save/reload QA praėjo.

**Domenai:** `tutlio.lt` → LT, `tutlio.pl` → PL, `tutlio.com` → EN

**EL juodraštis:** `src/lib/i18n/el.ts` turi 5 051 individualių korepetitorių / įmonių vertimo įrašą, įskaitant 493 quiz įrašus ir susijusius mokinių / tėvų bei el. laiškų srautus. Graikų kalbos kodas `el`, formatavimas `el-GR`, šalies kodas `GR`; registracijos telefono pavyzdžiai ir pradinis kodas `+30`. Išverstas viešo puslapio UI ir bendras korepetitoriaus / įmonės redaktorius. UI įjungtas paruoštame kode, SEO nepublikuojamas; QA ir ribos: `docs/GREEK_LOCALIZATION_REVIEW.md`. Mokesčių, valiutų ir DB pakeitimų ši lokalizacija neįtraukia.

**PT-BR juodraštis:** `src/lib/i18n/pt-br.ts` turi individualių korepetitorių ir įmonių UI, mokinių / tėvų srautų, el. laiškų ir quiz vertimus. Atskirų admin / school modulių ir pilnų teisinių dokumentų fallback lieka anglų kalba. UI įjungtas paruoštame kode, SEO nepublikuojamas; QA ir ribos: `docs/BRAZILIAN_PORTUGUESE_LOCALIZATION_REVIEW.md`.

Nauji UI tekstai — pridėk į `lt.ts` ir `en.ts` (bent jau).

---

## 17. Testavimas

```bash
npm test                              # visi testai
npm test -- tests/lib/school-finance-export.test.ts  # vienas failas
npm run test:watch
npm run seo:smoke
npm run security:pencheck
```

**Struktūra:** `tests/api/`, `tests/lib/`, `tests/pages/`, `tests/integration/`, `tests/hooks/`

**School testai:**
- `tests/lib/school-finance-export.test.ts`
- `tests/lib/school-contract-filters.test.ts` — missing fields, 5 filtrų matching, e-sign incomplete (be `completion_submitted_at`), `shouldPromptSchoolSignedOnScan()`, `schoolHasSigned()`
- `tests/lib/school-students-export.test.ts` — export rows, consent labels
- `tests/pages/company-students-filter.test.tsx` — school list filtrai + mokinio info dialogas
- `tests/lib/school-student-enrollment.test.ts`
- `tests/lib/auth-session.test.ts` — sesijos cache (be `getUser` stampede)
- `tests/lib/extra-lessons-contract.test.ts`, `tests/pages/school-extra-lessons-accept.test.tsx`
- `tests/lib/school-extra-lessons-billing.test.ts`, `tests/lib/extra-lessons-parent-portal.test.ts`
- `tests/api/send-email-extra-lessons.test.ts` — offer/accept/withdraw/terminate, gavėjas `alaniukasa@gmail.com`
- `tests/pages/company-class-groups.test.tsx` — grupės modalas, nariai, keli slotai
- `tests/lib/school-class-groups-recordings.test.ts`, `tests/lib/school-join-no-show.test.ts`
- `tests/integration/school-contract-signing-flow.test.ts`
- `tests/api/school-split-fee-installment.test.ts`
- `tests/lib/pvm-education-invoice.test.ts`, `tests/lib/session-complimentary.test.ts`, `tests/lib/quiz-funnel.test.ts`
- `tests/api/proklase-invoice.test.ts`, `tests/lib/proklase-legal.test.ts`, `tests/lib/pending-package-edit.test.ts`, `tests/api/update-pending-package.test.ts`
- `tests/lib/i18n-coverage.test.ts` — visos kalbos išskyrus `quiz.*`
- `tests/api/support-ai.test.ts` — routing, knowledge grounding, pirkimo CTA taisyklė
- `tests/lib/support-locales.test.ts` — `support.*` visose 13 kalbose
- `tests/lib/picked-availability-time.test.ts` — pamokos laikas laisvame lange
- `tests/lib/org-admin-dashboard-path.test.ts`, `tests/lib/org-lookup.test.ts`

**Vitest config:** `vitest.config.ts` — jsdom, `@` → `src/`

---

## 18. Demo duomenys (QA)

**Pro Klasė QA** — org ID `b0a00000-7e57-4000-8000-000000000001`

| Laukas | Reikšmė |
|--------|---------|
| Admin | `proklase.qa.admin@tutlio.lt` → `/company/login` |
| Korep | `proklase.qa.tutor1@tutlio.lt` → `/login` |
| Slaptažodis (visi QA) | `TutlioQaDemo2026!` |
| Rankinis QA | `test_proklase.md` (kitas PC, visos instrukcijos) |
| Kliento laiškai | **`alaniukasa@gmail.com`** (naujo mokinio email / payer / tėvai) |
| Statistikos prognozė į priekį | `node scripts/seed-proklase-forward-stats-qa.mjs` — 8 `active` pamokos **kitam kalendoriniam mėnesiui** (IDs `…051`–`…058`, korep. `…003`, mokiniai Lukas/Gabija/Nojus). Po seed: `/company/stats` → filtras **Kitas mėnuo**. Pakartotinai saugu (upsert). |

**Demo Mokykla** — tik testavimui, org ID `c3a00000-7e57-4000-8000-000000000001`

| Laukas | Reikšmė |
|--------|---------|
| Login URL (lokalus) | `http://localhost:3000/school/login` |
| El. paštas | `demo-mokykla.demo.admin@tutlio.lt` |
| Slaptažodis | `TutlioQaDemo2026!` |
| Sutartys | `/school/contracts` |
| Mokiniai | `/school/students` |
| Extra tėvas | `demo-mokykla.extra.parent@tutlio.lt` → `/login` |
| Tėvų / mokėtojo laiškai | **`alaniukasa@gmail.com`** (offer, accept+PDF, atsisakymas, nutraukimas, įmokos, metinės sutartys) |
| Nepatvirtintas lankomumas QA | `node scripts/seed-demo-school-unconfirmed-attendance-qa.mjs` — tik Demo Mokykla. KPI datos **relatyvios** (ne fiksuotos spalio 8/15): seed pritaiko pamokas prie „dabar“, kad mėnesio Apžvalgoje matytųsi **≈4 įvykę** ir **4 nepatvirtintus** (Lukas×2, Gabija×1, Nojus×1). 09.03 istorija ir vaikai be join įrodymų į skaičių neįeina. Po seed: hard refresh; `.env` → `cuhciqwmqfuajeeqjjbm`. |

**Seed skriptai:**

| Skriptas | Paskirtis |
|----------|-----------|
| `scripts/seed-qa-demo-orgs.mjs` | 3 demo org (company, Pro Klasė, mokykla) + vartotojai |
| `scripts/seed-demo-school-finance.mjs` | Sutartys + įmokos + demo PDF (laiškai `alaniukasa@gmail.com`) |
| `scripts/seed-demo-school-filters.mjs` | Filtrų/eksporto QA duomenys (5 statusai, consent, klasės) |
| `scripts/seed-school-extra-lessons-qa.mjs` | Extra-lessons sutarčių QA (laiškai `alaniukasa@gmail.com`) |
| `scripts/seed-school-extra-lessons-legal-qa.mjs` | 14 d. atsisakymas / click-wrap QA (laiškai `alaniukasa@gmail.com`) |
| `scripts/seed-proklase-package-edit-qa.mjs` | Pro Klasė pending package edit QA |
| `scripts/seed-proklase-forward-stats-qa.mjs` | Pro Klasė: būsimos pamokos statistikos prognozės QA (`/company/stats`, Kitas mėnuo) |
| `scripts/seed-school-contract-completion-test.mjs` | Sutarčių completion testiniai duomenys |
| `scripts/seed-demo-school-unconfirmed-attendance-qa.mjs` | Demo Mokykla: 4 sistemos matomi neatvykimai (relatyvios datos) + 09.03 istorija be join įrodymų; įjungia school flag'us |

**⚠️** Seed reikia `SUPABASE_SERVICE_ROLE_KEY` teisingam projektui (`cuhciqwmqfuajeeqjjbm`). Jei `node scripts/seed-*.mjs` failina su `fetch failed` — tikrink `.env` / naudok MCP `execute_sql` arba `.env.vercel.stage`.

**⚠️ Lokalus prisijungimas:** jei `.env` rodo į `xklzjhfztjxltrdkplog` — demo login **neveiks**. Įrašyk teisingus Supabase raktus į `.env` (ref `cuhciqwmqfuajeeqjjbm`).

---

## 19. Dažnos agentų klaidos

1. **Deploy/commit be leidimo** — vartotojas aiškiai prašo klausti prieš commit/push/deploy.
2. **PowerShell `&&`** — neveikia; naudok `;`.
3. **Placeholder ≠ reikšmė** — school grafiko formoje `100.00` placeholder neaktyvuoja mygtuko.
4. **School = company komponentai** — nekurk atskirų `School*.tsx` jei galima extend'inti `company/`.
5. **RLS** — API dažnai naudoja service role; frontend — anon key + JWT.
6. **`.env` Supabase URL** — turi būti `cuhciqwmqfuajeeqjjbm`; ne naudok `.env.local` / `.env.vercel.*` vietoj `.env` lokaliai.
7. **Per platus diff** — vartotojas nori minimalaus, fokusuoto pakeitimo.
8. **xlsx paketas** — nenaudojamas; Excel eksportui naudok `exceljs` (`schoolFinanceXlsxExport.ts`).
9. **Temp failai** — necommitink `scripts/_*.mjs`, `scripts/_last-*.pdf`, `tmp/`, `preview-*.html`.
10. **i18n** — nauji string'ai (ne `quiz.*`) visose 13 kalbose; `quiz.*` tik lt+en. `support.*` dar `supportTranslations.ts` (10 kalbų). Identiskas EN vertimas kitoje kalboje krenta coverage.
11. **Lokalūs UI preview** (`/preview/assign-student-modal`, `/preview/complimentary-lesson`) — tik `import.meta.env.DEV`. Produkcijoje maršrutų nėra.
12. **Vite prod entry** — `vite.config.ts` rollup `input` turi būti **tik** `index.html`. Jei paliksi ištrintus `preview-*.html`, `npm run build` / Vercel failins (`Could not resolve entry module`).
13. **Vercel `level:error`** dažnai yra Node `[DEP0169] url.parse()` (200 OK). Tikri incidentai: `5xx` arba `[school-contract-sign-reconcile] GoSign ... timed out`.
14. **Skeno įkėlimas eSign org** — neatspėk folderio iš failo. Dialogas `shouldPromptSchoolSignedOnScan()`: Taip → `signed`, Ne → `awaiting_school_signature`. `signed_contract_url` vis tiek gali būti tėvų kopija; tikras mokyklos parašas = `schoolHasSigned()` / GoSign `school.pdf`.
15. **Extra-lessons ≠ metinė GoSign sutartis** — filtruok `school_contracts.kind`. Mokytojų sutartys vis dar WIP — tų migracijų nestumk. Extra-lessons kodas yra `alano-local` (sujungta su `Simo-local`).
16. **Nėra `lesson_contracts` lentelės** — papildomos pamokos = `school_contracts.kind = 'extra_lessons'`.
17. **School QA laiškai** — Demo Mokykla mokėtojo el. paštas turi būti `alaniukasa@gmail.com`, ne `*@tutlio.lt` inbox'ai kurių niekas neskaito.
18. **Auth lock** — lygiagretūs `getUser()` (students + preload + analytics) → `navigatorLock` 5s + `AbortError` steal. Naudok `authSession.ts`.
19. **Privatūs Drive įrašai** — `SCHOOL_LESSON_RECORDINGS_NAV_READY = true`, bet rollout valdo org flag. Niekada neduok tiesioginės Drive nuorodos / service-account rakto klientui; naudok gyvos grupės arba individualaus dalyko auditorijos autorizaciją ir `school-lesson-recording-stream` proxy.
20. **Org login hang** — po admin login nenaudok PostgREST embed `organizations(...)` iš `organization_admins` / `profiles`. `getOrgAdminDashboardPath` + `fetchOrganizationRow`.
21. **AI support žinios** — nekurk naujų viešų URL Luna atsakymuose. Puslapiai tik `supportPageSuggestions.ts`. Kainos / licencijos — `supportKnowledge.ts` + `productFeatureCatalog.ts`, ne „iš galvos“. `OPENAI_API_KEY` be `VITE_`.
22. **Serverio i18n bundle** — `api/_lib/i18n.ts` / `ssr-i18n.ts` negali statiniu importu krauti visų ~36 locale failų (~5k raktų). Extra kalbos tik per `loadExtraLocaleDict`. `FUNCTION_INVOCATION_FAILED` kviečiant korep — visoms org, ne tik Pro Klasei.
23. **Join no-show ≠ tėvų laiškas** — cronas tik keičia `sessions.status`. Laiškas `session_student_no_show` tik po rankinio žymėjimo + `payer_email` + pasibaigęs `end_time`.
24. **Atlygis pagal dalyką** — UI ir `company_commission_by_subject` tik `isManoKorepetitoriusOrg`. Pro Klasei netaikyti; ten lieka `proKlaseTutorPay.ts`.
25. **Mokyklos terminologija** — nerašyk atskirų „mokytojas“ / „užsiėmimas“ raktų: bazinis LT tekstas lieka „korepetitorius“ / „pamoka“, o mokyklų portalai + laiškai keičia runtime (`schoolTerminology.ts`). Naujas LT tekstas su „pamoka“ turi praeiti `tests/lib/school-terminology.test.ts` (nelieka „pamok“). Dviprasmiškus raktus dėk į `LT_ACTIVITY_KEY_OVERRIDES`.
26. **Grupių pamokos** — nekurk `sessions` eilučių grupėms rankiniu būdu ir netrink jų per FK: naudok `reconcileClassGroupSessions` / `removeFutureClassGroupSessions`. Ateities `active` be join'ų eilutės yra generuojamos ir bus perrašytos pagal slotus.
27. **API importų plėtiniai** — kiekvienas `src/lib/*` failas, kurį runtime pasiekia `api/*.ts`, privalo importuoti su `.js` (`from './i18n/locales.js'`), be `@/` alias. Node ESM Vercel funkcijoje neranda `./i18n/locales` → visa funkcija `FUNCTION_INVOCATION_FAILED` (2026-09-05 taip nukrito bot SSR: landing, pricing, blog, tutor puslapiai, `sitemap.xml`, auto-blog cron). Vitest/tsc to nemato — saugo `tests/api/esm-import-extensions.test.ts`; po deploy `npm run seo:smoke`.
28. **Tėvų kalendorius be korepetitoriaus** — `StudentSchedule` (`/parent/calendar`) mokinio pamokas krauna pagal `student_id` (visi mokytojai); `students.tutor_id = NULL` mokyklos mokiniui nėra klaida. „Prisijungti“ mygtukai tėvų/mokinio portale — `JoinLessonButton` (aktyvus tik 30 min. prieš pamoką iki pabaigos).
28. **`RoleLayout` inline** (`StudentSchedule.tsx`) permontuoja layout'ą kiekvieną renderį — store'ai, kuriuos registruoja layout hook'ai, turi būti atsparūs unmount+mount porai tame pačiame commit'e (žr. `terminologyStore.ts` deferred flush).
29. **Pro Klasė vs universalus fix'as** — finansų privatumas (`orgTutorInvoiceAccess.ts`, migracija `20261001134513_*`, `invoiceKind`/`tutorId` `generate-invoice.ts`) ir pardavėjo numeracija (`20261001134821_*`) yra **visų org** taisyklės. Neperkelk į universalų sluoksnį: `proKlaseSessionPayEur`, `tutor_adjustments`, Pro Klasės PVM pastabą, `pk-*` login prefix, paketų API (`proklase-student-packages.ts`), org ID guard'us atšaukimo / laisvo laiko UI.
30. **DB testai su PGlite** — `tests/db/*.test.ts` importuoja `@electric-sql/pglite` (devDependency). Be `npm install` jie krenta su „Failed to resolve import“, nors API/lib regresijos testai praeina.
31. **School duplicate student rows** — tas pats vaikas (mokėtojo el. paštas + vardas) gali turėti kelis `students.id` (vienas mokytojui). Mokinių sąraše jie **sujungiami** į vieną kortelę (`orgStudentIdentityGroupKey`), bet finansuose anksčiau skaičiuodavo atskirai. Naujas kodas: `loadBatchDrafts` + `ensureStudentPairedWithTutor` naudoja tapatybę, ne tik `linked_user_id`. Atsitiktiniai dubliatai (du tutorless įrašai) — `scripts/repair-laisvi-duplicate-students.mjs`.
32. **Tuščias / lėtas org tvarkaraštis (`/school/schedule`, `CompanyTvarkarastis`)** — nebekrauna ~270 d. × visų mokytojų vienu metu. Sesijos imamos tik matomam langui (`orgScheduleFetchWindow.ts` pagal day/week/month + 7 d. padding), kalendoriui lengvas `TVARKARASTIS_CALENDAR_SESSION_SELECT`, pilna eilutė tik paspaudus (`TVARKARASTIS_SESSION_SELECT`). Mokykloms numatytai `showOnlySessions=true` (tik užimti laikai, be laisvo laiko skaičiavimo). Fono refresh nebepaleidžia viso puslapio spinnerio — tik `sessionsLoading` overlay. Detalės modalui jau kraunamos on-click. Jei vis tiek tuščia: filtre spausti **Visi** arba hard refresh.
33. **Pamokos priminimas po perkėlimo** — `reminder_*_sent` turi būti nulinami kiekvienam `start_time` / `end_time` pakeitimui. `student_reschedule_session` RPC ir mokyklų grupių triggeris tai daro; universali apsauga — DB triggeris `sessions_reset_reminders_on_reschedule` (`20261005120000_session_reminder_reset_on_reschedule.sql`). Be jo kalendoriaus / org admin perkėlimas (`Calendar.tsx`, `CompanyTvarkarastis.tsx`, `Students.tsx`) gali palikti seną `reminder_student_sent=true` ir cron nebesiųs naujo laiško naujam laikui. `send-reminders.ts` žymi flag'ą tik per `shouldMarkSessionReminderSent()` (Resend `id` arba sąmoningas opt-out / idempotency 409), ne bet kokį 2xx.
34. **Darbuotojo sutikimo „Nepavyko išsaugoti“** — `school-contracts` bucket'as turi leisti `application/json` (`20261005140000_school_contracts_allow_json_staff_details.sql`). Be to `staff-personal-details.json` / alert marker upload krenta, o senas POST blokuodavo atsakymų įrašymą. Sutikimo POST pirma rašo `staff_consent_answers`, stash yra best-effort.
35. **Org admin laisvo laiko INSERT/UPDATE timeout** — `availability` RLS politika su `profiles`/`organizations` subquery kiekvienam org korepetitoriui (ypač Pro Klasė su `org_admin_calendar_full_control`) viršijo PostgREST `statement_timeout` (`canceling statement due to statement timeout`). Tai **universalus** org admin kelias (`CompanyTvarkarastis` → `handleSaveAvailability` / `handleCreateAvailability`), ne Pro Klasė logika. Pataisa: migracija `20261005105541_org_calendar_availability_permissions.sql` (`private.org_admin_availability_tutor_ids()`, `row_security=off`). UI saugo be `.select('id')` — pakanka `error` tikrinimo. Testas: `tests/db/org-admin-availability.test.ts`.
36. **Org admin laisvas laikas DB susikuria, bet kalendoriuje nematomas** — `refreshSchedule()` kvietė `fetchScheduleMeta()`, kuris ant cache hit grąžindavo **seną** `availability` masyvą; `loadAvailabilityForTutors` vėl nebuvo kviečiamas, nes `availability.length > 0`. Po sėkmingo create/edit adminas matydavo „nieko neįvyko“ ir spaudė dar kartą (dubliatai DB, pvz. Pro Klasė Rimantas 2026-10-06). Pataisa: `refreshSchedule` perkrauna availability iš DB + toast (`avail.addSuccess` / `avail.updateSuccess`); create modal po sėkmės perkelia kalendorių į slot datą.
37. **Mokyklų tėvų registracija ir sibling susiejimas** — `register-parent` mokykloms automatiškai pririša visus aktyvius vaikus su tuo pačiu `payer_email` / `parent_secondary_email`. Kai įjungta `school_family_portal` arba `school_family_accounts_setup`, registracija ir „Pakviesti tėvą“ esamai paskyrai upsertina `school_family_guardians` iš pasirašytos metinės sutarties (`api/_lib/schoolParentSiblingLink.ts`, `bindSchoolFamilyGuardianForRegisteredParent`). Antras vaikas jau užsiregistravusiam tėvui: `linkExistingSchoolParentByEmail`, ne `already_registered` skip. Šeimos portalo įjungimui admin API reikalauja tik medžiagos bazės (`baselineReady`).
38. **Org statistika mažesnė nei kalendoriuje (MK ir kitos company org)** — dažniausia priežastis: pasibaigusios pamokos vis dar `status=active`, nes `auto-complete-sessions` anksčiau žiūrėjo tik 7 d. atgal ir nebegrįžo prie senų eilučių. Statistika / `generate-invoice` ima tik `completed`/`no_show`; kalendorius vizualiai rodo ir pasibaigusias `active`. Tikrinti: `SELECT status, count(*) FROM sessions ... WHERE end_time < now() GROUP BY status`. Pataisa: cron lookback 90 d. + `orgTutorConductedSessions` `includeEndedActive` company stats be rankinio patvirtinimo; istorinėms eilutėms — `UPDATE sessions SET status='completed' WHERE status='active' AND end_time < now()` (ne school su `tutor_lesson_status_confirmation` / Laisvi vaikai).
39. **Org admin load burst'ai** — `getOrgVisibleTutorsDeduped()` (`orgVisibleTutors.ts`) sujungia Layout preload + Dashboard + Stats + Tvarkaraštis tutor list kvietimus. `CompanyDashboard` — 2 session query (metrikos 2 m. + sąrašai nuo −30 d.), Pro Klasė overdue API fone. `CompanyStats` — stale-while-revalidate iš `company_stats:{orgId}` cache. `preloadDashboard` naudoja jau įkrautas sesijas, ne antrą mėnesio query. `fetchAllRows(query, maxRows)` — School apžvalgos sutartys/SF/grupės capped. School sibling paieška — SQL `.or(payer_email, parent_secondary_email)`, ne visas org sąrašas.
40. **Org tvarkaraščio laisvas laikas dingo po select optimizacijos** — `loadAvailabilityForTutors` negali naudoti neegzistuojančių `availability` stulpelių (`link_url`, `notes`); PostgREST grąžina klaidą ir kalendoriuje nelieka laisvo laiko. Laikyti `select('*')` (arba bent `start_date`, `created_at`, `meeting_link`, `public_bookable`). `fetchScheduleMeta` ant cache hit vis tiek fone perkrauna availability company org.
41. **Mano Korepetitorius mėnesio S.F. ir dubli `students.id`** — jei tas pats vaikas (tas pats `full_name` + `email` + `tutor_id`) turi du įrašus, o naujesnis sukurtas be `payer_email` (pvz. perkūrus pasikartojančią seriją 2026-10-05 Greta Bespalovaitė + Pijus Oželis), `create-monthly-invoice` tėvų grupei (`payer_email`) skaičiuoja tik seno įrašo pamokas; likusios patenka į atskirą grupę pagal mokinio el. paštą → laiške 1 pamoka vietoj 2. Prod taisymas: sujungti `sessions` + `recurring_individual_sessions` ant senesnio įrašo su `payer_email`, perkelti `linked_user_id`, trinti dublikatą. MK prod 2026-10-06: `e5f35a30…` → `ab86d501…`. **Prevencija (2026-10-06):** `sameOrgStudentIdentity()` papildomai sujungia org + vaiko el. paštą + vardą (ne tik `payer_email` / `linked_user_id` raktą); `ensureStudentPairedWithTutor()` ieško sibling pagal el. paštą, prieš insert reuse'ina esamą `(email, name, tutor_id)` eilutę ir kopijuoja `payer_*` iš sibling. Nebekurti naujo mokinio kuriant pasikartojančią seriją / booking iš kito tutor eilutės.
42. **MK mokėtojo S.F. per dalyką / korepetitorių** — negrupuok PVM S.F. pagal `student_id` ar siųsk `create-monthly-invoice` ciklu per `tutor_id`: tas pats vaikas su keliais dalykais gavo kelis PDF ir kelis Stripe kvietimus. Teisinga: `organizationId` + visi `sessionIds` vienu kvietimu; S.F. skaičius = `countStudentIdentityInvoiceGroups()` (vienas vaikas = viena S.F. su visomis pamokomis detalizacijoje); mokėjimas = vienas batch mokėtojui. Regresija: `tests/api/create-monthly-invoice-delivery.test.ts`.
43. **Sąskaitų ZIP eksportas / MK failo vardas** — „Atsisiųsti pasirinktas“ turi grąžinti **vieną ZIP** (`downloadInvoicesAsZip`), ne ciklą su `setTimeout` (naršyklė blokuoja). MK mokėtojo S.F. atsisiuntimas ir el. laiško priedas: `MK Nr. {n} ({YYYY-MM-DD}).pdf`, ne `MK-01649.pdf` — `formatInvoiceDownloadFilename()` + `invoice-pdf` Content-Disposition. Dubliams ZIP'e pridedamas ` (2)` sufiksas.
44. **Seed į prod org** — `scripts/seed-invoice-download-qa.ts` ir bet koks invoice QA seed **tik** `b0a00000-…` (Pro Klasė QA) arba `c1a00000-…` (DEMO MK įmonė, slug `manokorepetitorius`). **Niekada** `2c4e4c2a-…` (Mano Korepetitorius prod) arba Laisvi vaikai. MK atsisiuntimo vardų QA: `MANO_KOREPETITORIUS_QA_ORG_ID` + `npx tsx scripts/seed-invoice-download-qa.ts` → login `manokorepetitorius.demo.admin@tutlio.lt` / `TutlioQaDemo2026!`.

---

## 20. Greita failų nuoroda

| Užduotis | Kur žiūrėti |
|----------|-------------|
| Naujas maršrutas | `src/App.tsx` |
| School sutartis (metinė) | `CompanyContracts.tsx`, `schoolContractFilters.ts`, `api/school-contract-*.ts`, `schoolContractsExport.ts` |
| Extra-lessons sutartis | `extraLessonsContract.ts`, `extraLessonsPdf.ts`, `SchoolExtraLessonsAccept.tsx`, `api/extra-lessons-contract-*.ts` |
| Rankinis school QA | `test_school.md` |
| Rankinis Pro Klasė QA | `test_proklase.md` |
| Skeno folderio dialogas | `shouldPromptSchoolSignedOnScan()` `schoolContractFilters.ts` |
| Mokytojų sutartys (WIP) | `CompanyStaffContracts.tsx`, `schoolContractParty.ts`, `school-contract-teacher-invite.ts` |
| Darbuotojų dokumentai (konfidencialumas / sutikimas) | `CompanyStaffDocuments.tsx`, `api/school-staff-documents.ts`, `api/school-staff-consent.ts`, `api/school-staff-consent-pdf-retry.ts`, `api/_lib/schoolStaffDocuments.ts`, `api/_lib/schoolStaffConsentPdf.ts` |
| Nepatvirtintas lankomumas | `schoolJoinNoShow.ts` (`isUnconfirmedDetectedStudentAbsence`), `schoolSessionMonitoring.ts` |
| Klasės grupės | `CompanyClassGroups.tsx`, `ClassGroupFormDialog.tsx`, `schoolClassGroups.ts`, `schoolGroupMemberActivation.ts`, `api/school-class-groups.ts`, `api/_lib/schoolClassGroupMaterialize.ts` |
| Mokyklos terminologija (mokytojas / užsiėmimas) | `src/lib/i18n/schoolTerminology.ts`, `terminologyStore.ts`, `hooks/useSchoolTerminology.ts`, `useParentHasSchoolOrg.ts`, `useOrgTerminologyMode.ts`, `api/send-email.ts` (school laiškai) |
| „Prisijungti“ langas (tėvai / mokiniai) | `components/JoinLessonButton.tsx`, `lib/attendance.ts` |
| Mokytojo grupės lankomumas (kalendorius) | `SchoolGroupRosterAttendanceControls.tsx`, `schoolAttendanceUi.ts`, `schoolGroupAttendance.ts`, `Calendar.tsx` |
| Viešo AI widget'o rodymas (tik landing, niekur kitur) | `supportWidgetVisibility.ts` (`isLandingPath`) |
| School mokiniai + filtrai | `CompanyStudents.tsx`, `schoolStudentEnrollment.ts`, `authSession.ts`, `schoolStudentsExport.ts` |
| Pamoka iš mokinio kortelės / tikslus laikas | `FindTutorModal.tsx`, `FindLessonBookDialog.tsx`, `PickedAvailabilityTimeEditor.tsx`, `pickedAvailabilityTime.ts`, `studentLessonPricing.ts` |
| School mokėjimai | `CompanyPayments.tsx`, `useSchoolPaymentsData.ts` |
| Mokyklos tėvų S.F. (mėnesinė) | `SchoolMonthlyInvoiceDialog` (`batch`), `api/school-monthly-invoice-admin.ts`, `schoolPayerInvoiceGroups.ts`, `schoolInvoiceSessionReview.ts` (`resolveSchoolInvoiceUnitPrice`) |
| School finansų eksportas | `schoolFinanceExport.ts`, `schoolFinanceXlsxExport.ts` |
| Complimentary pamoka | `sessionComplimentary.ts`, `api/mark-session-complimentary.ts` |
| PVM S.F. / numeracija | `pvmEducationInvoice.ts`, `invoiceNumber.ts` (`previewInvoiceNumber`, `formatSchoolInvoiceNumberLabel`, `allocateInvoiceNumber`), `reserve-invoice-number.ts` |
| Sąskaitų ZIP + MK failo vardas | `downloadInvoicesZip.ts`, `invoiceDownloadFilename.ts`, `CompanyInvoices.tsx`, `Invoices.tsx`, `api/invoice-pdf.ts` |
| Pro Klasė atlygis / baudos / S.F. PVM | `proKlaseTutorPay.ts`, `proKlaseInvoice.ts`, `api/tutor-adjustment.ts`, `CompanyTutors.tsx` |
| Mokyklų mokytojo atlygis (užsiėmimas, grupė vs individualu) | `schoolTutorLessonPay.ts` (`sumSchoolTutorPayEur`), `schoolTutorDefaultPay.ts`, `CompanyTutors.tsx`, `CompanyStats.tsx` (`/school/stats`), `api/_lib/schoolTutorInvoice.ts`, migracijos `20261001100000_*`, `20261001120000_*` |
| Pro Klasė legal / pending package | `proKlaseLegal.ts`, `pendingPackageEdit.ts`, `api/update-pending-package.ts` |
| Capacity / chat Broadcast | `docs/CAPACITY_1000_USERS_RUNBOOK.md`, `src/hooks/useChat.ts`, `src/lib/chatMessages.ts` |
| Tutor quiz / lead | `QuizFunnel.tsx`, `src/lib/quizFunnel.ts`, `api/landing-lead.ts` |
| AI support widget | `SupportWidget.tsx`, `api/support-chat.ts`, `supportKnowledge.ts`, `productFeatureCatalog.ts`, `docs/SUPPORT_AI.md` |
| Org admin login kelias | `CompanyLogin.tsx`, `orgAdminDashboardPath.ts`, `orgLookup.ts` |
| Tėvų priminimai / neatvykimas | `send-reminders.ts`, `notify-session-no-show.ts`, `schoolJoinNoShow.ts`, `ParentSettings.tsx` |
| Serverio i18n (be OOM) | `api/_lib/i18n.ts`, `loadExtraLocaleDict.ts`, `ssr-i18n.ts` |
| Org korep kvietimas | `CompanyTutors.tsx`, `api/invite-tutor.ts` |
| Embedded prenumerata | `EmbeddedSubscriptionCheckoutDialog.tsx`, `create-subscription-checkout.ts` |
| Tutor kalendorius / laisvas laikas | `Calendar.tsx`, `AvailabilityManager.tsx`, `calendarSessionEventStyle.ts` |
| Org admin tvarkaraštis (school/company) | `CompanyTvarkarastis.tsx`, `orgScheduleFetchWindow.ts`, `dataCache.ts` (`companyTvarkarastisCacheKey`); Pro Klasė: korepetitorių filtre `TutorTeachingNotesBadge` iš `profiles.teaching_notes` |
| Org admin laisvo laiko RLS | `20261005105541_org_calendar_availability_permissions.sql`, `tests/db/org-admin-availability.test.ts`, `CompanyTvarkarastis.tsx` (`handleSaveAvailability`) |
| Org admin tutor filtrai (scroll) | `orgUi.ts` |
| Org email branding | `api/_lib/emailOrgBranding.ts`, `api/send-email.ts`, `src/lib/email.ts` |
| Stripe webhook | `api/stripe-webhook.ts` |
| PDF generavimas | `api/_lib/schoolContractPdf.ts`, `docxConverter.ts` |
| GoSign | `api/_lib/gosign.ts` |
| Admin panelė | `src/pages/AdminPanel.tsx` |
| Cron schedule | `vercel.json` → `crons` |
| Env šablonas | `.env.example` |
| DB schema | `supabase/migrations/` |
| E2E school QA | `docs/SCHOOL_MODULE_TEST_PLAN.md` |
| Deploy instrukcijos | `darbai.md`, `docs/` |

---

## 21. Kontekstai (React)

| Context | Failas | Paskirtis |
|---------|--------|-----------|
| User | `src/contexts/UserContext.tsx` | Auth user + profilis |
| Org entity | `src/contexts/OrgEntityContext.tsx` | `school` vs `company` |
| Branding | `src/contexts/OrgBrandingContext.tsx` | White-label |
| Platform | `src/contexts/PlatformContext.tsx` | Domenas (.lt/.pl/.com) |
| Locale | `src/contexts/LocaleContext.tsx` | Kalba |

---

## 22. Papildoma dokumentacija

- `README.md` — greitas startas žmonėms
- `docs/README.md` — docs indeksas
- `docs/SCHOOL_MODULE_TEST_PLAN.md` — senas phase-1 planas
- `test_school.md` — pilnas Demo Mokykla QA (commit'ai + 14 d. legal)
- `test_proklase.md` — pilnas Pro Klasė QA (loginai, laiškai `alaniukasa@gmail.com`, srautai)
- `docs/SCHOOL_EXTRA_LESSONS_LEGAL_TEST_PLAN.md` — 14 d. click-wrap mini planas
- `docs/CAPACITY_1000_USERS_RUNBOOK.md` — 1000 vartotojų capacity testas (tik isolated staging)
- `docs/SUPPORT_AI.md` — viešas AI support (Luna, žinios, kontaktų forma, priedai)
- `docs/GOOGLE_CALENDAR_SETUP.md` — Google Calendar
- `darbai.md` — deployment į produkciją
- `services/docx-converter/README.md` — DOCX converter servisas

---

*Paskutinis atnaujinimas: 2026-10-06: MK mokėtojo S.F. ZIP eksportas + failo vardas `MK Nr. {n} ({data}).pdf` — žr. §14 MK mokėtojo mėnesinės S.F., §19 #43.*
