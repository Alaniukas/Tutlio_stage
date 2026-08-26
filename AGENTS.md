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
| **Mokyklos (school)** | Mokyklų adminai | Sutartys, įmokų grafikai, e-parašas (GoSign), buhalterijos eksportas |
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
| `/school/contracts` | `CompanyContracts.tsx` | Sutarčių šablonai, kūrimas, pasirašymas |
| `/school/finance?tab=payments` | `CompanyPayments.tsx` | Įmokų grafikai, mokėjimo nuorodos |
| `/school/finance?tab=report` | `CompanySchoolFinanceReport.tsx` | Suvestinė buhalterijai, filtrai, XLSX |
| `/school/finance` | `CompanyFinanceHub.tsx` | Tab hub (Mokėjimai / Suvestinė / Finansai / Sąskaitos) |
| `/school/students` | `CompanyStudents.tsx` | Mokinių CRUD |

**Vieši school flow:**
- `/school-sign` — tėvų pasirašymas
- `/school-contract-complete` — sutarties užbaigimas po pasirašymo

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

**⚠️ Dažna klaida:** `.env` gali rodyti į nebegaliojantį Supabase projektą. Stage/prod ref dažniausiai `cuhciqwmqfuajeeqjjbm`. Patikrink prieš seed'inimą.

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
- Cron job'ai: `vercel.json` → `crons` (sessions, reminders, contract reconcile, blog…)

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
| `students` | Mokiniai (su payer duomenimis, `grade`, `media_publicity_consent`) |
| `sessions` | Pamokos (`is_makeup`, `is_complimentary`) |
| `school_contract_templates` | Sutarčių šablonai (DOCX body) |
| `school_contracts` | Sutartys (status, PDF, annual_fee, `media_publicity_consent`, `completion_submitted_at`). Lokaliai WIP: `party_kind`, `counterparty_name` / `counterparty_email` |
| `school_payment_installments` | Įmokų grafikas |
| `school_contract_signatures` | E-parašo įrašai (`role`: school / parent_* / lokaliai ir `teacher`) |
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
| School sutartys | `school-contract-sign-init.ts`, `school-contract-complete.ts`, `school-contract-mark-signed.ts` (+ lokaliai untracked `school-contract-teacher-invite.ts`) |
| School mokėjimai | `pay-school-installment.ts`, `confirm-school-installment-manual.ts`, `school-installment-reminders.ts` |
| Sąskaitos | `generate-invoice.ts`, `reserve-invoice-number.ts`, `invoice-pdf.ts` |
| Stripe | `stripe-webhook.ts`, `stripe-checkout.ts`, `stripe-connect.ts`, `create-subscription-checkout.ts` |
| Lead / quiz | `landing-lead.ts` |
| Sessions/cron | `auto-complete-sessions.ts`, `send-reminders.ts`, `materialize-recurring-sessions.ts`, `mark-session-complimentary.ts` |
| Admin | `admin-organizations.ts`, `admin-statistics.ts` |
| Email | `send-email.ts` |
| SSR/SEO | `page-render.ts`, `blog-render.ts`, `sitemap.ts` |

**Bendri helperiai:** `api/_lib/schoolContractSigning.ts`, `schoolContractPdf.ts`, `schoolInstallmentStripe.ts`, `gosign.ts`, `docxConverter.ts`, `invoiceNumber.ts`, `pvmEducationInvoice.ts`, `proKlaseInvoice.ts`, `emailOrgBranding.ts`.

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
| `school_contract_esign` | GoSign el. parašas (vietoj rankinio) |
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

**Mokytojų sutartys (lokalus WIP, necommitinta, nedeployinta):**
- Failai: `CompanyStaffContracts.tsx`, `src/lib/schoolContractParty.ts`, `api/school-contract-teacher-invite.ts`, migracija `20260821150000_school_teacher_contracts.sql`
- Planuojama eiga: įkelti paruoštą PDF → mokykla pasirašo GoSign → `school-contract-teacher-invite` → mokytojas `/school-sign`
- **Dar neprijungta:** `CompanyStaffContracts` nėra importuotas `CompanyContracts` / `App.tsx`; `SchoolSign.tsx` neturi `teacher` rolės; invite handler importuoja `isTeacherContract` / `inviteTeacherToSign` iš `schoolContractSigning.ts`, kurių ten dar nėra. Migracijos **ne** stumti į prod, kol WIP neužbaigtas.

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
| Filtras | Laukas DB |
|---------|-----------|
| Klasė | `students.grade` (text, pvz. `"5 klasė"`) |
| Sutartis | `contractsByStudent` — `signed` / `pending` / `none` |
| Atvaizdas | `students.media_publicity_consent` — `agree` / `disagree` / NULL |

**Excel eksportas:** `schoolStudentsExport.ts` + `schoolStudentsXlsxExport.ts` — stulpeliai: mokinys, klasė, sutikimas, sutarties statusas, mokėtojas, kontaktai. Surūšiuota pagal `parseStudentGrade()`.

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
| Tutor no-show | admin cancel su `cancellation_reason_code=tutor_no_show` → −30€, paketas grąžinamas |

**Testai:** `tests/lib/proKlaseTutorPay.test.ts`, `tests/api/proklase-invoice.test.ts`, `tests/lib/session-complimentary.test.ts`

### Complimentary pamokos (ne tik Pro Klasė)

Admin gali pažymėti pamoką nemokama (`compSess.markComplimentary`). Klientas / statistika neskaito kainos (`sessionClientRevenueEur()`). Pažymėjus kaip neapmokėtą complimentary nuimamas.

**Failai:** `src/lib/sessionComplimentary.ts`, `src/lib/setSessionComplimentary.ts`, `api/mark-session-complimentary.ts`, migracija `20260819120000_sessions_is_complimentary.sql`.

### PVM sąskaitos ir atominė numeracija

Kai org turi `pvm_education_invoice`: S.F. layout `pvm_education`, pastabos pagal PVMĮ 22 str., serija **atominiu** `allocateInvoiceNumber()` (be lenktynių tarp dviejų adminų). Išoriniai numeriai: `/api/reserve-invoice-number`, UI `CreateInvoiceModal` / `CompanyInvoices` („Užimti numerį“).

**Failai:** `api/_lib/invoiceNumber.ts`, `api/_lib/pvmEducationInvoice.ts`, `api/reserve-invoice-number.ts`. Testai: `tests/lib/pvm-education-invoice.test.ts`.

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
- `tests/pages/company-students-filter.test.tsx` — school list filtrai
- `tests/integration/school-contract-signing-flow.test.ts`
- `tests/api/school-split-fee-installment.test.ts`
- `tests/lib/pvm-education-invoice.test.ts`, `tests/lib/session-complimentary.test.ts`, `tests/lib/quiz-funnel.test.ts`
- `tests/api/proklase-invoice.test.ts`, `tests/api/landing-lead-quiz.test.ts`, `tests/api/create-subscription-checkout.test.ts`
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

**Demo Mokykla** — tik testavimui, org ID `c3a00000-7e57-4000-8000-000000000001`

| Laukas | Reikšmė |
|--------|---------|
| Login URL (lokalus) | `http://localhost:3000/school/login` |
| El. paštas | `demo-mokykla.demo.admin@tutlio.lt` |
| Slaptažodis | `TutlioQaDemo2026!` |
| Sutartys | `/school/contracts` |
| Mokiniai | `/school/students` |

**Seed skriptai:**

| Skriptas | Paskirtis |
|----------|-----------|
| `scripts/seed-qa-demo-orgs.mjs` | 3 demo org (company, Pro Klasė, mokykla) + vartotojai |
| `scripts/seed-demo-school-finance.mjs` | Sutartys + įmokos + demo PDF |
| `scripts/seed-demo-school-filters.mjs` | Filtrų/eksporto QA duomenys (5 statusai, consent, klasės) |

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

---

## 20. Greita failų nuoroda

| Užduotis | Kur žiūrėti |
|----------|-------------|
| Naujas maršrutas | `src/App.tsx` |
| School sutartis | `CompanyContracts.tsx`, `schoolContractFilters.ts`, `api/school-contract-*.ts` |
| Skeno folderio dialogas | `shouldPromptSchoolSignedOnScan()` `schoolContractFilters.ts` |
| Mokytojų sutartys (WIP) | `CompanyStaffContracts.tsx`, `schoolContractParty.ts`, `school-contract-teacher-invite.ts` |
| School sutarčių Excel | `schoolContractsExport.ts`, `schoolContractsXlsxExport.ts` |
| School mokiniai + filtrai | `CompanyStudents.tsx`, `schoolStudentsExport.ts`, `schoolStudentsXlsxExport.ts` |
| School mokėjimai | `CompanyPayments.tsx`, `useSchoolPaymentsData.ts` |
| School finansų eksportas | `schoolFinanceExport.ts`, `schoolFinanceXlsxExport.ts` |
| Complimentary pamoka | `sessionComplimentary.ts`, `api/mark-session-complimentary.ts` |
| PVM S.F. / numeracija | `pvmEducationInvoice.ts`, `invoiceNumber.ts`, `reserve-invoice-number.ts` |
| Tutor quiz / lead | `QuizFunnel.tsx`, `src/lib/quizFunnel.ts`, `api/landing-lead.ts` |
| Embedded prenumerata | `EmbeddedSubscriptionCheckoutDialog.tsx`, `create-subscription-checkout.ts` |
| Tutor kalendorius / laisvas laikas | `Calendar.tsx`, `AvailabilityManager.tsx`, `calendarSessionEventStyle.ts` |
| Org admin tutor filtrai (scroll) | `orgUi.ts` |
| Pro Klasė atlygis / baudos / S.F. PVM | `proKlaseTutorPay.ts`, `proKlaseInvoice.ts`, `api/tutor-adjustment.ts`, `CompanyTutors.tsx` |
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
- `docs/SCHOOL_MODULE_TEST_PLAN.md` — school modulio QA
- `docs/GOOGLE_CALENDAR_SETUP.md` — Google Calendar
- `darbai.md` — deployment į produkciją
- `services/docx-converter/README.md` — DOCX converter servisas

---

*Paskutinis atnaujinimas: 2026-08-26 (skeno folderio dialogas, quiz + embedded Stripe, complimentary, atominė PVM numeracija, Pro Klasė PVM pastaba, nl i18n, Vite tik `index.html`; mokytojų sutartys — lokalus nebaigtas WIP). Jei radai neatitikimų su kodu — prioritetas kodui, atnaujink šį failą.*
