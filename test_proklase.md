# Pro Klasė — pilnas testavimo planas

Dokumentas skirtas eiti visus Pro Klasė pataisymus kitame PC (šaka `alano-local`). School extra-lessons / GoSign / klasės grupių **neliesti** — tam yra `test_school.md`.

**Šaka:** `alano-local`  
**DB:** stage Supabase `cuhciqwmqfuajeeqjjbm` (ne `tutlio.lt` produkcija)  
**App:** `http://localhost:3000` · API `http://localhost:3002`  
**QA org:** Pro Klasė QA (`proklase-qa`, ID `b0a00000-7e57-4000-8000-000000000001`)  
**Laiškai, kuriuos reikia matyti:** visada siųsk į **`alaniukasa@gmail.com`**

**Punktas „klientų mokėjimai perskaičiuojami iš kalendoriaus“ — ne šio QA.** Paketų sumos lieka kaip buvo.  
**Nedėti į produkciją** be atskiro patvirtinimo.

---

## 0. Kitas PC — paruošimas

1. `git clone` / `git fetch` ir `git checkout alano-local`.
2. `.env.local` iš stage raktų (URL turi būti `cuhciqwmqfuajeeqjjbm.supabase.co`). **Nenaudok** senojo `xklzjhfztjxltrdkplog`. Windows: jei OS env turi seną `SUPABASE_URL`, vis tiek turi laimėti `.env.local`.
3. Laiškams reikalingi `RESEND_API_KEY` ir `FROM_EMAIL` (tie patys kaip stage). Be jų UI veiks, bet Gmail nieko negaus.
4. `npm install` tada `npm run dev` (PowerShell: komandas skirk `;`, ne `&&`).
5. Seed, jei nėra QA org / vartotojų:

```bash
node scripts/seed-qa-demo-orgs.mjs
```

6. (Pasirinktinai) automatiniai testai prieš rankinį QA:

```bash
npm test -- tests/lib/student-grade.test.ts tests/lib/proklase-copy.test.ts tests/lib/continue-trial-learning.test.ts tests/lib/proklase-admin-finance.test.ts tests/lib/registration-invite-gate.test.ts tests/api/trial-reservation.test.ts tests/pages/package-payment-success.test.tsx tests/lib/i18n-coverage.test.ts
```

---

## 1. Prisijungimai

Slaptažodis visiems QA: **`TutlioQaDemo2026!`**

| Rolė | URL | El. paštas |
|------|-----|------------|
| Org admin | `/company/login` | `proklase.qa.admin@tutlio.lt` |
| Korepetitorė | `/login` | `proklase.qa.tutor1@tutlio.lt` |
| Mokinys Lukas | `/login` | `proklase.qa.student@tutlio.lt` |
| Mokinė Emilija | `/login` | `proklase.qa.student2@tutlio.lt` |

Seed mokiniai (kortelės `/company/students`):

| Mokinys | El. paštas | Klasė | Paskyra |
|---------|------------|-------|---------|
| Pro QA Mokinys Lukas | `proklase.qa.student@tutlio.lt` | 8 kl. | jau susieta |
| Pro QA Mokinė Gabija | `proklase.qa.student2@tutlio.lt` | 10 kl. | jau susieta |
| Pro QA Mokinys Nojus | *(nėra)* | 12 kl. | nesusieta — tinka naujam invite |

Šie `@tutlio.lt` adresai **nėra** Gmail. Juos naudok tik prisijungimui. **Visi nauji studento / mokėtojo / tėvų el. paštas laukai = `alaniukasa@gmail.com`.**

Navigacija (admin):

| Kelias | Kas |
|--------|-----|
| `/company/students` | Mokiniai |
| `/company/schedule` | Kalendorius (Tvarkaraštis) |
| `/company/stats` | Statistika |
| `/company/finance` | Finansai |

---

## 2. Laiškai — taisyklė visam QA

**Kiekvienam srautui, kur reikia pamatyti laišką, įrašyk `alaniukasa@gmail.com`:**

- mokinio `email`
- mokėtojo `payer_email`
- tėvų kvietimo el. paštas, jei `payment_payer = parent`

Gmail: patikrink Inbox **ir Spam**. Temų pavyzdžiai: paketo apmokėjimas, kvietimas registruotis, tėvų kvietimas.

| Kada | Tipas | Kam turi nueiti | Ko tikėtis |
|------|-------|-----------------|------------|
| Admin inicijuoja bandomąją | `prepaid_package_request` | mokėtojas = `alaniukasa@gmail.com` | Mygtukas **apmokėti** (Stripe). **Nėra** „Prisijungti į platformą“ |
| Tuo pačiu metu | `invite_email` | mokinys = `alaniukasa@gmail.com` | Nuoroda `/book/:kodas` baigti registraciją |
| Jei mokėtojas tėvas | `parent_invite` | `alaniukasa@gmail.com` | Tėvų registracija |
| Po Stripe apmokėjimo | `lesson_confirmed_tutor` | korep `proklase.qa.tutor1@tutlio.lt` | **Ne** antras registracijos kvietimas klientui |
| Pakartotinis „Siųsti kvietimą“ jau turinčiam paskyrą | — | **nieko** | Toast: paskyra jau aktyvi |

Korep patvirtinimo laiškas eina į QA tutoriaus `@tutlio.lt` (ne Gmail). Kliento Gmail po apmokėjimo **neturi** gauti antro „Baigti registraciją“. Jei reikia pamatyti patį tutor laišką — Resend dashboard, ne Gmail.

Stripe testinė kortelė: **`4242 4242 4242 4242`**, bet kokia būsima data, bet koks CVC, LT.

---

# A. Copy / UI

## A1. „bauda“ → „apmokėjimas“ (LT)

Klientas **neturi** matyti žodžio „bauda“ atšaukimo taisyklėje.

- [ ] Admin `/company/students` → mokinio kortelė: atšaukimo eilutė su `{percent} % apmokėjimas` (ne bauda).
- [ ] Mokinys `/login` kaip Lukas → pamokų / atšaukimo tekstas: **apmokėjimas**, ne bauda.
- [ ] Jei siunti pamokos patvirtinimo / apmokėjimo laišką į `alaniukasa@gmail.com` — eilutė `{percent} % apmokėjimas`.

**Neliečiama (turi likti kaip buvo):** nustatymų laukas apie baudą adminui, korep no-show −30 €, `tutor_adjustments`.

## A2. Paketo sėkmės ekranas be „Liko 0 iš 1“

Po 1 pamokos (bandomosios) Stripe:

- [ ] URL `/package-success?session_id=…`
- [ ] Tekstas: **`Paketas aktyvuotas! (DALYKO PAVADINIMAS).`**
- [ ] **Nėra** „Liko 0 iš 1 pamokų“.
- [ ] Yra mygtukas **Prisijungti** → `/login`.

## A3. Klasė „12 klas??“ → „12 klasė“

- [ ] Admin: kurk / redaguok mokinį, klasė **12** — kortelėje `12 klasė`, ne `12 klas??`.
- [ ] Seed Nojus turi `12 kl.` — dashboard / badge neturi rodyti `??`.
- [ ] Jei DB paliktum sugadintą `12 klas??`, UI vis tiek rodo **12 klasė**.

---

# B. Registracija, kai paskyra jau yra

## B1. Nesiųsti kvietimo, jei Auth jau yra

- [ ] `/company/students` → **Lukas** (jau `linked_user_id`) → **Siųsti kvietimą**.
- [ ] Toast: *„Ši paskyra jau aktyvi. Kvietimas nesiunčiamas – vartotojas turi prisijungti.“*
- [ ] `alaniukasa@gmail.com` (ir Lukas el. paštas) **negavo** naujo invite.

Naujas mokinys su **jau egzistuojančiu** el. paštu:

1. Sukurk mokinį su el. paštu `proklase.qa.student@tutlio.lt` (Luko login) **arba** pirmiau užregistruok `alaniukasa@gmail.com`, tada bandyk kviesti dar kartą.
2. Invite **nenueina**; toast apie jau aktyvią paskyrą.

## B2. Mygtukas „Prisijungti“ registracijos klaidose

**Mokinys `/book/:kodas`:**

1. Paimk Nojaus (ar naujo mokinio) invite kodą; el. paštą pakeisk į `alaniukasa@gmail.com` ir išsiųsk kvietimą **tik jei paskyros dar nėra**.
2. Užbaik registraciją su `alaniukasa@gmail.com`.
3. Atidaryk **kitą** invite (kitas mokinys) ir account žingsnyje vėl įvesk **tą patį** `alaniukasa@gmail.com`.
4. Klaida, kad el. paštas jau užimtas + mygtukas **Prisijungti** → `/login`.

**Tėvai `/parent-register`:**

1. Naujas mokinys: mokėtojas tėvas, `payer_email` = `alaniukasa@gmail.com`.
2. Užbaik tėvų registraciją (Pro Klasė: abu teisiniai checkbox).
3. Antras tėvų kvietimas tuo pačiu el. paštu → klaida + **Prisijungti**.
4. Pakartotinis tėvų kvietimas iš admin **nesiunčiamas**, jei tėvas jau registruotas.

---

# C. Bandomoji: du laiškai iš karto, registracija be apmokėjimo

Tai **pagrindinis** naujas srautas. Daryk su **nauju** mokiniu (ne Luku), kitaip invite skipins.

### Paruošimas

1. `/company/students` → **Pridėti mokinį**.
2. Vardas pvz. `QA Trial Gmail`.
3. **El. paštas ir mokėtojo el. paštas = `alaniukasa@gmail.com`.**
4. Klasė 8, korep **QA Tutorė Ona**.
5. Išsaugok. Jei auto-invite jau išsiuntė registraciją — OK (tas pats Gmail).

### C1. Sukurti bandomąją su konkrečiu laiku

**Kelias A — kalendorius (paprastesnis, seed neturi tutoriaus availability):**

1. `/company/schedule` → nauja pamoka.
2. Mokinys = `QA Trial Gmail`, dalykas **Bandomasis** (trial), kaina ~10 €, trukmė 45 min.
3. **Konkreti data/laikas** ateityje (pvz. antradienis 17:00).
4. **Nežymėk** kaip jau apmokėta.
5. Sukurti — turi iškviesti `create-trial-package` (pay email + invite).

**Kelias B — mokinio kortelė „Rasti pamoką“:**

1. Pirma: `/login` kaip korep → kalendorius → **Darbo laiko nustatymai** → pridėk savaitės langą (pvz. antd. 16:00–18:00).
2. Admin: mokinio kortelė → rasti / rezervuoti pamoką → trial slotas → patvirtinti.

### C2. Gmail iš karto (dar neapmokėta)

Per ~1 min `alaniukasa@gmail.com` turi gauti **du** laiškus:

- [ ] Apmokėjimo (`prepaid_package_request`) — tik **mokėti**, be platformos login CTA.
- [ ] Registracijos (`invite_email`) — `/book/:kodas`.

Jei mokėtojas tėvas — trečias `parent_invite`.

### C3. Registracija **be** apmokėjimo

- [ ] Iš invite laiško atidaryk `/book/:kodas`.
- [ ] Užbaik mokinio registraciją **nepaspaudęs** Stripe nuorodos.
- [ ] `/login` su `alaniukasa@gmail.com` veikia, pamoka kalendoriuje matosi (hold / bandomoji).
- [ ] Kalendoriuje **viena** bandomoji, ne serija.

### C4. Tada apmokėti; invite **nekartojamas**

- [ ] Iš pay laiško → Stripe testinė kortelė.
- [ ] `/package-success` — žr. A2.
- [ ] Gmail **negavo** antro registracijos kvietimo.
- [ ] (Resend / tutor inbox) korep gavo `lesson_confirmed_tutor`.

---

# D. „Tęsti mokymąsi“

Tik Pro Klasė admin, tik **bandomoji** pamoka (`Bandomasis` / `is_trial`).

1. `/company/schedule` → atidaryk tą bandomąją iš C.
2. Mygtukas **Tęsti mokymąsi**.
3. Toast / alert: *„Sukurta savaitinė 60 min. pamokų serija.“*
4. Kalendoriuje:
   - [ ] Pirma nuolatinė pamoka = **+7 dienos** nuo bandomosios, **ta pati savaitės diena ir HH:mm**.
   - [ ] Trukmė **60 min** (ne 45).
   - [ ] Dalykas **ne** Bandomasis (Matematika / Anglų).
   - [ ] Bandomosios datos **nėra** dublikato serijoje.
5. Mygtuką spausk **dar kartą** → *„Šiam laikui savaitinė serija jau sukurta.“* (be dublikatų).
6. School org (`/school/schedule`) šio mygtuko **nėra**.

Jei API sako *Assign a regular subject* — tutoriui turi būti ne-trial dalykas (seed: Matematika, Anglų kalba).

---

# E. Admin statistika (`/company/stats`)

Pro Klasė: **Įmonės dalis = ką klientas sumokėjo − sukauptas korep atlygis** ant **ne atšauktų** apmokėtų pamokų.

Atlygis (accrued), dar prieš `completed`:

| Pamoka | Korep kaštas |
|--------|----------------|
| Bandomoji | 10 € |
| Įprasta active/completed | tutoriaus valandinis (seed dažnai 15 €, jei nustatytas) |
| No-show | 6 € |
| Complimentary / atšaukta | 0 € |

**Kliento sumokėta** = apmokėti paketai + pavienės apmokėtos sesijos **be** paketo. **Nemažėja**, jei vėliau ištrini pamoką iš kalendoriaus (punktas 4 paliktas).

Scenarijus:

1. Užsirašyk `/company/stats` **Įmonės dalis** ir **Korepetit. dalis** prieš testą (gali būti senų duomenų).
2. Apmokėk bandomąją (C4, 10 € + mokesčiai) **arba** 8 pamokų paketą.
3. Perkrauk statistiką (jei cache — pakeisk datos filtrą / hard refresh).
4. Iš karto po apmokėjimo, **nelaukiant** kol pamoka `completed`:
   - [ ] Korep dalis jau įtraukia trial 10 € / regular rate.
   - [ ] Įmonės dalis = clientPaid − tas atlygis (ne senas `% × kiekis`).
5. Atšauk vieną **apmokėtą** būsimą pamoką:
   - [ ] Korep dalis sumažėja (ta pamoka = 0).
   - [ ] Kliento pajamos **lieka** (paketas vis dar paid).
   - [ ] Įmonės dalis **padidėja**.
6. Korep `/login` finansuose vis dar mato atlygį tik už `completed` / `no_show` — admin stats ir tutor UI skiriasi **tyčia**.

Pavyzdys iš unit testų: 8 pamokos × 15 € korep = 120, klientas 200 → įmonė 80; atšaukus 1 → korep 105, įmonė 95.

---

# F. Kas NE šio QA

- [ ] **Nekoreguok** ir nebugink school extra-lessons, GoSign, klasės grupių, enrollment filtrų.
- [ ] **Nesitikėk**, kad atšaukus pamoką kliento „sumokėta“ statistikoje nukristų iki kalendoriaus kainų sumos.
- [ ] Produkcinė Pro Klasė org `3422031d-6e21-424d-980b-35a9c6d7b8f1` — **neliesk**. Tik QA org.

---

## 3. Greitas smoke (jei mažai laiko)

1. Admin login `/company/login`.
2. Naujas mokinys, visur `alaniukasa@gmail.com`.
3. Kalendoriuje bandomoji su laiku → **2 laiškai** Gmail.
4. `/book/:kodas` registracija **be** mokėjimo.
5. Stripe → sėkmė be „Liko 0 iš 1“.
6. Gmail be antro invite.
7. **Tęsti mokymąsi** → +7 d., 60 min.
8. `/company/stats` — įmonės dalis keičiasi atšaukus apmokėtą pamoką.
9. Luko „Siųsti kvietimą“ — skip toast, be laiško.

---

## 4. Jei kažkas neveikia

| Simptomas | Ką tikrinti |
|-----------|-------------|
| Demo login neveikia | `.env.local` URL = `cuhciqwmqfuajeeqjjbm`; ne senas `xklzjhfztjxltrdkplog` |
| API kitoks projektas | `scripts/dev-api-local.ts` loge turi būti `cuhciqwmqfuajeeqjjbm.supabase.co` |
| Nėra laiškų | `RESEND_API_KEY`, `FROM_EMAIL`; Gmail Spam; ar tikrai įrašei `alaniukasa@gmail.com`, ne `@tutlio.lt` |
| Nėra invite, tik pay | mokinys jau `linked_user_id` / Auth — naudok **naują** mokinį |
| Nėra „Tęsti mokymąsi“ | ne trial dalykas, arba ne Pro Klasė QA org, arba pamoka atšaukta |
| Continue learning 400 subject | tutoriui trūksta ne-trial dalyko |
| Statistika sena | cache `company_stats` — pakeisk datos filtrą arba perloginink |
| Stripe fail | testinė `4242…`, `localhost:3000` + veikiantis API `:3002` |
