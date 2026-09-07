# Pro Klasė — pilnas QA testavimo planas

Vienas dokumentas visiems **2026-09-03** pataisymams:

| Blokas | Kas tikrinama |
|--------|----------------|
| **A–E** | Finance bugs: atlygis, bandomosios, statistika, intake, ne-PK org |
| **F–J** | Payment payer / Mantvidas: kas moka, mokėjimo UI, Meet, laiškai, Stripe |

**DB:** stage Supabase `cuhciqwmqfuajeeqjjbm` (ne produkcija)  
**App:** http://localhost:3000 · API http://localhost:3002  
**Slaptažodis visiems QA:** `TutlioQaDemo2026!`  
**Nedėti į produkciją** be atskiro patvirtinimo.

---

## 0. Paruošimas (vieną kartą sesijos pradžioje)

### 0.1 Aplinka

1. `git checkout alano-local` (arba šaka, kurioje darai pataisymus).
2. `.env` arba `.env.local` su stage raktais:
   - `VITE_SUPABASE_URL=https://cuhciqwmqfuajeeqjjbm.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=…`
   - **Nenaudok** senojo `xklzjhfztjxltrdkplog`.
3. Laiškams (optional): `RESEND_API_KEY` + `FROM_EMAIL`.
4. Stripe checkout (optional): `TEST_STRIPE_PUBLISHABLE_KEY` + test Stripe raktai.

### 0.2 Paleisti serverį

PowerShell (`;`, ne `&&`):

```powershell
cd c:\Users\37062\Desktop\simono_school
npx kill-port 3000 3002
npm run dev
```

Turi matyti: `VITE … http://localhost:3000/` ir `API listening on http://localhost:3002`.

Jei portai užimti — uždaryk senus `node` procesus arba pakartok `npx kill-port 3000 3002`.

### 0.3 Seed (fake DB duomenys)

**Eilės tvarka:**

```powershell
node scripts/seed-qa-demo-orgs.mjs
node scripts/seed-proklase-finance-bugs-qa.mjs
node scripts/seed-proklase-payer-view-qa.mjs
```

| Skriptas | Skaito env | Ką daro |
|----------|------------|---------|
| `seed-qa-demo-orgs.mjs` | `.env` | 3 demo org + baziniai vartotojai |
| `seed-proklase-finance-bugs-qa.mjs` | `.env.local` arba `.env` | Rimantas, tarifas 0, intake, Mano Korepetitorius |
| `seed-proklase-payer-view-qa.mjs` | `.env.local` arba `.env` | Lukas + Gabija payment_payer scenarijai |

**Jei `fetch failed`:** patikrink tinklą ir Supabase raktus. Seed gali būti paleistas ir iš kitos mašinos su tais pačiais raktais.

**Po seed terminale** finance seed išspausdina **artimiausio šeštadienio datą** intake testams — užsirašyk ją.

### 0.4 Automatiniai testai (prieš naršyklę)

```powershell
npx vitest run tests/lib/proKlaseTutorPay.test.ts tests/lib/proklase-admin-finance.test.ts tests/lib/org-tutor-lesson-pay.test.ts tests/lib/proKlaseStudentLessonPlan.test.ts tests/lib/lesson-payer-view.test.ts tests/lib/session-stats.test.ts tests/lib/stats-date-range.test.ts tests/lib/picked-availability-time.test.ts tests/pages/company-students-proklase.test.tsx tests/components/time-spinner.test.tsx
```

Visi turi būti **green**.

---

## 1. Prisijungimai

| Rolė | URL | El. paštas |
|------|-----|------------|
| **Pro Klasė admin** | http://localhost:3000/company/login | `proklase.qa.admin@tutlio.lt` |
| Korep. Ona | http://localhost:3000/login | `proklase.qa.tutor1@tutlio.lt` |
| Korep. Rūta (Rimantas) | http://localhost:3000/login | `proklase.qa.tutor-rimantas@tutlio.lt` |
| Korep. admin tarifas 0 | http://localhost:3000/login | `proklase.qa.tutor-admin-zero@tutlio.lt` |
| Korep. Jonas (intake) | http://localhost:3000/login | `proklase.qa.tutor-jonas-intake@tutlio.lt` |
| **Mokinys Lukas** (payer A) | http://localhost:3000/login | `proklase.qa.student@tutlio.lt` |
| **Mokinė Gabija** (payer B) | http://localhost:3000/login | `proklase.qa.student2@tutlio.lt` |
| Paprasta įmonė admin | http://localhost:3000/company/login?org=manokorepetitorius | `manokorepetitorius.demo.admin@tutlio.lt` |
| Paprasta įmonė korep. | http://localhost:3000/login?org=manokorepetitorius | `manokorepetitorius.demo.tutor@tutlio.lt` |

**Nauji mokiniai / mokėtojas laiškams:** `alaniukasa@gmail.com`

**Admin navigacija (Pro Klasė):**

| Kelias | Kas |
|--------|-----|
| `/company/students` | Mokiniai |
| `/company/schedule` | Tvarkaraštis |
| `/company/stats` | Statistika |
| `/company/finance` | Finansai |
| `/company/tutors` | Korepetitoriai |

**Mokinio navigacija:**

| Kelias | Kas |
|--------|-----|
| `/student/sessions` | Pamokos |
| `/student/payments` | Mokėjimai |
| `/student/dashboard` | Pagrindinis |

---

## 2. Kas jau seeded (fake DB)

### A) Rimantas scenarijus — mokinys `QA Rimantas (statistika)`

Korep. **QA Tutorė Rūta (Rimantas stat.)** — tarifas **15 €**.

| Pamoka | Data | Statusas | Klientui | Korep. atlygis |
|--------|------|----------|----------|----------------|
| Regular | rugsėjo 2 d. 17:00 | `completed`, apmokėta | 27 € | **15 €** |
| Bandomoji | rugsėjo 9 d. 18:00 | `active`, apmokėta | 10 € | **0 €** (dar neįvyko) |

**Tikėtina rugsėjį:** pravesta **1**, korep. **+15 €** (ne 2 / ne 37 €).

### B) Admin korep. tarifas 0

Korep. **QA Admin korep. (tarifas 0)** — viena `completed` pamoka **33 €** klientui.

**Tikėtina:** `/finance` ir kortelė → **0 €** (ne 33 €).

### C) Intake langai (Pridėti mokinį)

- **Data:** artimiausias šeštadienis (seed output)
- **Ona:** 10:00–12:00
- **Jonas:** 14:00–16:00
- Mokinys **QA Intake tuščias (0 pamokų)** — 0 sesijų (tvarkaraščio auto-trial)

### D) Mano Korepetitorius (ne Pro Klasė)

Org **manokorepetitorius** — 1 **įvykusi** (40 € klientui) + 1 **būsima apmokėta**. Korep. tarifas **18 €**.

**Tikėtina:** pravesta +1, uždirbta **18 €**, ne 40 €.

### E) Payment payer — Lukas (Mantvidas incident)

| Laukas | Reikšmė |
|--------|---------|
| Mokinys | **Pro QA Mokinys Lukas** |
| Login | `proklase.qa.student@tutlio.lt` |
| `payment_payer` | `parent` |
| `email` = `payer_email` | **taip** (tas pats) |
| `payment_model` | `per_lesson` |
| Pamokos | kelios **neapmokėtos**, `meeting_link = null` |

**Tikėtina:** mokinys mato **kainą**, **Laukia/Apmokėta**, mygtuką **Mokėti** (ne tik „Rezervuota“).

### F) Payment payer — Gabija (skirtingas mokėtojas)

| Laukas | Reikšmė |
|--------|---------|
| Mokinys | **Pro QA Mokinė Gabija** |
| Login | `proklase.qa.student2@tutlio.lt` |
| `payment_payer` | `parent` |
| Mokėtojas | `alaniukasa@gmail.com` (≠ mokinio el.) |
| `payment_model` | `per_lesson` |

**Tikėtina:** matomas **statusas**, bet **nėra** kainos ir **Mokėti** mygtuko.

---

## 3. FINANCE — Statistika Rimantas (A)

1. Prisijunk: `proklase.qa.admin@tutlio.lt` → http://localhost:3000/company/stats
2. Filtras: **Šį mėnesį** (rugsėjis)
3. Eilutė **QA Tutorė Rūta (Rimantas stat.)**:
   - **Pamokos / pravesta:** 1
   - **Korep.:** ~15 € (ne +37 €)
4. Prisijunk kaip Rūta → `/finance` — skaičiai **sutampa** su statistika
5. Admin → **Korepetitoriai** → Rūtos kortelė → **Uždirbta** ta pati logika

| Pass | Fail |
|------|------|
| 1 pravesta, 15 € atlygis | 2 pamokos arba 37 € korep. dalis |

---

## 4. FINANCE — Admin korep. tarifas 0 (B)

1. Admin → `/company/tutors` → **QA Admin korep. (tarifas 0)**
2. Kortelė: **Uždirbta 0 €**
3. Prisijunk `proklase.qa.tutor-admin-zero@tutlio.lt` → `/finance`: **0 €**

| Pass | Fail |
|------|------|
| 0 € visur | 33 € kaip atlygis |

---

## 5. FINANCE — Pridėti mokinį, 2 slotai, varnelė (C1)

1. Admin → `/company/students` → **Pridėti mokinį**
2. Mokėtojas: `alaniukasa@gmail.com`
3. **Ieškoti pagal laisvą laiką** — data = seed šeštadienis
4. **Ona** 10:00–12:00 → slotas → **Pridėti dar vieną**
5. **Jonas** 14:00–16:00 → antras slotas
6. **Nepažymėk** „Pirma pamoka bandomoji“ → **Pridėti mokinį**

| Pass | Fail |
|------|------|
| Toast „visos pilna kaina“ | Dvi bandomosios |
| 2 regular pamokos | Du trial paketai |

7. Pakartok su **nauju** mokiniu, **pažymėk** varnelę:

| Pass | Fail |
|------|------|
| 1 bandomoji + N paprastos | 2× bandomoji |
| Tik ankstyvesnis slotas trial | Abu slotai trial |

---

## 6. FINANCE — FindLessonBookDialog (C2)

1. Admin → mokinio kortelė (Lukas) → **Ieškoti pagal laisvą laiką**

**Svarbu — du skirtingi režimai (du skirtingi amber perjungikliai):**

| Veiksmas | Rezultatas |
|----------|------------|
| **6.2 Vienkartinė bandomoji** — viršuje amber „Bandomoji pamoka“ ON, **Kartojimas OFF** | **Viena** pamoka 45 min / 10 € + pending trial paketas |
| **6.3 Pasikartojantis grafikas** — pirmiausia **Kartojimas ON** (dienos + pabaigos data), **tada** žemiau amber „Pirma pamoka bandomoji“ ON | Kelios pamokos; tik **pirmoji** bandomoji, likusios pilna kaina |

2. **6.2:** viršutinis amber perjungiklis ON, **Kartojimas OFF** → viena bandomoji

| Pass | Fail |
|------|------|
| Viena pamoka „Bandomoji pamoka“, toast „Bandomoji pamoka išsiųsta!“, modale pending paketas su žyma **Pirma pamoka bandomoji** | Kelios pamokos arba be paketo |

3. **6.3:** **Kartojimas ON** + savaitės diena + pabaigos data → **tada** amber „Pirma pamoka bandomoji“ ON (ne viršutinis vienkartinis!)

| Pass | Fail |
|------|------|
| Kelios pamokos; pirma 45 min bandomoji, kitos 60 min regular; toast apie pasikartojantį grafiką; pending 10 € trial paketas | Tik viena bandomoji be grafiko |

---

## 7. FINANCE — Tvarkaraštis (C3)

1. Admin → `/company/schedule`
2. Mokinys **QA Intake tuščias (0 pamokų)**
3. Vienkartinė pamoka — auto-trial pasiūlymas OK
4. Pasikartojantis grafikas:
   - Varnelė matoma
   - **OFF:** visos pilna kaina
   - **ON:** tik pirma sesija `is_trial`

---

## 8. FINANCE — SF peržiūra Pro Klasė

1. Admin → `/company/finance` → korep. SF (Rūta, rugsėjis)
2. Eilutės: regular **15 €**, trial **10 €**, no-show **6 €** — **ne** 27 € / 33 € kliento kainos

---

## 9. FINANCE — Paprasta įmonė (D)

1. http://localhost:3000/company/login?org=manokorepetitorius → `manokorepetitorius.demo.admin@tutlio.lt`
2. `/company/stats` → **Demo Korepetitorė Ona**: pravesta **+1** (ne +2)
3. `/company/tutors` → Ona → **Uždirbta:** 18 € (ne 40 €)

---

## 10. PAYER — Admin „Kas moka“ (F0)

1. Admin → `/company/students` → **Pridėti mokinį**
2. Skiltyje tėvų kontaktų turi būti **Kas moka už pamokas:**
   - **Mokinys** (`self`)
   - **Tėvai / mokėtojas** (`parent`)
3. Atskiriama nuo **Ką pakviesti** (tik mokinį / mokinį ir tėvą)
4. Išsaugok mokinį → DB `students.payment_payer` atitinka pasirinkimą
5. Redaguojant esamą mokinį (Lukas/Gabija) — tas pats laukas matomas

| Pass | Fail |
|------|------|
| Du atskiri pasirinkimai, išsaugoma | Nėra lauko ar default be pasirinkimo |

---

## 11. PAYER — Scenarijus A: Lukas (tas pats el. = mokėtojas)

1. http://localhost:3000/login → `proklase.qa.student@tutlio.lt`
2. **Pamokos** → http://localhost:3000/student/sessions
3. Atidaryk **neapmokėtą** pamoką:

| Pass | Fail |
|------|------|
| Kaina matoma | Tik „Rezervuota“ |
| Statusas Laukia / Apmokėta | Nieko apie mokėjimą |
| Mygtukas **Mokėti** | Nėra mygtuko |
| **„Nuoroda bus pridėta vėliau“** | „Nuoroda nepasiekiama“ (klaidos tonas) |

4. **Mokėjimai** → http://localhost:3000/student/payments

| Pass | Fail |
|------|------|
| Neapmokėtų pamokų sąrašas + „Apmokėti“ | Tuščia / tik paketai |

5. (Optional) Stripe: `4242 4242 4242 4242` → po redirect `/payment/success` **be 401**

---

## 12. PAYER — Scenarijus B: Gabija (kitas mokėtojas)

1. Atsijunk → `proklase.qa.student2@tutlio.lt`
2. **Pamokos** → atidaryk neapmokėtą pamoką:

| Pass | Fail |
|------|------|
| Statusas (Rezervuota / Laukia) matomas | Visiškai tuščia |
| **Nėra** kainos ir **Mokėti** | Rodo Mokėti mokiniui |
| Pastaba apie mokėtoją | Klaidinga suma |

---

## 13. PAYER — Admin kalendorius be Meet

1. Admin → `/company/schedule`
2. Atidark Lukas pamoką **be** `meeting_link`

| Pass | Fail |
|------|------|
| Detalėse **„Be nuorodos“** | Tuščia arba klaida |
| Event title turi „Be nuorodos“ | Nieko |

---

## 14. PAYER — El. laiško nuoroda (optional)

Jei Resend sukonfigūruotas — session reminder mygtukas turi vesti į:

`/student/sessions?sessionId=…`

**Ne** `/student/schedule?sessionId=…` (Pro Klasėje booking išjungtas).

Atidarius nuorodą — atsidaro pamokos modalas.

---

## 15. Ko nedaryti QA metu

- Necommitinti / nedployinti be leidimo
- Netrinti Naglio senų paketų produkcijoje
- **Neperrašyti** tikro Mantvido produkcijos DB
- School extra-lessons / sutartys — neliesti (`test_school.md`)

---

## 16. Triage (jei kažkas neveikia)

| Simptomas | Tikėtina priežastis | Kur žiūrėti |
|-----------|---------------------|-------------|
| 2 bandomosios kuriant mokinį | auto-trial visiems slotams | `CompanyStudents.tsx` |
| Statistika 37 € korep. | kliento kainos sumuojamos | `CompanyStats.tsx`, `proKlaseTutorPay.ts` |
| Korep. /finance 33 €, tarifas 0 | fallback į session.price | `orgTutorLessonPay.ts` |
| Pravesta 2, nors 1 įvyko | skaičiuojami apmokėti ateities slotai | `orgTutorConductedSessions.ts` |
| Lukas mato tik „Rezervuota“ | `payment_payer=parent` be same-email logikos | `lessonPayerView.ts`, `StudentSessions.tsx` |
| Mokėti flashina ir dingsta | race kol `payment_payer` null | `viewerCanPayLessons()` |
| Stripe success 401 | privalomas JWT confirm | `confirm-stripe-payment.ts` |
| Seed fetch failed | tinklas / raktai / OS env | `.env`, Supabase dashboard |
| Port 3000/3002 busy | seni node procesai | `npx kill-port 3000 3002` |

---

## 17. Greitas checklist (visas QA)

Spausk `[ ]` eidamas:

**Paruošimas**
- [ ] `npm run dev` — :3000 + :3002
- [ ] 3 seed skriptai paleisti
- [ ] Unit testai green

**Finance (A–D)**
- [ ] Statistika Rimantas: 1 pravesta, 15 €
- [ ] Admin korep. 0 €: ne 33 €
- [ ] 2 slotai be varnelės → pilna kaina
- [ ] 2 slotai su varnele → 1 bandomoji
- [ ] Tvarkaraštis recurring + varnelė
- [ ] Mano Korepetitorius: 18 €, ne 40 €

**Payment payer (E–J)**
- [ ] Admin: „Kas moka“ kuriant/redaguojant
- [ ] Lukas: kaina + Mokėti + Meet „vėliau“
- [ ] Gabija: statusas be Mokėti
- [ ] `/student/payments` — Lukas pamokos
- [ ] (Optional) Stripe success be 401

---

## 18. Seed skriptų santrauka

| Skriptas | Scenarijai |
|----------|------------|
| `scripts/seed-qa-demo-orgs.mjs` | Bazinė Pro Klasė / mokykla / MK org |
| `scripts/seed-proklase-finance-bugs-qa.mjs` | A–D (Rimantas, tarifas 0, intake, MK) |
| `scripts/seed-proklase-payer-view-qa.mjs` | E–F (Lukas, Gabija payment_payer) |

**Unit testai:** `proKlaseTutorPay`, `proklase-admin-finance`, `org-tutor-lesson-pay`, `proKlaseStudentLessonPlan`, `lesson-payer-view`

---

*Paskutinis atnaujinimas: 2026-09-03 · Sujungia finance-bugs + payment-payer (Mantvidas) QA*
