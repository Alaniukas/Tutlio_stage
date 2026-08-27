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

### School maršrutai (svarbiausi)

| Kelias | Komponentas | Paskirtis |
|--------|-------------|-----------|
| `/school/contracts` | `CompanyContracts.tsx` | Metinės sutartys + extra-lessons pasiūlymas (flag) |
| `/school/students` | `CompanyStudents.tsx` | Mokinių CRUD, enrollment filtrai, extra-lessons offer |
| `/school/groups` | `CompanyClassGroups.tsx` | Klasės grupės: kortelė / **Redaguoti** → `ClassGroupFormDialog` (info + nariai). Keli savaitės slotai su **skirtinga diena ir starto laiku** |
| `/school/recordings` | `CompanyLessonRecordings.tsx` | **Parkuota** — maršrutas paliktas; nav **Įrašai** visada paslėptas (`SCHOOL_LESSON_RECORDINGS_NAV_READY = false`). Flag `school_lesson_recordings` (Demo = false). |
| `/school/finance?tab=payments` | `CompanyPayments.tsx` | Įmokų grafikai, mokėjimo nuorodos |
| `/school/finance?tab=report` | `CompanySchoolFinanceReport.tsx` | Suvestinė buhalterijai, filtrai, XLSX |
| `/school/finance` | `CompanyFinanceHub.tsx` | Tab hub (Mokėjimai / Suvestinė / Finansai / Sąskaitos) |

**Vieši school flow:**
- `/school-sign` — tėvų (metinės sutarties) pasirašymas
- `/school-contract-complete` — sutarties užbaigimas po pasirašymo
- `/school-extra-lessons-accept` — tėvų click-wrap papildomų pamokų sutarčiai (`SchoolExtraLessonsAccept.tsx`)

**Lokalūs UI preview (ne produkcija):** `/preview/assign-student-modal`, `/preview/complimentary-lesson` — SPA maršrutai tik `import.meta.env.DEV`. Fake duomenys, be auth. Atskiri `preview-*.html` entry **nebėra** — `vite.config.ts` prod buildina tik `index.html`.

**Vieši marketingo maršrutai:**
- `/quiz`, `/quiz/:audience/:step` (+ `/:locale/quiz/…`) — tutor quiz funnel (`QuizFunnel.tsx`)
- Prenumeratos checkout puslapyje `/pricing` — įterptas Stripe Embedded Checkout (`EmbeddedSubscriptionCheckoutDialog.tsx`)

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
cp .env.example .env.local   # užpildyti raktus
npm run dev                  # frontend :3000 + API :3002
```

**Windows PowerShell:** naudok `;` vietoj `&&` komandų grandinėse.

**Lokalus dev (svarbu demo / school QA):**
- `.env` faile dažnai būna **pasenęs** Supabase URL (`xklzjhfztjxltrdkplog` — nebeegzistuoja).
- Naudok `.env.local` su raktais iš `.env.vercel.stage` (ref `cuhciqwmqfuajeeqjjbm`), tada `npm run dev`.
- Demo prisijungimas veikia tik su teisingu Supabase projektu: `http://localhost:3000/school/login`

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
| Email | `RESEND_API_KEY`, `FROM_EMAIL` | |
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
- Cron job'ai: `vercel.json` → `crons` (sessions, reminders, contract reconcile, blog, `school-join-no-show` kas 5 min, `bill-school-extra-lessons` 1 d. 04:00 UTC)

**Git taisyklės (iš vartotojo preferencijų):**
- **Nedeployink ir necommitink be aiškaus leidimo**
- Nenaudok `git push --force` į main
- Nenaudok `--no-verify`
- Commit message — pilni sakiniai, fokusas į „kodėl“

**Aktyvi šaka:** dažnai `Simo-local` arba `alano-local` (ne `main`).

---

## 9. Duomenų bazė (Supabase)

Migracijos: `supabase/migrations/` (datuotos `202603*`–`202608*`).

### Pagrindinės lentelės

| Lentelė | Paskirtis |
|---------|-----------|
| `organizations` | Org/mokykla (`entity_type`, `features` JSON) |
| `organization_admins` | Org adminų ryšys |
| `profiles` | Tutor profiliai |
| `students` | Mokiniai (`grade`, `media_publicity_consent`, `school_year`, `enrollment_status`, `municipality`, `exit_*`, `has_debt_manual`) |
| `sessions` | Pamokos (`is_makeup`, `is_complimentary`; school extra: `school_billing_kind`, `student_joined_at`) |
| `school_contract_templates` | Sutarčių šablonai (DOCX body) |
| `school_contracts` | Sutartys. `kind`: `'annual'` \| `'extra_lessons'`. Extra: `order_snapshot`, `document_sha256`, `accepted_at`, `base_lessons_per_month`, `unit_price_eur`, `class_group_id`, withdrawal laukai. WIP mokytojams: `party_kind` (`student` \| `teacher`), `counterparty_name` / `counterparty_email` |
| `school_class_groups` + `_slots` + `_members` | Metų trukmės klasės grupės, savaitės slotai, mokinių sąrašas |
| `school_payment_installments` | Įmokų grafikas (metinėms sutartims) |
| `school_contract_signatures` | E-parašo įrašai (`role`: school / parent_* / planuojama `teacher`) |
| `invoices`, `lesson_packages` | Billing (PVM serijos numeris atominiu `allocateInvoiceNumber`) |
| `chat_conversations`, `chat_messages` | Žinutės |

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
| School grupės / įrašai / no-show | `school-class-groups.ts`, `school-lesson-recordings.ts`, `school-join-no-show.ts` |
| Mokytojų sutartys (WIP) | `school-contract-teacher-invite.ts` — importuoja `inviteTeacherToSign` / `isTeacherContract`, kurių `schoolContractSigning.ts` dar neturi |
| School mokėjimai | `pay-school-installment.ts`, `confirm-school-installment-manual.ts`, `school-installment-reminders.ts` |
| Sąskaitos | `generate-invoice.ts`, `reserve-invoice-number.ts`, `invoice-pdf.ts` |
| Paketai (Pro Klasė) | `update-pending-package.ts`, `resend-package-email.ts`, `api/_lib/sendPendingPackageEmail.ts` |
| Stripe | `stripe-webhook.ts`, `stripe-checkout.ts`, `stripe-connect.ts`, `create-subscription-checkout.ts` |
| Lead / quiz | `landing-lead.ts` |
| Sessions/cron | `auto-complete-sessions.ts`, `send-reminders.ts`, `materialize-recurring-sessions.ts`, `mark-session-complimentary.ts` |
| Admin | `admin-organizations.ts`, `admin-statistics.ts` |
| Email | `send-email.ts` |
| SSR/SEO | `page-render.ts`, `blog-render.ts`, `sitemap.ts` |

**Bendri helperiai:** `api/_lib/schoolContractSigning.ts`, `schoolContractPdf.ts`, `extraLessonsContractShared.ts`, `schoolInstallmentStripe.ts`, `gosign.ts`, `docxConverter.ts`, `invoiceNumber.ts`, `pvmEducationInvoice.ts`, `proKlaseInvoice.ts`, `emailOrgBranding.ts`.

---

## 11. Autentifikacija (frontend)

1. `src/lib/supabase.ts` — Supabase client (remember-me: localStorage vs sessionStorage)
2. `src/pages/Login.tsx` — portal picker + `signInWithPassword`
3. Route guard'ai tikrina sesiją + DB rolę
4. Tutor'iams papildomai — aktyvi Stripe prenumerata (`src/lib/subscription.ts`)

---

## 12. Feature flag'ai

**Registras:** `src/lib/featureRegistry.ts`  
**Hook:** `src/hooks/useOrgFeatures.ts` — `hasFeature('feature_id')`  
**Admin UI:** `/admin` — toggle per organizaciją (`organizations.features` JSON)

### School-related feature'ai

| ID | Paskirtis |
|----|-----------|
| `school_contract_esign` | GoSign el. parašas (vietoj rankinio) — metinėms sutartims |
| `school_extra_lessons_contract` | Papildomų pamokų sutartys (click-wrap, SHA-256, 14 d. atsisakymas). GoSign neprivalomas |
| `school_class_groups` | Klasės grupės visiems mokslo metams; nav `/school/groups` |
| `school_lesson_recordings` | Pamokų įrašai (Drive) — **parked**. Nav `/school/recordings` visada paslėptas (`SCHOOL_LESSON_RECORDINGS_NAV_READY`). Extra-lessons įrašų radio tik jei flag `true`. Demo seed = `false`. |
| `school_join_no_show` | Mokinys nepaspaudė „Prisijungti“ per 10 min → no-show (`school-join-no-show` cron) |
| `school_teacher_labels` | School portale „mokytojas“ vietoj „korepetitorius“ (`useStaffLabels`) |
| `extra_lessons_billing` | Mėnesio pabaigos papildomų pamokų sąskaitos (company/Pro Klasė srautas, ne school click-wrap) |
| `pvm_education_invoice` | PVM S.F. layout, atominė serijos numeracija, išorinių numerių rezervacija |

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

### Vizualūs skirtumai kalendoriuje

**Failas:** `src/lib/calendarSessionEventStyle.ts` — naudojamas `Calendar.tsx` ir `CompanyTvarkarastis.tsx`

| Tipas | Stilius |
|-------|---------|
| Bandomoji | violetinė |
| Įvykusi neapmokėta | amber |
| Kompensacinė (`is_makeup`) | violetinė su ↻ |
| Tutor no-show atšaukta | raudona punktyrinė ⊘ |

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
3. Tėvai `/school-extra-lessons-accept` — layout kaip `SchoolContractComplete`: PDF iframe + **Atidaryti visą PDF**, trūkstami užsakymo laukai, privalomas sąlygų checkbox, **„Užsakymas su prievole sumokėti“**. 14 d. (Vilnius): radio **Sutinku pradėti iš karto** / **Palaukti**; jei pirma pamoka jau po 14 d. — laukelis nerodomas (`na`). GET pasirašo esamą PDF arba generuoja peržiūrą (`api/_lib/extraLessonsPdf.ts`: DOCX converter, fallback paginuotas tekstinis PDF). Po laukų pakeitimo `POST preview: true` atnaujina PDF. Užšaldoma redakcija (`document_sha256`), `accepted_by_user_id`, `start_within_14_status`.
4. 14 d. **„Atsisakyti sutarties“** vs po lango **„Nutraukti sutartį“** (tėvų portalas ir token puslapis) → `extra-lessons-contract-withdraw` + pareiškimo PDF + el. pašto patvirtinimas. Mokytojo atskirai neinformuoti.
5. Mėnesio sąskaita: baziniai kreditai + extra joined pamokos (`schoolExtraLessonsBilling.ts`, cron `bill-school-extra-lessons` 1 d. 04:00 UTC). Extra pamoka mokama tik jei `school_billing_kind === 'extra'` ir mokinys prisijungė / `completed`; `no_show` neskaičiuojamas. Jei tėvas **ne** prašė ankstyvos pradžios (`start_within_14_status = no`), pamokos/sąskaita ne anksčiau nei `accepted_at + 14 d.`

**Failai:** `src/lib/extraLessonsContract.ts`, `api/_lib/extraLessonsContractShared.ts`, `api/_lib/extraLessonsPdf.ts`, `api/extra-lessons-contract-*.ts`, `api/extra-lessons-parent-contracts.ts`, `src/pages/SchoolExtraLessonsAccept.tsx`, `ParentExtraLessonsContracts.tsx`.  
**Migracija:** `20260826140000_school_extra_lessons.sql`, `20260827120000_extra_lessons_start_within_14.sql`.  
**QA seed:** `scripts/seed-school-extra-lessons-qa.mjs` (tik Demo Mokykla, ne Laisvi vaikai), `scripts/seed-school-extra-lessons-legal-qa.mjs` (stabilūs tokenai kaip `test_school.md`).  
**QA laiškai:** visi extra-lessons / school įmokų / sutarčių tėvų laiškai Demo Mokykloje eina į `alaniukasa@gmail.com` (`students.payer_email`).  
**Testai:** `tests/lib/extra-lessons-contract.test.ts`, `tests/pages/school-extra-lessons-accept.test.tsx`, `tests/lib/school-extra-lessons-billing.test.ts`, `tests/lib/extra-lessons-parent-portal.test.ts`, `tests/api/send-email-extra-lessons.test.ts`.  
**Rankinis QA:** `test_school.md`.

### Klasės grupės, įrašai, join no-show

| Flag | UI / API |
|------|----------|
| `school_class_groups` | `/school/groups` → `CompanyClassGroups.tsx` + `ClassGroupFormDialog.tsx`, `PATCH /api/school-class-groups`. Slotai: kiekviena eilutė = savaitės diena + startas (pabaiga iš grupės `duration_minutes`). Pamokos materializuojamos iš slotų (`materialize-recurring-sessions.ts`) |
| `school_lesson_recordings` | **Parked.** Nav visada off (`SCHOOL_LESSON_RECORDINGS_NAV_READY`). Kodas `/school/recordings` paliktas; tėvų įrašų radio tik jei org flag `true`. Būsimas kelias: Workspace Meet įrašas → Drive → Drive API → priskirti grupei. |
| `school_join_no_show` | `api/school-join-no-show.ts` kas 5 min — jei mokinys per 10 min nepaspaudė Join |

**Testai:** `tests/pages/company-class-groups.test.tsx`, `tests/lib/school-class-groups-recordings.test.ts`, `tests/lib/school-join-no-show.test.ts`.

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

### Buhalterijos suvestinė ir eksportas

**UI:** `src/pages/company/CompanySchoolFinanceReport.tsx`  
**Hub:** `src/pages/company/CompanyFinanceHub.tsx` (tab `report`)

**Logika:**
- `src/lib/schoolFinanceExport.ts` — eilutės, filtrai, suvestinė, CSV helper
- `src/lib/schoolFinanceXlsxExport.ts` — ExcelJS workbook su dviem lapais:
  - **Suvestinė** — suformatuota (sekcijos, rėmeliai, € formatas)
  - **Mokėjimai** — detali lentelė su autofilter

**Testai:** `tests/lib/school-finance-export.test.ts`

### Pro Klasė org_tutor (company org `isProKlaseOrg()`)

**Org ID:** `3422031d-6e21-424d-980b-35a9c6d7b8f1` (`src/lib/marketMoney.ts`)

| Sritis | Failai / pastaba |
|--------|------------------|
| Korep atlygis | `src/lib/proKlaseTutorPay.ts`, `api/_lib/proKlaseTutorPay.ts` — įvyko=valandinis, bandomoji=10€, no_show=6€ |
| Baudos | `tutor_adjustments` lentelė, `api/tutor-adjustment.ts`, admin UI `CompanyTutors.tsx` |
| Sąskaitos | `api/generate-invoice.ts` — Pro Klasė line items + adjustments |
| Korep finansai | `OrgTutorFinanceSummary.tsx` — breakdown UI |
| Statusai po pamokos | `tutor_lesson_status_confirmation` — Įvyko / Neatvyko; Atšaukti tik admin |
| Korep negali | atšaukti (`cancel-session`), trinti (`delete-session`); **ne** gali rankinio „Palikti laisvą laiką“ atšaukiant/perkeliant (`hideProKlaseOrgTutorFreeTime`) — bet **gali** kurti laisvą laiką per kalendoriaus slot drag |
| Komentarai | privalomi po kiekvienos pamokos; cron `api/proklase-lesson-comment-reminders.ts` |
| Kompensacinė pamoka | `sessions.is_makeup`, admin create `CompanyTvarkarastis.tsx` |
| Complimentary (nemokama) | `sessions.is_complimentary` — klientui vis tiek „įvyko“, bet **0 € pajamoms / paketui / mokėtojo S.F.**; API `mark-session-complimentary.ts`, UI `CompanySessions` / `CompanyTvarkarastis` |
| PVM pastaba ant S.F. | `api/_lib/proKlaseInvoice.ts` — `PVM neapmokestinama pagal LR PVMĮ 22 str.` kai Pro Klasė yra pardavėjas |
| Legal PDF | `src/lib/proKlaseLegal.ts` — `public/legal/proklase-paslaugu-teikimo-salygos.pdf`, `proklase-privatumo-politika.pdf`; tėvų registracijoje privalomas abu checkbox (`parentLegalAcceptanceMissing`) |
| Neapmokėto paketo redagavimas | `pendingPackageEdit.ts` — 7 d. langas, tik `pending`; API `update-pending-package.ts` (expirina seną Stripe checkout), `resend-package-email.ts`. QA seed: `scripts/seed-proklase-package-edit-qa.mjs` |
| Tutor no-show | admin cancel su `cancellation_reason_code=tutor_no_show` → −30€, paketas grąžinamas |

**Testai:** `tests/lib/proKlaseTutorPay.test.ts`, `tests/api/proklase-invoice.test.ts`, `tests/lib/session-complimentary.test.ts`, `tests/lib/proklase-legal.test.ts`, `tests/lib/pending-package-edit.test.ts`, `tests/api/update-pending-package.test.ts`

### Complimentary pamokos (ne tik Pro Klasė)

Admin gali pažymėti pamoką nemokama (`compSess.markComplimentary`). Klientas / statistika neskaito kainos (`sessionClientRevenueEur()`). Pažymėjus kaip neapmokėtą complimentary nuimamas.

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

---

## 16. Internacionalizacija (i18n)

| Failas | Paskirtis |
|--------|-----------|
| `src/lib/i18n/core.ts` | `t()` funkcija, 13 kalbų |
| `src/lib/i18n/lt.ts`, `en.ts`, `pl.ts`… | Žodynai |
| `src/lib/i18n/index.ts` | `useTranslation()` hook |
| `src/contexts/LocaleContext.tsx` | React provider |

**Kalbos (13):** lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no, **nl** (`src/lib/i18n/nl.ts`).

**Domenai:** `tutlio.lt` → LT, `tutlio.pl` → PL, `tutlio.com` → EN

Nauji UI tekstai — visos 13 kalbų (`tests/lib/i18n-coverage.test.ts`). Išimtys: `quiz.*` tik `lt` + `en`. Vertimas **negali** būti identiškas EN, jei raktas privalo skirtis (pvz. PL `invoiceSettings.bankName` negali būti `'Bank'`).

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

**Seed skriptai:**

| Skriptas | Paskirtis |
|----------|-----------|
| `scripts/seed-qa-demo-orgs.mjs` | 3 demo org (company, Pro Klasė, mokykla) + vartotojai |
| `scripts/seed-demo-school-finance.mjs` | Sutartys + įmokos + demo PDF (laiškai `alaniukasa@gmail.com`) |
| `scripts/seed-demo-school-filters.mjs` | Filtrų/eksporto QA duomenys (5 statusai, consent, klasės) |
| `scripts/seed-school-extra-lessons-qa.mjs` | Extra-lessons sutarčių QA (laiškai `alaniukasa@gmail.com`) |
| `scripts/seed-school-extra-lessons-legal-qa.mjs` | 14 d. atsisakymas / click-wrap QA (laiškai `alaniukasa@gmail.com`) |
| `scripts/seed-proklase-package-edit-qa.mjs` | Pro Klasė pending package edit QA |
| `scripts/seed-school-contract-completion-test.mjs` | Sutarčių completion testiniai duomenys |

**⚠️** Seed reikia `SUPABASE_SERVICE_ROLE_KEY` teisingam projektui (`cuhciqwmqfuajeeqjjbm`). Jei `node scripts/seed-*.mjs` failina su `fetch failed` — tikrink `.env` / naudok MCP `execute_sql` arba `.env.vercel.stage`.

**⚠️ Lokalus prisijungimas:** jei `.env` rodo į `xklzjhfztjxltrdkplog` — demo login **neveiks**. Sukurk `.env.local` iš `.env.vercel.stage` Supabase raktų.

---

## 19. Dažnos agentų klaidos

1. **Deploy/commit be leidimo** — vartotojas aiškiai prašo klausti prieš commit/push/deploy.
2. **PowerShell `&&`** — neveikia; naudok `;`.
3. **Placeholder ≠ reikšmė** — school grafiko formoje `100.00` placeholder neaktyvuoja mygtuko.
4. **School = company komponentai** — nekurk atskirų `School*.tsx` jei galima extend'inti `company/`.
5. **RLS** — API dažnai naudoja service role; frontend — anon key + JWT.
6. **`.env` Supabase URL** — gali būti pasenęs (`xklzjhfztjxltrdkplog`); stage/prod `cuhciqwmqfuajeeqjjbm`. Demo login reikalauja `.env.local` su teisingais raktais.
7. **Per platus diff** — vartotojas nori minimalaus, fokusuoto pakeitimo.
8. **xlsx paketas** — nenaudojamas; Excel eksportui naudok `exceljs` (`schoolFinanceXlsxExport.ts`).
9. **Temp failai** — necommitink `scripts/_*.mjs`, `scripts/_last-*.pdf`, `tmp/`, `preview-*.html`.
10. **i18n** — nauji string'ai (ne `quiz.*`) visose 13 kalbose; `quiz.*` tik lt+en. Identiskas EN vertimas kitoje kalboje krenta coverage.
11. **Lokalūs UI preview** (`/preview/assign-student-modal`, `/preview/complimentary-lesson`) — tik `import.meta.env.DEV`. Produkcijoje maršrutų nėra.
12. **Vite prod entry** — `vite.config.ts` rollup `input` turi būti **tik** `index.html`. Jei paliksi ištrintus `preview-*.html`, `npm run build` / Vercel failins (`Could not resolve entry module`).
13. **Vercel `level:error`** dažnai yra Node `[DEP0169] url.parse()` (200 OK). Tikri incidentai: `5xx` arba `[school-contract-sign-reconcile] GoSign ... timed out`.
14. **Skeno įkėlimas eSign org** — neatspėk folderio iš failo. Dialogas `shouldPromptSchoolSignedOnScan()`: Taip → `signed`, Ne → `awaiting_school_signature`. `signed_contract_url` vis tiek gali būti tėvų kopija; tikras mokyklos parašas = `schoolHasSigned()` / GoSign `school.pdf`.
15. **Extra-lessons / mokytojų sutartys** — kodas `alano-local` QA. **Nestumk** tų migracijų ir **nedeployink** į prod be atskiro patvirtinimo. Extra-lessons ≠ metinė GoSign sutartis; `kind` filtruok.
16. **Nėra `lesson_contracts` lentelės** — papildomos pamokos = `school_contracts.kind = 'extra_lessons'`.
17. **School QA laiškai** — Demo Mokykla mokėtojo el. paštas turi būti `alaniukasa@gmail.com`, ne `*@tutlio.lt` inbox'ai kurių niekas neskaito.
18. **Auth lock** — lygiagretūs `getUser()` (students + preload + analytics) → `navigatorLock` 5s + `AbortError` steal. Naudok `authSession.ts`.
19. **Įrašai parked** — negrąžink nav, kol Drive ingest. Restore: `SCHOOL_LESSON_RECORDINGS_NAV_READY = true` ir org flag.

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
| Klasės grupės | `CompanyClassGroups.tsx`, `ClassGroupFormDialog.tsx`, `schoolClassGroups.ts`, `api/school-class-groups.ts` |
| School mokiniai + filtrai | `CompanyStudents.tsx`, `schoolStudentEnrollment.ts`, `authSession.ts`, `schoolStudentsExport.ts` |
| School mokėjimai | `CompanyPayments.tsx`, `useSchoolPaymentsData.ts` |
| School finansų eksportas | `schoolFinanceExport.ts`, `schoolFinanceXlsxExport.ts` |
| Complimentary pamoka | `sessionComplimentary.ts`, `api/mark-session-complimentary.ts` |
| PVM S.F. / numeracija | `pvmEducationInvoice.ts`, `invoiceNumber.ts`, `reserve-invoice-number.ts` |
| Pro Klasė atlygis / baudos / S.F. PVM | `proKlaseTutorPay.ts`, `proKlaseInvoice.ts`, `api/tutor-adjustment.ts`, `CompanyTutors.tsx` |
| Pro Klasė legal / pending package | `proKlaseLegal.ts`, `pendingPackageEdit.ts`, `api/update-pending-package.ts` |
| Capacity / chat Broadcast | `docs/CAPACITY_1000_USERS_RUNBOOK.md`, `src/hooks/useChat.ts`, `src/lib/chatMessages.ts` |
| Tutor quiz / lead | `QuizFunnel.tsx`, `src/lib/quizFunnel.ts`, `api/landing-lead.ts` |
| Embedded prenumerata | `EmbeddedSubscriptionCheckoutDialog.tsx`, `create-subscription-checkout.ts` |
| Tutor kalendorius / laisvas laikas | `Calendar.tsx`, `AvailabilityManager.tsx`, `calendarSessionEventStyle.ts` |
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
- `docs/GOOGLE_CALENDAR_SETUP.md` — Google Calendar
- `darbai.md` — deployment į produkciją
- `services/docx-converter/README.md` — DOCX converter servisas

---

*Paskutinis atnaujinimas: 2026-08-27 (`alano-local`: extra-lessons PDF click-wrap, grupių redagavimas + keli slotai, mokinių load/auth, Įrašai parked, Demo QA tik fake org ant prod DB). Jei radai neatitikimų su kodu — prioritetas kodui, atnaujink šį failą.*
